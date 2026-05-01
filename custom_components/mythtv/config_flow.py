"""Config flow for MythTV integration."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

from .const import (
    CONF_HOST,
    CONF_PORT,
    CONF_RECORDED_COUNT,
    CONF_UPCOMING_COUNT,
    DEFAULT_PORT,
    DEFAULT_RECORDED_COUNT,
    DEFAULT_UPCOMING_COUNT,
    DOMAIN,
)
from .mythtv_api import MythTVAPI, MythTVConnectionError

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_HOST): str,
        vol.Optional(CONF_PORT, default=DEFAULT_PORT): int,
        vol.Optional(CONF_UPCOMING_COUNT, default=DEFAULT_UPCOMING_COUNT): vol.All(
            int, vol.Range(min=1, max=50)
        ),
        vol.Optional(CONF_RECORDED_COUNT, default=DEFAULT_RECORDED_COUNT): vol.All(
            int, vol.Range(min=1, max=50)
        ),
    }
)


class MythTVConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for MythTV."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST]
            port = user_input[CONF_PORT]

            # Use host:port as the stable unique ID — not the display title,
            # which would change if the backend hostname changes.
            await self.async_set_unique_id(f"{host}:{port}")
            self._abort_if_unique_id_configured()

            api = MythTVAPI(host=host, port=port)
            try:
                hostname = await api.get_hostname()
                if not hostname:
                    errors["base"] = "cannot_connect"
                else:
                    return self.async_create_entry(
                        title=f"MythTV ({hostname})",
                        data=user_input,
                    )
            except MythTVConnectionError:
                errors["base"] = "cannot_connect"
            except Exception:  # noqa: BLE001
                errors["base"] = "unknown"
            finally:
                await api.close()

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )
