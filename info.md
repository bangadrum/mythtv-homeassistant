# MythTV Recording Status Codes

This document records all known `Recording.Status` codes returned by the
MythTV Services API (`Dvr/GetUpcomingList`, `Dvr/GetConflictList`, etc.),
verified directly from a live **MythTV v34** backend using
`Dvr/RecStatusToString` for every integer in the range −20..20.

> **Important:** The status code scheme changed significantly between v31/v32/v33
> and v34. Documentation for earlier versions (including the official wiki pages
> for API parameters v31–v33) described a different mapping where negative codes
> were scheduler decisions and positive codes were active/terminal states. In v34
> this is **reversed**. Do not rely on pre-v34 documentation for status codes.

---

## Complete v34 Status Code Table

| Code | `StatusName` (API) | Meaning | Active? |
|-----:|---|---|:---:|
| **−15** | `Pending` | Tuner allocated; recording imminent | ✅ |
| **−14** | `Failing` | Recording in progress but with errors | ✅ |
| **−11** | `MissedFuture` | An upcoming showing is predicted to be missed | |
| **−10** | `Tuning` | Tuner is actively tuning | ✅ |
| **−9** | `Recorder Failed` | Recorder process failed | |
| **−8** | `Tuner Busy` | **This showing** will not record — the tuner it needed was already in use by something else | |
| **−7** | `Low Disk Space` | Recording aborted — insufficient disk | |
| **−6** | `Manual Cancel` | Manually cancelled by user | |
| **−5** | `Missed` | Missed (e.g. backend was offline) | |
| **−4** | `Aborted` | Recording was aborted | |
| **−3** | `Recorded` | Successfully recorded (complete) | |
| **−2** | `Recording` | **Actively recording to disk** | ✅ |
| **−1** | `Will Record` | Scheduled; will record in the future | |
| **0** | `Not Recording` | No recording scheduled | |
| **1** | `Don't Record` | User marked "don't record" | |
| **2** | `Previously Recorded` | Already recorded; skipping duplicate | |
| **3** | `Currently Recorded` | An earlier showing is/was recording this | |
| **4** | `Earlier Showing` | An earlier showing will record instead | |
| **5** | `Max Recordings` | Hit the max simultaneous recordings limit | |
| **6** | `Not Listed` | Programme not in guide data | |
| **7** | `Conflicting` | Scheduling conflict | |
| **8** | `Later Showing` | A later showing will record instead | |
| **9** | `Repeat` | Marked as repeat; skipped | |
| **10** | `Inactive` | Recording rule is inactive | |
| **11** | `Never Record` | User marked "never record" | |
| **12** | `Recorder Off-Line` | No encoder available | |

Codes −20..−16, −13, −12, and 13..20 all returned `Unknown` and are not
assigned in v34.

---

## Active Recording Statuses

The integration uses the following set to determine whether a tuner is
currently occupied (`ACTIVE_RECORDING_STATUSES`):

| Code | Meaning |
|-----:|---|
| **−2** | Recording — actively writing to disk |
| **−10** | Tuning — tuner is acquiring signal |
| **−14** | Failing — recording in progress (with errors) |
| **−15** | Pending — tuner allocated, start imminent |

`WillRecord (−1)` is **not** in this set — it means scheduled for the
future, not currently occupying a tuner.

> **Correction (0.4.5):** `TunerBusy (−8)` was previously included in this
> set on the assumption that it meant "occupied by LiveTV or another
> process." That's backwards. Per MythTV's own status reference, `TunerBusy`
> means *this showing* will not record because the tuner it needed was
> already in use by something else — it's a terminal "lost the conflict"
> outcome for that particular scheduled item, not a sign that item is
> occupying a tuner. Including it caused programmes that did **not** record
> to appear in `sensor.mythtv_active_recordings` and to flip
> `binary_sensor.mythtv_currently_recording` on incorrectly. It has been
> removed from the set.

---

## History of Status Code Changes

The mapping below shows how the codes have shifted across major versions.
Values were sourced from `Dvr/RecStatusToString` on live backends and from
the MythTV source (`libs/libmythtv/recordingtypes.h`).

| StatusName | v31/v32/v33 code | v34 code |
|---|:---:|:---:|
| Recording (active) | −6 | **−2** |
| WillRecord | 8 | **−1** |
| Conflict | −2 | **7** |
| Tuning | −15 | **−10** |
| Pending | −14 | **−15** |
| TunerBusy | −12 | **−8** |
| Recorded (done) | −7 | **−3** |
| Aborted | −8 | **−4** |
| ManualCancel | −10 | **−6** |

This shift was the root cause of all earlier detection failures in this
integration — the code was written against pre-v34 documentation and
had every status code wrong for v34 backends.

---

## API Endpoints

Status codes appear in responses from:

- `Dvr/GetUpcomingList` — `Program.Recording.Status`
- `Dvr/GetConflictList` — `Program.Recording.Status`
- `Dvr/GetRecordedList` — `Program.Recording.Status`
- `Dvr/RecStatusToString?RecStatus=<n>` — canonical name lookup
- `Dvr/RecStatusToDescription?RecStatus=<n>&RecType=<t>` — human description

The integration calls `GetUpcomingList` with `ShowAll=true` to retrieve
all statuses in a single request, then splits the result in the coordinator:

- **Currently recording** → `ACTIVE_RECORDING_STATUSES` (−2, −10, −14, −15)
- **Upcoming** → `WillRecord` (−1) only

---

## LiveTV Detection

LiveTV is detected exclusively from `Dvr/GetEncoderList`. It does **not**
appear in `GetUpcomingList` with any status code.

**Identification criteria (verified against live v34 backend):**

| Field | LiveTV value | Scheduled recording value |
|---|---|---|
| `Encoder.State` | `1` (busy) | `1` (busy) |
| `Encoder.Recording.Recording.RecGroup` | `"LiveTV"` | `"Default"` (or custom) |
| `Encoder.Recording.Recording.RecordId` | `0` | Non-zero |
| `Encoder.Recording.Recording.RecType` | `0` | `1`, `4`, etc. |

The integration uses `RecGroup == "LiveTV"` as the primary signal since it is
the most explicit. `RecordId == 0` is a useful secondary check.

The `<Recording>` element nested inside `<Encoder>` contains the full programme
details (title, channel, start/end time) of what is currently being watched.
