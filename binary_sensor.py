"""Binary sensor platform for MythTV."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import COORDINATOR, DOMAIN
from .coordinator import MythTVDataUpdateCoordinator

_LOGGER = logging.getLogger(__name__)


@dataclass
class MythTVBinarySensorDescription(BinarySensorEntityDescription):
    is_on_fn: Any = None
    extra_attrs_fn: Any = None


def _fmt_conflict(prog: dict) -> dict:
    rec = prog.get("Recording", {})
    ch  = prog.get("Channel", {})
    return {
        "title":    prog.get("Title", ""),
        "subtitle": prog.get("SubTitle", ""),
        "channel":  (ch.get("ChanNum", "") + " " + ch.get("CallSign", "")).strip(),
        "start":    prog.get("StartTime") or rec.get("StartTs"),
        "end":      prog.get("EndTime")   or rec.get("EndTs"),
    }


BINARY_SENSOR_DESCRIPTIONS: list[MythTVBinarySensorDescription] = [
    MythTVBinarySensorDescription(
        key="backend_connected",
        name="Backend Connected",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        entity_category=EntityCategory.DIAGNOSTIC,
        is_on_fn=lambda d: bool(d and d.get("hostname")),
        extra_attrs_fn=lambda d: {"host": d.get("hostname", "") if d else ""},
    ),
    MythTVBinarySensorDescription(
        key="is_recording",
        name="Currently Recording",
        device_class=BinarySensorDeviceClass.RUNNING,
        icon="mdi:record-rec",
        is_on_fn=lambda d: bool(d and d.get("num_recording", 0) > 0),
        extra_attrs_fn=lambda d: {
            "active_recordings": d.get("num_recording", 0) if d else 0,
            "titles": [
                p.get("Title", "")
                for p in (d.get("currently_recording") or [])
            ] if d else [],
        },
    ),
    MythTVBinarySensorDescription(
        key="has_conflicts",
        name="Recording Conflicts",
        device_class=BinarySensorDeviceClass.PROBLEM,
        icon="mdi:calendar-alert",
        is_on_fn=lambda d: bool(d and d.get("num_conflicts", 0) > 0),
        extra_attrs_fn=lambda d: {
            "conflict_count": d.get("num_conflicts", 0) if d else 0,
            "conflicts": [
                _fmt_conflict(p) for p in (d.get("conflicts") or [])
            ] if d else [],
        },
    ),
    MythTVBinarySensorDescription(
        key="encoders_busy",
        name="All Encoders Busy",
        device_class=BinarySensorDeviceClass.OCCUPANCY,
        icon="mdi:video-input-component",
        # True only when there is at least one encoder AND none are idle.
        # State "0" = idle in the MythTV encoder State enum.
        is_on_fn=lambda d: bool(
            d
            and d.get("num_encoders", 0) > 0
            and d.get("num_idle_encoders", 0) == 0
        ),
        extra_attrs_fn=lambda d: {
            "total_encoders": d.get("num_encoders", 0)      if d else 0,
            "idle_encoders":  d.get("num_idle_encoders", 0) if d else 0,
        },
    ),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: MythTVDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id][COORDINATOR]
    async_add_entities(
        MythTVBinarySensor(coordinator, desc) for desc in BINARY_SENSOR_DESCRIPTIONS
    )


class MythTVBinarySensor(
    CoordinatorEntity[MythTVDataUpdateCoordinator], BinarySensorEntity
):
    entity_description: MythTVBinarySensorDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: MythTVDataUpdateCoordinator,
        description: MythTVBinarySensorDescription,
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
    def is_on(self) -> bool | None:
        if self.entity_description.is_on_fn:
            try:
                return self.entity_description.is_on_fn(self.coordinator.data)
            except Exception as err:
                _LOGGER.debug("is_on error for %s: %s", self.entity_description.key, err)
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if self.entity_description.extra_attrs_fn and self.coordinator.data:
            try:
                return self.entity_description.extra_attrs_fn(self.coordinator.data) or {}
            except Exception as err:
                _LOGGER.debug("attr error for %s: %s", self.entity_description.key, err)
        return {}
