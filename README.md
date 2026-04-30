# MythTV Home Assistant Integration

A custom integration for [Home Assistant](https://www.home-assistant.io/) that connects to your **MythTV** backend via the [MythTV Services API](https://wiki.mythtv.org/wiki/Category:Services_API) and exposes useful information as sensors and binary sensors.

> **Version 0.4.0** — fixes recording status codes, active recording detection, storage data source and aggregation, conflict attribute routing, and card entity defaults. See [Changelog](#changelog).

---

## Entities

| Entity | Type | Description |
|---|---|---|
| Backend Connected | Binary Sensor | Whether the MythTV backend is reachable |
| Currently Recording | Binary Sensor | `on` when any tuner is actively recording |
| Recording Conflicts | Binary Sensor | `on` when scheduling conflicts exist |
| All Encoders Busy | Binary Sensor | `on` when every tuner is in use |
| Active Recordings | Sensor | Count of current recordings + details |
| Next Recording | Sensor | Title of the next scheduled recording |
| Next Recording Start | Sensor | Timestamp of the next scheduled recording |
| Upcoming Recordings | Sensor | Total count of upcoming recordings |
| Total Recordings | Sensor | Size of the recorded library |
| Last Recorded | Sensor | Most recently recorded programme title |
| Recording Schedules | Sensor | Number of active recording rules |
| Total Encoders | Sensor | Number of capture cards + per-tuner state |
| Storage Groups | Sensor | Count + free space per storage group |
| Backend Hostname | Sensor | MythTV backend hostname + version string |

All sensors expose rich `extra_state_attributes` (viewable in Developer Tools → States).

> **Storage space note:** `Myth/GetStorageGroupDirs` reports free space per directory (`KiBFree`) but does **not** expose total or used space. Free space is the only storage metric available from the MythTV Services API. Values are shown in GiB.

---

## Repository structure

```
mythtv-homeassistant/
├── __init__.py          # Integration entry point
├── binary_sensor.py     # Binary sensors
├── config_flow.py       # UI config flow
├── const.py             # Constants
├── coordinator.py       # DataUpdateCoordinator
├── manifest.json        # HA integration manifest
├── mythtv_api.py        # Async MythTV Services API client
├── mythtv-card.js       # Lovelace dashboard card (copy to www/)
├── sensor.py            # Sensors
├── strings.json         # UI strings
└── README.md
```

---

## Installation

### Via HACS (recommended)

1. In HACS → Custom repositories → add `https://github.com/bangadrum/mythtv-homeassistant` → Integration.
2. Install **MythTV**.
3. Restart Home Assistant.

### Manual

1. Copy all `.py` files and `manifest.json` into `config/custom_components/mythtv/`.
2. Restart Home Assistant.

---

## Configuration

1. **Settings → Devices & Services → Add Integration → MythTV**
2. Fill in:
   - **Host** — IP or hostname of the machine running `mythbackend`
   - **Port** — default `6544`
   - **Upcoming recordings to track** — 1–50, default 10
   - **Recent recordings to track** — 1–50, default 10

All MythTV timestamps are UTC. Home Assistant converts them to your local timezone automatically for `timestamp` device-class sensors.

---

## Custom Lovelace Card

**Step 1** — copy `mythtv-card.js` to `config/www/mythtv-card.js`

**Step 2** — register the resource (**Settings → Dashboards → Resources**):
```yaml
resources:
  - url: /local/mythtv-card.js
    type: module
```

**Step 3** — add to a dashboard:
```yaml
type: custom:mythtv-card
title: MythTV
```

All entity IDs default to the names the integration creates. Override only if yours differ:
```yaml
type: custom:mythtv-card
title: MythTV
connected_entity:        binary_sensor.mythtv_backend_connected
recording_entity:        binary_sensor.mythtv_currently_recording
conflicts_binary_entity: binary_sensor.mythtv_recording_conflicts
conflicts_entity:        sensor.mythtv_recording_conflicts
active_count_entity:     sensor.mythtv_active_recordings
upcoming_entity:         sensor.mythtv_upcoming_recordings
recorded_entity:         sensor.mythtv_total_recordings
encoders_entity:         sensor.mythtv_total_encoders
storage_entity:          sensor.mythtv_storage_groups
hostname_entity:         sensor.mythtv_backend_hostname
```

---

## API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `Myth/GetHostName` | Connectivity test + hostname (`String` key) |
| `Myth/GetBackendInfo` | Version (`BackendInfo.Build.Version`) |
| `Myth/GetStorageGroupDirs` | Directory free-space (`StorageGroupDirList.StorageGroupDirs[].KiBFree`) |
| `Status/GetBackendStatus` | Raw status (retained for diagnostics) |
| `Dvr/GetUpcomingList` | Upcoming & active recordings (`ProgramList.Programs`) |
| `Dvr/GetRecordedList` | Recorded library (`ProgramList.Programs`) |
| `Dvr/GetEncoderList` | Tuner states (`EncoderList.Encoders[].State`) |
| `Dvr/GetRecordScheduleList` | Recording rules (`RecRuleList.RecRules`) |
| `Dvr/GetConflictList` | Scheduling conflicts (`ProgramList.Programs`) |

Data is refreshed every **60 seconds**.

---

## Requirements

- Home Assistant 2023.1 or later
- MythTV v0.28 or later (v32+ for `IgnoreDeleted`/`IgnoreLiveTV` on `GetRecordedList`)
- `mythbackend` reachable from the HA host on port 6544
- Python: `aiohttp>=3.9.0` (installed automatically)

---

## Example Automations

### Notify when a recording starts
```yaml
automation:
  - alias: "MythTV recording started"
    trigger:
      - platform: state
        entity_id: binary_sensor.mythtv_currently_recording
        to: "on"
    action:
      - service: notify.mobile_app_your_phone
        data:
          title: "🔴 MythTV Recording"
          message: >
            Now recording:
            {{ state_attr('binary_sensor.mythtv_currently_recording','titles') | join(', ') }}
```

### Alert on scheduling conflicts
```yaml
automation:
  - alias: "MythTV conflict alert"
    trigger:
      - platform: state
        entity_id: binary_sensor.mythtv_recording_conflicts
        to: "on"
    action:
      - service: persistent_notification.create
        data:
          title: "MythTV Conflict"
          message: >
            {{ state_attr('binary_sensor.mythtv_recording_conflicts','conflict_count') }}
            conflict(s): {{ state_attr('binary_sensor.mythtv_recording_conflicts','conflicts')
              | map(attribute='title') | join(', ') }}
```

---

## Changelog

### 0.4.0

- **Fixed `ACTIVE_RECORDING_STATUSES`** — the v0.3 changelog claimed the set was corrected to `{-2, -10, -15}` labelled "Recording, Tuning, Pending", but those codes are actually Conflict, Cancelled, and Tuning — the first two are NOT active tuner states. The correct set matching the MythTV `RecStatus::Type` enum is `{-6, -12, -14, -15, -16}`: CurrentRecording, TunerBusy, Pending, Tuning, OtherTuning.
- **Fixed `RECORDING_STATUS` table** — corrected the negative-code label mapping to match the actual MythTV enum. `-2` is `Conflict` (not "Recording"), `-10` is `Cancelled` (not "Tuning"), `-14` is `Pending` (not "Failed"), `-15` is `Tuning`.
- **Fixed `Myth/GetHostName` response key** — the endpoint returns `{"String": "<hostname>"}`. The code now reads `.get("String")` instead of `.get("HostName")`.
- **Fixed storage aggregation** — `Myth/GetStorageGroupDirs` returns `StorageGroupDirList.StorageGroupDirs`, not `StorageGroupDirs` at the top level. Directories are now grouped by `GroupName` with `KiBFree` summed per group and converted to GiB.
- **Fixed conflict attribute routing in card** — `conflicts_entity` in the card now defaults to `sensor.mythtv_recording_conflicts` (which has the programme list attribute), not `binary_sensor.mythtv_recording_conflicts` (which does not).
- **Fixed card `setConfig()` guard** — removed the check for the non-existent `host_entity` key that caused the card to throw on all valid configs.
- **Fixed `coordinator.py` storage key** — response key corrected from `StorageGroupDirs` (top-level) to `StorageGroupDirList.StorageGroupDirs`.
- **Fixed `config_flow.py` unique ID** — now uses `host:port` (stable) instead of the display title (changes if hostname changes).
- **Updated `manifest.json`** — added `homeassistant: "2023.1.0"` minimum version; corrected `loggers` key.
- **Version bump to 0.4.0**.

### 0.3.0

- Fixed recording status codes, storage data source, conflict attributes, manifest URLs.

### 0.2.0

- Initial public release.

---

## Troubleshooting

**Integration shows unavailable** — confirm `mythbackend` is running and reachable on the configured host and port. Check HA logs for `custom_components.mythtv`.

**All encoders / recordings show 0** — check HA logs; the most common cause is the API returning an unexpected JSON shape. Enable debug logging:
```yaml
logger:
  logs:
    custom_components.mythtv: debug
```

**Storage shows no data** — ensure `mythbackend` has storage groups configured (`mythtv-setup → Storage Groups`).

---

## License

MIT
