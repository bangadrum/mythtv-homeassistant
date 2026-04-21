# MythTV Home Assistant Integration

A custom integration for [Home Assistant](https://www.home-assistant.io/) that connects to your **MythTV** backend via the [MythTV Services API](https://www.mythtv.org/wiki/Services_API) and exposes useful information as sensors and binary sensors.

---

## Features

| Entity | Type | Description |
| --- | --- | --- |
| Backend Connected | Binary Sensor | Whether the MythTV backend is reachable |
| Currently Recording | Binary Sensor | `on` when any tuner is actively recording |
| Recording Conflicts | Binary Sensor | `on` when scheduling conflicts exist |
| All Encoders Busy | Binary Sensor | `on` when every tuner is in use |
| Active Recordings | Sensor | Count of current recordings + details in attributes |
| Next Recording | Sensor | Title of the next scheduled recording |
| Next Recording Start | Sensor | Timestamp of the next scheduled recording |
| Upcoming Recordings | Sensor | Total count of upcoming recordings |
| Total Recordings | Sensor | Size of recorded library |
| Last Recorded | Sensor | Most recently recorded title |
| Recording Schedules | Sensor | Number of active recording rules |
| Total Encoders | Sensor | Number of capture cards |
| Storage Groups | Sensor | Count + free space per storage group directory |
| Backend Hostname | Sensor | MythTV host profile name + version |

All sensors expose rich **extra_state_attributes** (viewable in Developer Tools → States) with full programme details, schedules, encoder states, and storage group statistics.

> **Note on storage space:** The MythTV Services API (`Myth/GetStorageGroupDirs`) reports free space per directory but does not expose total or used space. The Storage Groups sensor and dashboard card therefore show free space only.

---

## Installation

### Via HACS (recommended)

1. In HACS, click **Custom repositories** and add this repo with category **Integration**.
2. Search for *MythTV* and install.
3. Restart Home Assistant.

### Manual

1. Copy the `custom_components/mythtv/` folder into your HA `config/custom_components/` directory.
2. Restart Home Assistant.

---

## Configuration

1. Go to **Settings → Devices & Services → Add Integration**.
2. Search for **MythTV**.
3. Fill in:
   * **Host** – IP address or hostname of the machine running `mythbackend`.
   * **Port** – default `6544`.
   * **Upcoming recordings to track** – how many upcoming entries to fetch (1–50, default 10).
   * **Recent recordings to track** – how many recorded entries to fetch (1–50, default 10).

> **Note:** All MythTV timestamps are UTC. Home Assistant will convert them to your local timezone automatically for `timestamp` device-class sensors.

---

## Custom Card

**Step 1** — copy the file:

```
config/www/mythtv-card.js
```

**Step 2** — register the resource in your Lovelace `configuration.yaml` or via the UI (**Settings → Dashboards → Resources**):

```yaml
resources:
  - url: /local/mythtv-card.js
    type: module
```

**Step 3** — add the card in your dashboard YAML:

```yaml
type: custom:mythtv-card
title: MythTV

# All entity IDs below are auto-detected if you used the integration as-is.
# Only override if yours differ:
connected_entity: binary_sensor.mythtv_backend_connected
recording_entity: binary_sensor.mythtv_currently_recording
upcoming_entity:  sensor.mythtv_upcoming_recordings
active_count_entity: sensor.mythtv_active_recordings
recorded_entity:  sensor.mythtv_total_recordings
encoders_entity:  sensor.mythtv_total_encoders
storage_entity:   sensor.mythtv_storage_groups
```

All entity IDs default to the names the integration creates, so in the simplest case you can just add `type: custom:mythtv-card` with no other config needed.

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
            {{ state_attr('binary_sensor.mythtv_currently_recording', 'titles') | join(', ') }}
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
            {{ states('sensor.mythtv_recording_conflicts') }} recording conflict(s) detected.
```

### Show next recording in a dashboard card

```yaml
type: entities
title: MythTV
entities:
  - entity: binary_sensor.mythtv_currently_recording
  - entity: sensor.mythtv_next_recording
  - entity: sensor.mythtv_next_recording_start
  - entity: sensor.mythtv_upcoming_recordings
  - entity: sensor.mythtv_recording_conflicts
  - entity: sensor.mythtv_active_recordings
```

---

## API Endpoints Used

| MythTV Endpoint | Purpose |
| --- | --- |
| `Myth/GetHostName` | Connectivity test + hostname |
| `Myth/GetBackendInfo` | Version info |
| `Myth/GetStorageGroupDirs` | Storage group directory free-space data |
| `Status/GetBackendStatus` | Raw backend status (retained for future use) |
| `Dvr/GetUpcomingList` | Upcoming & active recordings |
| `Dvr/GetRecordedList` | Recorded library |
| `Dvr/GetEncoderList` | Tuner/encoder states |
| `Dvr/GetRecordScheduleList` | Recording rules |
| `Dvr/GetConflictList` | Scheduling conflicts |

Data is refreshed every **60 seconds** by default.

---

## Requirements

* Home Assistant 2023.x or later
* MythTV v0.28 or later (v30+ recommended for full API coverage)
* `mythbackend` must be reachable from the Home Assistant host on port 6544
