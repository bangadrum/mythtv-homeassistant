"""DataUpdateCoordinator for MythTV."""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DEFAULT_RECORDED_COUNT, DEFAULT_SCAN_INTERVAL, DEFAULT_UPCOMING_COUNT, DOMAIN
from .mythtv_api import (
    WILL_RECORD_STATUS,
    MythTVAPI,
    MythTVConnectionError,
)

_LOGGER = logging.getLogger(__name__)


class MythTVDataUpdateCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Fetch all data from MythTV backend in a single coordinated update."""

    def __init__(
        self,
        hass: HomeAssistant,
        api: MythTVAPI,
        upcoming_count: int = DEFAULT_UPCOMING_COUNT,
        recorded_count: int = DEFAULT_RECORDED_COUNT,
        scan_interval: int = DEFAULT_SCAN_INTERVAL,
    ) -> None:
        self.api = api
        self.upcoming_count = upcoming_count
        self.recorded_count = recorded_count
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch data from MythTV backend."""
        try:
            if self.api.api_version is None:
                await self.api.detect_api_version()

            (
                hostname,
                backend_info,
                backend_status,
                storage_dirs_raw,
                upcoming_raw,
                recorded_raw,
                encoder_raw,
                conflicts_raw,
                schedules_raw,
            ) = await _gather_safe(
                self.api.get_hostname(),
                self.api.get_backend_info(),
                self.api.get_backend_status(),
                self.api.get_storage_group_dirs(),
                self.api.get_upcoming_list(count=self.upcoming_count, show_all=True),
                self.api.get_recorded_list(count=self.recorded_count),
                self.api.get_encoder_list(),
                self.api.get_conflict_list(),
                self.api.get_record_schedule_list(),
            )

        except MythTVConnectionError as err:
            raise UpdateFailed(f"MythTV connection error: {err}") from err

        # GetUpcomingList is called with ShowAll=true so currently-recording
        # programmes are included alongside future ones. We then split into
        # two distinct lists:
        #
        #   currently_recording — status in ACTIVE_RECORDING_STATUSES
        #   upcoming_programs   — status == WILL_RECORD_STATUS only
        #
        # This keeps the "upcoming" sensor/card section clean and ensures the
        # active recordings sensor only shows programmes on a live tuner.
        # See info.md for the full status code reference.
        all_scheduled: list[dict] = (
            (upcoming_raw or {}).get("ProgramList", {}).get("Programs") or []
        )

        currently_recording = self.api.get_currently_recording(all_scheduled)

        upcoming_programs: list[dict] = [
            p for p in all_scheduled
            if _status_int(p) == WILL_RECORD_STATUS
        ]

        recorded_programs: list[dict] = (
            (recorded_raw or {}).get("ProgramList", {}).get("Programs") or []
        )
        encoders: list[dict] = (
            (encoder_raw or {}).get("EncoderList", {}).get("Encoders") or []
        )
        conflicts: list[dict] = (
            (conflicts_raw or {}).get("ProgramList", {}).get("Programs") or []
        )
        schedules: list[dict] = (
            (schedules_raw or {}).get("RecRuleList", {}).get("RecRules") or []
        )

        num_encoders = len(encoders)
        num_recording = len(currently_recording)
        # Encoder State "0" = idle in the MythTV encoder state enum.
        num_idle = sum(1 for e in encoders if str(e.get("State", "0")) == "0")

        # LiveTV detection: encoder is active (State != 0) AND the embedded
        # Recording block has RecGroup == "LiveTV". This is the only reliable
        # way to detect LiveTV — it does not appear in GetUpcomingList.
        # RecordId == 0 and RecType == 0 also characterise LiveTV recordings
        # but RecGroup is the clearest signal.
        live_tv_streams: list[dict] = []
        for enc in encoders:
            if str(enc.get("State", "0")) == "0":
                continue
            rec = enc.get("Recording", {})
            if not isinstance(rec, dict):
                continue
            rec_rec = rec.get("Recording", {})
            if not isinstance(rec_rec, dict):
                continue
            if rec_rec.get("RecGroup") == "LiveTV":
                ch = rec.get("Channel", {})
                live_tv_streams.append({
                    "encoder_id":   enc.get("Id"),
                    "encoder_name": enc.get("HostName", ""),
                    "title":        rec.get("Title", ""),
                    "subtitle":     rec.get("SubTitle", ""),
                    "channel":      (
                        ch.get("ChanNum", "") + " " + ch.get("CallSign", "")
                    ).strip(),
                    "channel_name": ch.get("ChannelName", ""),
                    "start":        rec.get("StartTime"),
                    "end":          rec.get("EndTime"),
                })

        # Myth/GetStorageGroupDirs response shape:
        #   {"StorageGroupDirList": {"StorageGroupDirs": [...]}}
        # Each entry: Id, GroupName, HostName, DirName, DirRead, DirWrite, KiBFree.
        # Total/used space is NOT available from this endpoint or any other.
        raw_sgdirs = (
            (storage_dirs_raw or {})
            .get("StorageGroupDirList", {})
            .get("StorageGroupDirs") or []
        )
        if isinstance(raw_sgdirs, dict):
            # Single-entry backends may return a dict instead of a list.
            raw_sgdirs = [raw_sgdirs]

        group_map: dict[str, dict] = {}
        for d in raw_sgdirs:
            gname = d.get("GroupName", "Default")
            kib_free = int(d.get("KiBFree", 0))
            if gname not in group_map:
                group_map[gname] = {
                    "group":       gname,
                    "free_gb":     round(kib_free / (1024 * 1024), 2),
                    "directories": [d.get("DirName", "")],
                    "dir_write":   d.get("DirWrite", True),
                }
            else:
                group_map[gname]["free_gb"] = round(
                    group_map[gname]["free_gb"] + kib_free / (1024 * 1024), 2
                )
                group_map[gname]["directories"].append(d.get("DirName", ""))
        storage_groups = list(group_map.values())

        backend_version: str = (
            (backend_info or {})
            .get("BackendInfo", {})
            .get("Build", {})
            .get("Version", "")
        )

        return {
            "hostname":           hostname or "",
            "backend_version":    backend_version,
            "backend_status":     backend_status or {},
            "upcoming_programs":  upcoming_programs,
            "upcoming_total":     len(upcoming_programs),
            "currently_recording": currently_recording,
            "recorded_programs":  recorded_programs,
            "recorded_total":     int(
                (recorded_raw or {}).get("ProgramList", {}).get("TotalAvailable", 0)
            ),
            "encoders":           encoders,
            "num_encoders":       num_encoders,
            "num_recording":      num_recording,
            "num_idle_encoders":  num_idle,
            "conflicts":          conflicts,
            "num_conflicts":      len(conflicts),
            "schedules":          schedules,
            "num_schedules":      len(schedules),
            "storage_groups":     storage_groups,
            "live_tv_streams":    live_tv_streams,
            "num_live_tv":        len(live_tv_streams),
        }


def _status_int(prog: dict) -> int | None:
    """Return Recording.Status as an int, or None if missing/unparseable."""
    raw = prog.get("Recording", {}).get("Status")
    if raw is None:
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


async def _gather_safe(*coros):
    """Run coroutines concurrently; re-raise MythTVConnectionError if any fails."""
    results = await asyncio.gather(*coros, return_exceptions=True)
    for r in results:
        if isinstance(r, MythTVConnectionError):
            raise r
        if isinstance(r, Exception):
            _LOGGER.warning("Non-fatal MythTV API error: %s", r)
    return [None if isinstance(r, Exception) else r for r in results]
