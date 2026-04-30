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
# Source: MythTV RecStatus::Type enum (libs/libmythtv/recordingtypes.h).
#
# IMPORTANT: The changelog entry for v0.3 claimed ACTIVE_RECORDING_STATUSES was
# corrected to {-2, -10, -15} (labelled "Recording, Tuning, Pending"), but this is
# wrong — those labels do not match the actual enum values. The correct mapping,
# verified against the MythTV source and the official Dvr/RecStatusToString API, is:
#
#   -2  = Conflict        (NOT "Recording")
#   -10 = Cancelled       (NOT "Tuning")
#   -15 = Tuning          (NOT "Pending")  ← the name happens to be right but
#                                            -14 is Pending, -15 is Tuning
#
# The previous correct set {-6, -14, -16} was:
#   -6  = CurrentRecording  ✓ active
#   -14 = Pending           ✓ active (awaiting tuner start)
#   -16 = OtherTuning       ✓ active
#
# Corrected ACTIVE_RECORDING_STATUSES below restores these and adds:
#   -15 = Tuning            (actively sending signal to tuner)
#   -12 = TunerBusy         (tuner occupied e.g. by LiveTV)
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
    -2:  "Conflict",
    -1:  "Overlap",
    # ── Zero / positive: rule-match / scheduler-decision codes ───────────
    0:  "Unknown",
    1:  "ManualOverride",
    2:  "PreviousRecording",
    3:  "CurrentRecording",
    4:  "EarlierShowing",
    5:  "NeverRecord",
    6:  "Offline",
    7:  "AbortedRecording",
    8:  "WillRecord",
    10: "DontRecord",
    11: "MissedFuture",
    12: "Tuning",
    13: "Failed",
}

# Statuses that mean "a tuner is actively occupied right now".
#   -6  CurrentRecording  — recording to disk
#   -12 TunerBusy         — occupied by LiveTV or another process
#   -14 Pending           — tuner allocated, recording imminent
#   -15 Tuning            — actively tuning
#   -16 OtherTuning       — another encoder in tuning state
#
# NOT included: -2 Conflict, -10 Cancelled — these are scheduler decisions,
# not evidence that a tuner is currently active.
ACTIVE_RECORDING_STATUSES = {-6, -12, -14, -15, -16}


class MythTVConnectionError(Exception):
    """Raised when connection to MythTV backend fails."""


class MythTVAPI:
    """Async client for the MythTV Services API."""

    def __init__(
        self,
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

    # ── Version detection ──────────────────────────────────────────────

    async def detect_api_version(self) -> int:
        """Detect backend API version and cache it.

        Parses the major version from Myth/GetBackendInfo, e.g.:
          "v32.20220201-1" → 32
          "0.28.1"         → 28  (legacy dotted format)
        Falls back to 31 (safe conservative default) on any parse error.
        """
        try:
            info = await self.get_backend_info()
            version_str: str = (
                info.get("BackendInfo", {})
                .get("Build", {})
                .get("Version", "")
            )
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
        return self._api_version

    # ── Myth service ───────────────────────────────────────────────────

    async def get_hostname(self) -> str:
        """Return the backend hostname string.

        Myth/GetHostName returns {"String": "<hostname>"}.
        """
        data = await self._get("Myth/GetHostName")
        return data.get("String", "")

    async def get_backend_info(self) -> dict:
        return await self._get("Myth/GetBackendInfo")

    async def get_storage_group_dirs(self) -> dict:
        """Fetch storage group directory list from Myth/GetStorageGroupDirs.

        Returns the full response dict. The coordinator extracts
        data["StorageGroupDirList"]["StorageGroupDirs"].

        Note: This endpoint returns per-directory metadata including KiBFree
        (free space in KiB). It does NOT return total or used space — those
        are not exposed by any Services API endpoint.

        API params available: GroupName, HostName (both optional).
        We omit them to fetch all groups on all hosts.
        """
        return await self._get("Myth/GetStorageGroupDirs")

    # ── Status service ─────────────────────────────────────────────────

    async def get_backend_status(self) -> dict:
        return await self._get("Status/GetBackendStatus")

    # ── DVR service ────────────────────────────────────────────────────

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
        if self._api_version is not None and self._api_version >= RECORDED_LIST_FILTER_MIN_VERSION:
            params["IgnoreDeleted"] = "true" if ignore_deleted else "false"
            params["IgnoreLiveTV"] = "true" if ignore_live_tv else "false"
        elif self._api_version is None:
            _LOGGER.debug(
                "API version unknown; omitting IgnoreDeleted/IgnoreLiveTV"
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
        params: dict[str, Any] = {
            "Count": count,
            "StartIndex": start_index,
        }
        if record_id is not None:
            params["RecordId"] = record_id
        return await self._get("Dvr/GetConflictList", params)

    # ── Helpers ────────────────────────────────────────────────────────

    async def test_connection(self) -> bool:
        try:
            await self.get_hostname()
            return True
        except MythTVConnectionError:
            return False

    def get_currently_recording(self, upcoming_programs: list[dict]) -> list[dict]:
        """Filter upcoming programmes to those actively occupying a tuner."""
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
