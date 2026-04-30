"""Sensor platform for MythTV."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import COORDINATOR, DOMAIN
from .coordinator import MythTVDataUpdateCoordinator
from .mythtv_api import MythTVAPI

_LOGGER = logging.getLogger(__name__)

typedef struct MythTVSensorEntityDescription(SensorEntityDescription):
    """Describes a MythTV sensor."""

    value_fn: Any = None
    extra_attrs_fn: Any = None


def _format_program(prog: dict) -> dict:
    """Convert a programme dict to a clean, serialisable summary."""
    rec = prog.get("Recording", {})
    ch = prog.get("Channel", {})
    start_ts = prog.get("StartTime") or rec.get("StartTs")
    end_ts = prog.get("EndTime") or rec.get("EndTs")
    return {
        "title": prog.get("Title", ""),
        "subtitle": prog.get("SubTitle", ""),
        "channel": ch.get("ChanNum", "") + " " + ch.get("CallSign", ""),
        "start": start_ts,
        "end": end_ts,
        "category": prog.get("Category", ""),
        "rec_status": MythTVAPI.rec_status_label(rec.get("Status", 0)),
        "rec_group": rec.get("RecGroup", ""),
        "description": prog.get("Description", "")[:200],
    }


SENSOR_DESCRIPTIONS: list[MythTVSensorEntityDescription] = [
    # ── Backend info ────────────────────────────────────────────────────────
    MythTVSensorEntityDescription(
        key="backend_hostname",
        name="Backend Hostname",
        icon="mdi:server",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda d: d.get("hostname"),
        # backend_version is now a flat string extracted in the coordinator,
        # so we no longer need to drill into the nested backend_info dict here.
        extra_attrs_fn=lambda d: {
            "version": d.get("backend_version", ""),
        },
    ),
    # ── Encoder / tuner sensors ───────────────────────────────────────────────
    MythTVSensorEntityDescription(
        key="num_encoders",
        name="Total Encoders",
        icon="mdi:video-input-component",
        native_unit_of_measurement="tuners",
        value_fn=lambda d: d.get("num_encoders"),
        extra_attrs_fn=lambda d: {
            "encoders": [
                {
                    "id": e.get("Id"),
                    "host": e.get("HostName"),
                    "state": e.get("State"),
                    "connected": e.get("Connected"),
                    "sleep_status": e.get("SleepStatus"),
                }
                for e in (d.get("encoders") or [])
            ]
        },
    ),
    MythTVSensorEntityDescription(
        key="num_recording",
        name="Active Recordings",
        icon="mdi:record-circle",
        native_unit_of_measurement="recordings",
        value_fn=lambda d: d.get("num_recording"),
        extra_attrs_fn=lambda d: {
            "recordings": [_format_program(p) for p in (d.get("currently_recording") or [])]
        },
    ),
    # ── Upcoming recordings ───────────────────────────────────────────────────
    MythTVSensorEntityDescription(
        key="upcoming_recordings_count",
        name="Upcoming Recordings",
        icon="mdi:calendar-clock",
        native_unit_of_measurement="recordings",
        value_fn=lambda d: d.get("upcoming_total"),
        extra_attrs_fn=lambda d: {
            "next_recording": _format_program(d["upcoming_programs"][0])
            if d.get("upcoming_programs")
            else None,
            "upcoming": [_format_program(p) for p in (d.get("upcoming_programs") or [])],
        },
    ),
    MythTVSensorEntityDescription(
        key="next_recording_title",
        name="Next Recording",
        icon="mdi:television-play",
        value_fn=lambda d: (d["upcoming_programs"][0].get("Title"))
        if d.get("upcoming_programs")
        else None,
        extra_attrs_fn=lambda d: _format_program(d["upcoming_programs"][0])
        if d.get("upcoming_programs")
        else {},
    ),
    MythTVSensorEntityDescription(
        key="next_recording_start",
        name="Next Recording Start",
        icon="mdi:clock-start",
        device_class="timestamp",
        value_fn=lambda d: MythTVAPI.parse_utc(
            (d["upcoming_programs"][0].get("Recording", {}) or {}).get("StartTs")
            or d["upcoming_programs"][0].get("StartTime")
        )
        if d.get("upcoming_programs")
        else None,
        extra_attrs_fn=lambda d: {},
    ),
    # ── Recorded library ──────────────────────────────────────────────────────
    MythTVSensorEntityDescription(
        key="recorded_total",
        name="Total Recordings",
        icon="mdi:filmstrip-box-multiple",
        native_unit_of_measurement="recordings",
        value_fn=lambda d: d.get("recorded_total"),
        extra_attrs_fn=lambda d: {
            "recent": [_format_program(p) for p in (d.get("recorded_programs") or [])[:5]]
        },
    ),
    MythTVSensorEntityDescription(
        key="last_recorded_title",
        name="Last Recorded",
        icon="mdi:television-classic",
        value_fn=lambda d: (d["recorded_programs"][0].get("Title"))
        if d.get("recorded_programs")
        else None,
        extra_attrs_fn=lambda d: _format_program(d["recorded_programs"][0])
        if d.get("recorded_programs")
        else {},
    ),
    # ── Scheduling ──────────────────────────────────────────────────────────
    MythTVSensorEntityDescription(
        key="num_schedules",
        name="Recording Schedules",
        icon="mdi:calendar-check",
        native_unit_of_measurement="schedules",
        value_fn=lambda d: d.get("num_schedules"),
        extra_attrs_fn=lambda d: {
            "schedules": [
                {
                    "title": s.get("Title", ""),
                    "type": s.get("Type", ""),
                    "channel": s.get("ChanId", ""),
                    "enabled": s.get("Inactive", "false") != "true",
                }
                for s in (d.get("schedules") or [])[:20]
            ]
        },
    ),
    MythTVSensorEntityDescription(
        key="num_conflicts",
        name="Recording Conflicts",
        icon="mdi:calendar-remove",
        native_unit_of_measurement="conflicts",
        value_fn=lambda d: d.get("num_conflicts"),
        extra_attrs_fn=lambda d: {
            "conflicts": [_format_program(p) for p in (d.get("conflicts") or [])]
        },
    ),
    # ── Storage ──────────────────────────────────────────────────────────────
    MythTVSensorEntityDescription(
        key="storage_groups",
        name="Storage Groups",
        icon="mdi:harddisk",
        native_unit_of_measurement="groups",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda d: len(d.get("storage_groups") or []),
        extra_attrs_fn=lambda d: {
            "storage_groups": [
                {
                    "group": sg.get("GroupName", ""),
                    "directories": sg.get("Directories", ""),
                    "used_gb": round(int(sg.get("UsedSpace", 0)) / 1024, 1),
                    "free_gb": round(int(sg.get("FreeSpace", 0)) / 1024, 1),
                    "total_gb": round(int(sg.get("TotalSpace", 0)) / 1024, 1),
                }
                for sg in (d.get("storage_groups") or [])
            ]
        },
    ),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up MythTV sensors."""
    coordinator: MythTVDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id][
        COORDINATOR
    ]
    async_add_entities(
        MythTVSensor(coordinator, description) for description in SENSOR_DESCRIPTIONS
    )


class MythTVSensor(CoordinatorEntity[MythTVDataUpdateCoordinator], SensorEntity):
    """A sensor that reads from the MythTV coordinator."""

    entity_description: MythTVSensorEntityDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: MythTVDataUpdateCoordinator,
        description: MythTVSensorEntityDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = (
            f"{coordinator.api.host}_{coordinator.api.port}_{description.key}"
        )
        self._attr_device_info = {
            "identifiers": {(DOMAIN, f"{coordinator.api.host}:{coordinator.api.port}")},
            "name": f"MythTV ({coordinator.api.host})",
            "manufacturer": "MythTV",
            "model": "Backend",
            "configuration_url": f"http://{coordinator.api.host}:{coordinator.api.port}",
        }

    @property
    def native_value(self):
        if self.entity_description.value_fn:
            try:
                return self.entity_description.value_fn(self.coordinator.data)
            except Exception as err:
                _LOGGER.debug("Error getting value for %s: %s", self.entity_description.key, err)
                return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if self.entity_description.extra_attrs_fn:
            try:
                return self.entity_description.extra_attrs_fn(self.coordinator.data) or {}
            except Exception as err:
                _LOGGER.debug("Error getting attrs for %s: %s", self.entity_description.key, err)
        return {}