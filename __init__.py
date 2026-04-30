"""The MythTV integration."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from .const import (
    API,
    CONF_HOST,
    CONF_PORT,
    CONF_RECORDED_COUNT,
    CONF_UPCOMING_COUNT,
    COORDINATOR,
    DEFAULT_PORT,
    DEFAULT_RECORDED_COUNT,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_UPCOMING_COUNT,
    DOMAIN,
    PLATFORMS,
)
from .coordinator import MythTVDataUpdateCoordinator
from .mythtv_api import MythTVAPI, MythTVConnectionError

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up MythTV from a config entry."""
    host           = entry.data[CONF_HOST]
    port           = entry.data.get(CONF_PORT,           DEFAULT_PORT)
    upcoming_count = entry.data.get(CONF_UPCOMING_COUNT, DEFAULT_UPCOMING_COUNT)
    recorded_count = entry.data.get(CONF_RECORDED_COUNT, DEFAULT_RECORDED_COUNT)

    api = MythTVAPI(host=host, port=port)

    # Quick connectivity check before creating the coordinator.
    try:
        if not await api.test_connection():
            raise ConfigEntryNotReady(f"Cannot reach MythTV backend at {host}:{port}")
    except MythTVConnectionError as err:
        raise ConfigEntryNotReady(f"MythTV connection failed: {err}") from err

    coordinator = MythTVDataUpdateCoordinator(
        hass,
        api=api,
        upcoming_count=upcoming_count,
        recorded_count=recorded_count,
        scan_interval=DEFAULT_SCAN_INTERVAL,
    )

    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        API:         api,
        COORDINATOR: coordinator,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        data = hass.data[DOMAIN].pop(entry.entry_id)
        await data[API].close()
    return unload_ok
