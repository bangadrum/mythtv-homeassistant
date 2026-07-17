"""MythTV Services API client."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

# Minimum API version that supports IgnoreDeleted / IgnoreLiveTV on GetRecordedList.
RECORDED_LIST_FILTER_MIN_VERSION = 32

# Recording-status codes verified directly from Dvr/RecStatusToString on a live
# MythTV v34 backend (loop −20..20). See info.md for the full reference table and
# the history of how these codes changed between v31/v32/v33 and v34.
#
# v34 scheme:
#   Negative = active / terminal scheduler outcomes
#   Zero     = not recording
#   Positive = scheduler decision reasons (will NOT record this showing)
RECORDING_STATUS: dict[int, str] = {
    # ── Negative: active / terminal outcomes ──────────────────────────
    -15: "Pending",
    -14: "Failing",
    -11: "MissedFuture",
    -10: "Tuning",
    -9:  "RecorderFailed",
    -8:  "TunerBusy",
    -7:  "LowDiskSpace",
    -6:  "ManualCancel",
    -5:  "Missed",
    -4:  "Aborted",
    -3:  "Recorded",
    -2:  "Recording",
    -1:  "WillRecord",
    # ── Zero: not recording ───────────────────────────────────────────
    0:   "NotRecording",
    # ── Positive: scheduler decision reasons (will NOT record) ────────
    1:   "DontRecord",
    2:   "PreviouslyRecorded",
    3:   "CurrentlyRecorded",
    4:   "EarlierShowing",
    5:   "MaxRecordings",
    6:   "NotListed",
    7:   "Conflicting",
    8:   "LaterShowing",
    9:   "Repeat",
    10:  "Inactive",
    11:  "NeverRecord",
    12:  "RecorderOffLine",
}

# Statuses that mean a tuner is actively occupied right now (v34 verified
# against MythTV's own RecStatus reference: https://www.mythtv.org/wiki/Recording_Status).
#   -2  Recording   — actively writing to disk
#   -10 Tuning      — tuner is acquiring signal
#   -14 Failing     — recording in progress but with errors
#   -15 Pending     — tuner allocated, start imminent
#
# TunerBusy (-8) is deliberately EXCLUDED: per MythTV's own docs it means
# "This showing was not recorded because the recorder was already in use" —
# i.e. it's a terminal "lost the conflict" outcome for *this* scheduled
# showing, not a sign that this showing is occupying a tuner. Including it
# previously caused programmes that did NOT record to show up as active.
#
# WillRecord (-1) is NOT included — future schedule, not yet occupying a tuner.
ACTIVE_RECORDING_STATUSES: frozenset[int] = frozenset({-2, -10, -14, -15})

# WillRecord status code (v34).
WILL_RECORD_STATUS = -1


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
          "v34.20220913-1" → 34
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

        Response shape: {"StorageGroupDirList": {"StorageGroupDirs": [...]}}
        Each entry: Id, GroupName, HostName, DirName, DirRead, DirWrite, KiBFree.
        KiBFree is free space in KiB. Total/used space is not available from
        the Services API.
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
            _LOGGER.debug("API version unknown; omitting IgnoreDeleted/IgnoreLiveTV")
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

    def get_currently_recording(self, programs: list[dict]) -> list[dict]:
        """Filter a programme list to those actively occupying a tuner.

        Checks Recording.Status against ACTIVE_RECORDING_STATUSES.
        The status field arrives as a string from the JSON response.
        """
        result = []
        for prog in programs:
            raw = prog.get("Recording", {}).get("Status")
            if raw is None:
                continue
            try:
                if int(raw) in ACTIVE_RECORDING_STATUSES:
                    result.append(prog)
            except (ValueError, TypeError):
                _LOGGER.debug("Unexpected Recording.Status value: %r", raw)
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
        try:
            return RECORDING_STATUS.get(int(code), f"Status({code})")
        except (ValueError, TypeError):
            return f"Status({code})"
