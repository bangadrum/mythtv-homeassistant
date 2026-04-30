"""MythTV Services API client."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

# Minimum API version that supports IgnoreDeleted / IgnoreLiveTV on GetRecordedList.
# These params were added in v32; on v31 and earlier they are silently ignored or
# may cause unexpected behaviour.
RECORDED_LIST_FILTER_MIN_VERSION = 32

# Recording-status codes (negative = scheduler outcome, positive = rule-match reason).
# Source: MythTV wiki Services API documentation and RecStatus::Type enum
# (libs/libmythtv/recordingtypes.h).
# Negative codes are the ones actually returned in Upcoming/Conflict lists.
RECORDING_STATUS: dict[int, str] = {
    # ── Negative: scheduler outcome codes ────────────────────────────────
    -17: "OtherRecording",
    -16: "OtherTuning",
    -15: "Tuning",
    -14: "Pending",
    -13: "Failed",
    -12: "TunerBusy",
    -11: "LowDiskSpace",
    -10: "Cancelled",
    -9:  "Missed",
    -8:  "Aborted",
    -7:  "Recorded",
    -6:  "CurrentRecording",
    -5:  "EarlierShowing",
    -4:  "TooManyRecordings",
    -3:  "NotListed",
    -2:  "Recording",
    -1:  "Overlap",
    # ── Zero / positive: rule-match / scheduler-decision codes ───────────
    0:  "Unknown",
    1:  "ManualOverride",
    2:  "PreviousRecording",
    3:  "CurrentRecording",   # rule matched because currently recording
    4:  "EarlierShowing",     # rule matched because an earlier showing will record
    5:  "NeverRecord",
    6:  "Offline",
    7:  "AbortedRecording",
    8:  "WillRecord",
    # NOTE: 9 is not a defined status in any released MythTV version (v31-v33).
    # It has been removed to avoid confusion with 0 ("Unknown").
    10: "DontRecord",
    11: "MissedFuture",       # rule-match variant
    12: "Tuning",             # rule-match variant
    13: "Failed",             # rule-match variant
}

# Statuses that mean "a tuner is actively occupied right now".
# -2  Recording (actively recording to disk)
# -6  CurrentRecording (recording, variant)
# -10 Cancelled (pending assignment)
# -12 TunerBusy (tuner occupied, e.g. by LiveTV)
# -14 Pending (awaiting tuner)
# -15 Tuning (actively tuning)
# -16 OtherTuning (another encoder tuning)
ACTIVE_RECORDING_STATUSES = {-2, -6, -10, -12, -14, -15, -16}


class MythTVConnectionError(Exception):
    """Raised when connection to MythTV backend fails."""


class MythTVAPI:
    """Async client for the MythTV Services API."""

    def __init__(self,
        host: str,
        port: int = 6544,
        session: aiohttp.ClientSession | None = None,
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self._base_url = f"http://{host}:{port}"
        self._session = session
        self._auth = (
            aiohttp.BasicAuth(username, password)
            if username and password
            else None
        )
        self._owns_session = session is None
        # Populated after a successful detect_api_version() call.
        # Used to gate v32-only parameters such as IgnoreDeleted / IgnoreLiveTV.
        self._api_version: int | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(auth=self._auth)
        return self._session

    async def close(self) -> None:
        if self._owns_session and self._session and not self._session.closed:
            await self._session.close()

    async def _get(self, endpoint: str, params: dict | None = None) -> dict:
        session = await self._get_session()
        url = f"{self._base_url}/{endpoint}"
        try:
            async with session.get(
                url,
                params=params,
                timeout=aiohttp.ClientTimeout(total=15),
                headers={"Accept": "application/json"},
            ) as resp:
                if resp.status == 200:
                    return await resp.json(content_type=None)
                raise MythTVConnectionError(f"HTTP {resp.status} from {url}")
        except aiohttp.ClientConnectorError as err:
            raise MythTVConnectionError(
                f"Cannot connect to MythTV at {self._base_url}: {err}"
            ) from err
        except asyncio.TimeoutError as err:
            raise MythTVConnectionError(
                f"Timeout connecting to MythTV at {self._base_url}"
            ) from err

    # ── Version detection ─────────────────────────────────────────────────

    async def detect_api_version(self) -> int:
        """Detect the backend API version and cache it.

        Parses the major version from the BuildVersion string returned by
        Myth/GetBackendInfo (e.g. "v32.20220201-1" → 32, "0.28.1" → 28).
        Falls back to 31 (a safe conservative assumption) on any parse error.
        """
        try:
            info = await self.get_backend_info()
            version_str: str = (
                info.get("BackendInfo", {})
                .get("Build", {})
                .get("Version", "")
            )
            # Strip a leading 'v' and take the first numeric component.
            version_str = version_str.lstrip("v")
            major = int(version_str.split(".")[0])
            self._api_version = major
            _LOGGER.debug("MythTV API version detected: %d", major)
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning(
                "Could not detect MythTV API version, assuming v31: %s", err
            )
            self._api_version = 31
        return self._api_version

    @property
    def api_version(self) -> int | None:
        """Return the cached API version (None if not yet detected)."""
        return self._api_version

    # ── Myth service ──────────────────────────────────────────────────────

    async def get_hostname(self) -> str:
        data = await self._get("Myth/GetHostName")
        return data.get("String", "")

    async def get_backend_info(self) -> dict:
        return await self._get("Myth/GetBackendInfo")

    async def get_storage_group_dirs(self) -> dict:
        """Fetch storage group directories and free-space information.
        
        Uses the official MythTV Services API endpoint Myth/GetStorageGroupDirs
        as documented at https://wiki.mythtv.org/wiki/Services_API
        """
        return await self._get("Myth/GetStorageGroupDirs")

    # get_connection_info() has been removed: it required a PIN that the
    # integration never prompted for, and the result was never used anywhere.
    # If PIN-authenticated connection info is needed in future, add it back
    # with a 'pin' parameter wired through config_flow.

    # ── Status service ────────────────────────────────────────────────────

    async def get_backend_status(self) -> dict:
        return await self._get("Status/GetBackendStatus")

    # ── DVR service ───────────────────────────────────────────────────────

    async def get_recorded_list(
        self,
        count: int = 20,
        start_index: int = 0,
        descending: bool = True,
        rec_group: str | None = None,
        ignore_deleted: bool = True,
        ignore_live_tv: bool = True,
    ) -> dict:
        params: dict[str, Any] = {
            "Count": count,
            "StartIndex": start_index,
            "Descending": "true" if descending else "false",
        }
        if rec_group:
            params["RecGroup"] = rec_group

        # IgnoreDeleted and IgnoreLiveTV were added in v32.
        # Only send them if the API version is known to support them, to avoid
        # silently broken behaviour on v31 and earlier backends.
        if self._api_version is not None and self._api_version >= RECORDED_LIST_FILTER_MIN_VERSION:
            params["IgnoreDeleted"] = "true" if ignore_deleted else "false"
            params["IgnoreLiveTV"] = "true" if ignore_live_tv else "false"
        elif self._api_version is None:
            # Version not yet detected; omit the params to be safe.
            _LOGGER.debug(
                "API version unknown; omitting IgnoreDeleted/IgnoreLiveTV from GetRecordedList"
            )

        return await self._get("Dvr/GetRecordedList", params)

    async def get_upcoming_list(
        self,
        count: int = 20,
        start_index: int = 0,
        show_all: bool = False,
        rec_status: int | None = None,
        record_id: int | None = None,
    ) -> dict:
        """Fetch the upcoming recordings list.

        Args:
            count:       Maximum number of programmes to return.
            start_index: Zero-based offset for pagination.
            show_all:    If True, include all statuses (not just WillRecord).
            rec_status:  Optional RecStatus integer to filter server-side.
                         Use this instead of client-side filtering where possible.
            record_id:   Optional recording-rule ID to filter server-side.
        """
        params: dict[str, Any] = {
            "Count": count,
            "StartIndex": start_index,
            "ShowAll": "true" if show_all else "false",
        }
        if rec_status is not None:
            params["RecStatus"] = rec_status
        if record_id is not None:
            params["RecordId"] = record_id
        return await self._get("Dvr/GetUpcomingList", params)

    async def get_encoder_list(self) -> dict:
        return await self._get("Dvr/GetEncoderList")

    async def get_record_schedule_list(
        self,
        count: int = 500,
        start_index: int = 0,
    ) -> dict:
        """Fetch the list of recording rules.

        A Count cap is applied (default 500) to avoid unbounded responses on
        backends with large rule sets.  Pagination is supported via start_index.
        """
        params: dict[str, Any] = {
            "Count": count,
            "StartIndex": start_index,
        }
        return await self._get("Dvr/GetRecordScheduleList", params)

    async def get_conflict_list(
        self,
        count: int = 200,
        start_index: int = 0,
        record_id: int | None = None,
    ) -> dict:
        """Fetch the scheduling conflict list.

        Args:
            count:       Maximum number of conflicts to return (default 200).
            start_index: Zero-based offset for pagination.
            record_id:   Optional recording-rule ID to filter conflicts.
        """
        params: dict[str, Any] = {
            "Count": count,
            "StartIndex": start_index,
        }
        if record_id is not None:
            params["RecordId"] = record_id
        return await self._get("Dvr/GetConflictList", params)

    async def get_expiring_list(self, count: int = 10) -> dict:
        return await self._get("Dvr/GetExpiringList", {"Count": count})

    async def get_title_info_list(self) -> dict:
        return await self._get("Dvr/GetTitleInfoList")

    # ── Channel service ───────────────────────────────────────────────────

    async def get_channel_info_list(self, only_visible: bool = True) -> dict:
        return await self._get(
            "Channel/GetChannelInfoList",
            {"OnlyVisible": "true" if only_visible else "false"},
        )

    # ── Helpers ────────────────────────────────────────────────────────────

    async def test_connection(self) -> bool:
        try:
            await self.get_hostname()
            return True
        except MythTVConnectionError:
            return False

    def get_currently_recording(self, upcoming_programs: list[dict]) -> list[dict]:
        """Filter upcoming programmes to those currently occupying a tuner.

        Checks against ACTIVE_RECORDING_STATUSES which includes:
          -2  Recording (actively recording to disk)
          -6  CurrentRecording (variant)
          -10 Cancelled (pending)
          -12 TunerBusy (e.g. LiveTV)
          -14 Pending (awaiting tuner)
          -15 Tuning (actively tuning)
          -16 OtherTuning (another encoder tuning)
        """
        result = []
        for prog in upcoming_programs:
            code = prog.get("Recording", {}).get("Status")
            if code is not None and int(code) in ACTIVE_RECORDING_STATUSES:
                result.append(prog)
        return result

    @staticmethod
    def parse_utc(ts: str | None) -> datetime | None:
        if not ts:
            return None
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(ts, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

    @staticmethod
    def rec_status_label(code: int | str) -> str:
        return RECORDING_STATUS.get(int(code), f"Status({code})")
