/**
 * MythTV Dashboard Card for Home Assistant  v1.0.9
 *
 * Install: copy to <config>/www/mythtv-card.js
 * Register: Settings → Dashboards → Resources → /local/mythtv-card.js (module)
 * Use:      type: custom:mythtv-card
 *
 * Changelog v1.0.9
 * ─────────────────
 * • FIXED: progStatusClass() no longer treats TunerBusy (-8) as an active
 *   recording. Per MythTV's own status reference, TunerBusy means a showing
 *   did NOT record because the tuner it needed was already in use -- a
 *   terminal lost-the-conflict outcome, not an occupied tuner. Matches the
 *   ACTIVE_RECORDING_STATUSES fix in mythtv_api.py 0.5.0. See info.md.
 *
 * Changelog v1.0.7
 * ─────────────────
 * • FIXED: Status codes updated for MythTV v34, verified via Dvr/RecStatusToString.
 *   The entire scheme changed between v31–v33 and v34:
 *     Recording (active) : was -6,  now -2
 *     WillRecord         : was  8,  now -1
 *     Conflicting        : was -2,  now  7
 *     Tuning             : was -10, now -10  (unchanged)
 *     Pending            : was -15, now -15  (unchanged)
 *   progStatusClass() now uses the v34-verified ACTIVE_RECORDING_STATUSES
 *   {-2, -10, -14, -15} and Conflicting = 7.
 * • FIXED: conflicts_entity defaults to sensor (has programme list attribute)
 *   not binary_sensor (which does not).
 * • FIXED: setConfig() no longer throws on valid configs.
 * • FIXED: storage section shows free_gb from coordinator-aggregated groups.
 * • See info.md in the repository for the full status code reference.
 *
 * Changelog v1.0.8
 * ─────────────────
 * • FIXED: Encoder strip now shows DisplayName (e.g. "Input 45") from
 *   Inputs[0].DisplayName instead of HostName (backend server name).
 * • Changelog v1.0.7: LiveTV section, blue tuner badges, livetv_entity key.
 */

const VERSION = "1.0.9";

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const STYLES = `
:host {
  --c-bg:      var(--card-background-color,      #1a1e2e);
  --c-surface: var(--secondary-background-color, #242840);
  --c-border:  rgba(255,255,255,0.07);
  --c-text:    var(--primary-text-color,         #e8eaf2);
  --c-muted:   var(--secondary-text-color,       #8890a8);
  --c-accent:  #e05252;
  --c-rec:     #e05252;
  --c-ok:      #4cad7f;
  --c-warn:    #e8a444;
  --c-dim:     rgba(255,255,255,0.04);
  --radius:    12px;
  font-family: 'Noto Sans','Roboto','Helvetica Neue',Arial,sans-serif;
  display: block;
}
* { box-sizing:border-box; margin:0; padding:0; }
.card { background:var(--c-bg); border-radius:var(--radius); overflow:hidden;
        color:var(--c-text); font-size:13px; line-height:1.5;
        border:1px solid var(--c-border); }

/* Header */
.header { display:flex; align-items:center; justify-content:space-between;
          padding:14px 18px 12px; border-bottom:1px solid var(--c-border);
          background:var(--c-surface); }
.header-left { display:flex; align-items:center; gap:10px; }
.header-icon { width:28px; height:28px; background:var(--c-accent); border-radius:6px;
               display:flex; align-items:center; justify-content:center; }
.header-icon svg { width:16px; height:16px; fill:#fff; }
.header-title { font-size:14px; font-weight:500; letter-spacing:.04em; }
.header-host  { font-size:11px; color:var(--c-muted); }
.status-dot { width:8px; height:8px; border-radius:50%; background:var(--c-muted); flex-shrink:0; }
.status-dot.online  { background:var(--c-ok);     box-shadow:0 0 0 3px rgba(76,173,127,.18); }
.status-dot.offline { background:var(--c-accent);  box-shadow:0 0 0 3px rgba(224,82,82,.18); }

/* Stats */
.stats { display:grid; grid-template-columns:repeat(4,1fr);
         border-bottom:1px solid var(--c-border); }
.stat { padding:12px 14px; border-right:1px solid var(--c-border); position:relative; }
.stat:last-child { border-right:none; }
.stat-val { font-size:22px; font-weight:500; letter-spacing:-.02em;
            line-height:1; margin-bottom:3px; }
.stat-val.accent { color:var(--c-accent); }
.stat-val.ok     { color:var(--c-ok); }
.stat-lbl { font-size:10px; color:var(--c-muted); letter-spacing:.06em; text-transform:uppercase; }
.stat-bar { position:absolute; bottom:0; left:0; height:2px;
            background:var(--c-accent); transition:width .4s ease; }

/* Encoder strip */
.encoders { display:flex; gap:8px; padding:12px 18px;
            border-bottom:1px solid var(--c-border); flex-wrap:wrap; align-items:center; }
.enc-lbl  { font-size:10px; color:var(--c-muted); letter-spacing:.06em;
            text-transform:uppercase; margin-right:4px; }
.enc-chip { display:flex; align-items:center; gap:5px; padding:4px 9px;
            border-radius:4px; font-size:11px; }
.enc-chip.recording { border:1px solid rgba(224,82,82,.4); background:rgba(224,82,82,.08); color:var(--c-rec); }
.enc-chip.idle      { border:1px solid rgba(76,173,127,.25); background:rgba(76,173,127,.06); color:var(--c-ok); }
.enc-chip.offline   { border:1px solid var(--c-border); background:var(--c-dim); color:var(--c-muted); }
.enc-chip.livetv    { border:1px solid rgba(91,141,238,.4); background:rgba(91,141,238,.08); color:var(--c-info); }
.livetv-badge { display:inline-block; font-size:9px; padding:1px 5px; border-radius:3px;
                background:rgba(91,141,238,.15); color:var(--c-info);
                border:1px solid rgba(91,141,238,.3); margin-left:5px; vertical-align:middle; }
.prog-status.livetv  { background:var(--c-info); }
.enc-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0; }

/* Sections */
.section { border-bottom:1px solid var(--c-border); }
.section:last-child { border-bottom:none; }
.section-head { display:flex; align-items:center; justify-content:space-between;
                padding:10px 18px 8px; cursor:pointer; user-select:none; }
.section-head:hover { background:var(--c-dim); }
.section-title { font-size:10px; color:var(--c-muted); letter-spacing:.08em; text-transform:uppercase; }
.section-right { display:flex; gap:6px; align-items:center; }
.section-badge { font-size:10px; padding:2px 7px; border-radius:4px;
                 background:var(--c-surface); color:var(--c-muted);
                 border:1px solid var(--c-border); }
.section-badge.alert { background:rgba(224,82,82,.12); color:var(--c-rec);
                       border-color:rgba(224,82,82,.3); }
.section-chevron { font-size:10px; color:var(--c-muted); transition:transform .2s; }
.section-chevron.open { transform:rotate(90deg); }
.section-body { padding:0 18px 12px; }

/* Programme rows */
.prog-row { display:flex; align-items:flex-start; gap:10px; padding:8px 0;
            border-bottom:1px solid var(--c-border); }
.prog-row:last-child { border-bottom:none; }
.prog-status { width:3px; border-radius:2px; flex-shrink:0;
               align-self:stretch; min-height:36px; background:var(--c-muted); }
.prog-status.recording   { background:var(--c-rec); }
.prog-status.will-record { background:var(--c-warn); }
.prog-status.conflict    { background:var(--c-warn); }
.prog-info { flex:1; min-width:0; }
.prog-title { font-size:12px; font-weight:500; white-space:nowrap;
              overflow:hidden; text-overflow:ellipsis; }
.prog-sub   { font-size:11px; color:var(--c-muted); margin-top:1px;
              white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.prog-meta  { font-size:10px; color:var(--c-muted); margin-top:3px; }
.prog-time  { font-size:11px; color:var(--c-muted); white-space:nowrap;
              text-align:right; flex-shrink:0; }
.rec-badge      { display:inline-block; font-size:9px; padding:1px 5px; border-radius:3px;
                  background:rgba(224,82,82,.15); color:var(--c-rec);
                  border:1px solid rgba(224,82,82,.3); margin-left:5px; vertical-align:middle; }
.conflict-badge { display:inline-block; font-size:9px; padding:1px 5px; border-radius:3px;
                  background:rgba(232,164,68,.15); color:var(--c-warn);
                  border:1px solid rgba(232,164,68,.3); margin-left:5px; vertical-align:middle; }

/* Storage */
.storage-row { padding:8px 0; border-bottom:1px solid var(--c-border); }
.storage-row:last-child { border-bottom:none; }
.storage-top  { display:flex; justify-content:space-between; margin-bottom:3px; }
.storage-name { font-size:12px; }
.storage-free { font-size:11px; color:var(--c-muted); }
.storage-dirs { font-size:10px; color:var(--c-muted); margin-top:2px; }
.ro-flag { display:inline-block; font-size:9px; padding:1px 4px; border-radius:3px; margin-left:5px;
           background:rgba(232,164,68,.15); color:var(--c-warn);
           border:1px solid rgba(232,164,68,.3); vertical-align:middle; }

/* Conflict banner */
.conflict-banner { background:rgba(232,164,68,.08); border-bottom:1px solid rgba(232,164,68,.2);
                   padding:8px 18px; font-size:11px; color:var(--c-warn);
                   display:flex; align-items:center; gap:8px; }

/* Misc */
.empty   { padding:14px 0; font-size:12px; color:var(--c-muted); font-style:italic; }
.loading { padding:24px 18px; text-align:center; color:var(--c-muted); font-size:12px; }
`;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmtTime(s) {
  if (!s) return "—";
  try {
    const d = new Date(s.endsWith("Z") ? s : s + "Z");
    return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  } catch { return s; }
}

function fmtDate(s) {
  if (!s) return "—";
  try {
    const d   = new Date(s.endsWith("Z") ? s : s + "Z");
    const now = new Date(), tom = new Date();
    tom.setDate(tom.getDate() + 1);
    if (d.toDateString() === now.toDateString()) return "Today";
    if (d.toDateString() === tom.toDateString()) return "Tomorrow";
    return d.toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" });
  } catch { return s; }
}

function stateVal(hass, id)      { return hass?.states?.[id]?.state ?? null; }
function attrVal(hass, id, attr) { return hass?.states?.[id]?.attributes?.[attr] ?? null; }

/**
 * Map a programme's rec_status to a CSS bar class.
 *
 * Status codes verified against live MythTV v34 via Dvr/RecStatusToString.
 * See info.md for the full table. Key v34 values:
 *
 *   ACTIVE (tuner occupied):  -2 Recording, -10 Tuning,
 *                             -14 Failing,  -15 Pending
 *   CONFLICTING:               7
 *   WILL RECORD:              -1
 *
 * NOTE: TunerBusy (-8) is intentionally NOT treated as active. Per MythTV's
 * own status reference it means "this showing will not record because the
 * tuner it needed was already in use" -- a terminal lost-the-conflict
 * outcome, not a sign of an occupied tuner. See mythtv_api.py /
 * ACTIVE_RECORDING_STATUSES and info.md for the full explanation (0.5.0).
 *
 * The rec_status field in sensor attributes is the human-readable label
 * produced by rec_status_label() in mythtv_api.py, e.g. "Recording".
 * Raw API values are numeric strings, e.g. "-2". Both are handled.
 */
function progStatusClass(prog) {
  const status = prog?.rec_status ?? prog?.Recording?.Status ?? "";

  if (typeof status === "string") {
    const s = status.toLowerCase();

    // Human-readable label path (from _fmt_prog / rec_status_label)
    if (["recording", "tuning", "pending", "failing"].includes(s))
      return "recording";
    if (s === "conflicting") return "conflict";

    // Numeric-string path (raw API value e.g. "-2", "7")
    const n = parseInt(status, 10);
    if (!isNaN(n)) {
      if ([-2, -10, -14, -15].includes(n)) return "recording";
      if (n === 7) return "conflict";
    }
  }

  if (typeof status === "number") {
    if ([-2, -10, -14, -15].includes(status)) return "recording";
    if (status === 7) return "conflict";
  }

  return "will-record";
}

function progRow(prog, cls) {
  const title   = prog.title    || "Unknown";
  const sub     = prog.subtitle || "";
  const channel = (prog.channel || "").trim();
  const start   = prog.start    || prog.rec_start || "";
  const end     = prog.end      || prog.rec_end   || "";
  const isRec   = cls === "recording";
  const isCon   = cls === "conflict";
  return `
    <div class="prog-row">
      <div class="prog-status ${cls}"></div>
      <div class="prog-info">
        <div class="prog-title">${title}
          ${isRec ? '<span class="rec-badge">REC</span>'           : ""}
          ${isCon ? '<span class="conflict-badge">CONFLICT</span>' : ""}
        </div>
        ${sub     ? `<div class="prog-sub">${sub}</div>`      : ""}
        ${channel ? `<div class="prog-meta">${channel}</div>` : ""}
      </div>
      <div class="prog-time">
        <div>${fmtDate(start)}</div>
        <div>${fmtTime(start)}${end ? "–" + fmtTime(end) : ""}</div>
      </div>
    </div>`;
}

/* ─── Card element ────────────────────────────────────────────────────────── */
class MythTVCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode:"open" });
    this._config   = {};
    this._hass     = null;
    this._sections = { recording:true, livetv:false, upcoming:true, recent:true, storage:false };
  }

  setConfig(config) {
    this._config = {
      title: "MythTV",
      // ── Entity defaults ──────────────────────────────────────────────
      connected_entity:        "binary_sensor.mythtv_backend_connected",
      recording_entity:        "binary_sensor.mythtv_currently_recording",
      // conflicts_binary_entity: on/off state only (no programme list).
      conflicts_binary_entity: "binary_sensor.mythtv_recording_conflicts",
      // conflicts_entity: the *sensor* which carries the conflicts attribute list.
      conflicts_entity:        "sensor.mythtv_recording_conflicts",
      active_count_entity:     "sensor.mythtv_active_recordings",
      upcoming_entity:         "sensor.mythtv_upcoming_recordings",
      next_title_entity:       "sensor.mythtv_next_recording",
      next_start_entity:       "sensor.mythtv_next_recording_start",
      recorded_entity:         "sensor.mythtv_total_recordings",
      encoders_entity:         "sensor.mythtv_total_encoders",
      storage_entity:          "sensor.mythtv_storage_groups",
      livetv_entity:           "binary_sensor.mythtv_livetv_active",
      hostname_entity:         "sensor.mythtv_backend_hostname",
      ...config,
    };
    this._render();
  }

  set hass(hass) { this._hass = hass; this._render(); }

  _toggle(key) { this._sections[key] = !this._sections[key]; this._render(); }

  _render() {
    const h = this._hass, c = this._config;
    if (!c) return;
    const root = this.shadowRoot;
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    if (!h) {
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `<div class="loading">Connecting…</div>`;
      root.appendChild(div);
      return;
    }

    /* ── Data ── */
    const isOnline      = stateVal(h, c.connected_entity)        === "on";
    const isRecording   = stateVal(h, c.recording_entity)        === "on";
    const hasConflicts  = stateVal(h, c.conflicts_binary_entity) === "on";
    const activeCount   = parseInt(stateVal(h, c.active_count_entity) || "0", 10);
    const upcomingTotal = parseInt(stateVal(h, c.upcoming_entity)     || "0", 10);
    const recordedTotal = parseInt(stateVal(h, c.recorded_entity)     || "0", 10);
    const numEncoders   = parseInt(stateVal(h, c.encoders_entity)     || "0", 10);
    const hostname      = stateVal(h, c.hostname_entity) || c.title;

    const activeRecs    = attrVal(h, c.active_count_entity, "recordings")   || [];
    const upcomingProgs = attrVal(h, c.upcoming_entity,     "upcoming")      || [];
    const recentRecs    = attrVal(h, c.recorded_entity,     "recent")        || [];
    const encoders      = attrVal(h, c.encoders_entity,     "encoders")      || [];
    const storageGroups = attrVal(h, c.storage_entity,      "storage_groups") || [];
    const isLiveTV      = stateVal(h, c.livetv_entity) === "on";
    const liveTVStreams  = attrVal(h, c.livetv_entity,  "streams")         || [];

    // Conflict details come from the sensor (has "conflicts" attribute list),
    // not the binary sensor (which only has on/off state).
    const conflictList  = attrVal(h, c.conflicts_entity, "conflicts") || [];
    const conflictCount = Array.isArray(conflictList)
      ? conflictList.length : (hasConflicts ? 1 : 0);

    /* ── Build card ── */
    const card = document.createElement("div");
    card.className = "card";

    // Header
    card.innerHTML += `
      <div class="header">
        <div class="header-left">
          <div class="header-icon">
            <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1
            0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM8 15c0 .55.45 1 1 1h6c.55 0
            1-.45 1-1v-4c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v4zm1-4h6v4H9v-4zm-4 1h2v2H5
            v-2zm13 0h2v2h-2v-2z"/></svg>
          </div>
          <div>
            <div class="header-title">${c.title}</div>
            <div class="header-host">${hostname}</div>
          </div>
        </div>
        <div class="status-dot ${isOnline ? "online" : "offline"}"></div>
      </div>`;

    // Conflict banner
    if (hasConflicts) card.innerHTML += `
      <div class="conflict-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
        </svg>
        ${conflictCount} recording conflict${conflictCount !== 1 ? "s" : ""} detected
      </div>`;

    // Stats
    const recPct = numEncoders > 0 ? Math.round(activeCount / numEncoders * 100) : 0;
    card.innerHTML += `
      <div class="stats">
        <div class="stat">
          <div class="stat-val ${isRecording ? "accent" : ""}">${activeCount}</div>
          <div class="stat-lbl">Recording</div>
          ${isRecording ? `<div class="stat-bar" style="width:${recPct}%"></div>` : ""}
        </div>
        <div class="stat">
          <div class="stat-val">${upcomingTotal}</div>
          <div class="stat-lbl">Upcoming</div>
        </div>
        <div class="stat">
          <div class="stat-val ok">${numEncoders}</div>
          <div class="stat-lbl">Tuners</div>
        </div>
        <div class="stat">
          <div class="stat-val">${recordedTotal}</div>
          <div class="stat-lbl">Library</div>
        </div>
      </div>`;

    // Encoder strip
    if (encoders.length) {
      let enc = `<div class="encoders"><span class="enc-lbl">Tuners</span>`;
      const liveTVEncoderIds = new Set(liveTVStreams.map(s => String(s.encoder_id)));
      encoders.forEach((e, i) => {
        // State "0" = idle in MythTV encoder State enum.
        const busy = e.state !== "0" && e.state !== 0 && e.connected;
        const isLiveTVTuner = busy && liveTVEncoderIds.has(String(e.id));
        const cls  = e.connected
          ? (isLiveTVTuner ? "livetv" : busy ? "recording" : "idle")
          : "offline";
        enc += `<div class="enc-chip ${cls}"><span class="enc-dot"></span>${e.name || e.host || "Tuner " + (i + 1)}</div>`;
      });
      enc += `</div>`;
      card.innerHTML += enc;
    }

    /* ── Section helper ── */
    const makeSection = (key, title, badge, badgeCls, bodyHtml) => {
      const open = this._sections[key];
      const sec  = document.createElement("div");
      sec.className = "section";
      sec.innerHTML = `
        <div class="section-head" data-toggle="${key}">
          <span class="section-title">${title}</span>
          <div class="section-right">
            <span class="section-badge ${badgeCls}">${badge}</span>
            <span class="section-chevron ${open ? "open" : ""}">&#9658;</span>
          </div>
        </div>`;
      if (open) {
        const body = document.createElement("div");
        body.className = "section-body";
        body.innerHTML = bodyHtml || `<div class="empty">No data</div>`;
        sec.appendChild(body);
      }
      return sec;
    };

    // Currently Recording
    card.appendChild(makeSection(
      "recording", "Currently Recording",
      activeCount > 0 ? `${activeCount} active` : "idle",
      activeCount > 0 ? "alert" : "",
      activeRecs.length
        ? activeRecs.map(p => progRow(p, "recording")).join("")
        : `<div class="empty">No active recordings</div>`
    ));

    // LiveTV
    let liveTVHtml = "";
    if (liveTVStreams.length) {
      liveTVHtml = liveTVStreams.map(s => `
        <div class="prog-row">
          <div class="prog-status livetv"></div>
          <div class="prog-info">
            <div class="prog-title">${s.title || "Live TV"}<span class="livetv-badge">LIVE</span></div>
            ${s.subtitle ? `<div class="prog-sub">${s.subtitle}</div>` : ""}
            <div class="prog-meta">${s.channel || s.channel_name || ""}</div>
          </div>
          <div class="prog-time">
            <div>${fmtDate(s.start)}</div>
            <div>${fmtTime(s.start)}${s.end ? "–" + fmtTime(s.end) : ""}</div>
          </div>
        </div>`).join("");
    } else {
      liveTVHtml = `<div class="empty">No LiveTV streams active</div>`;
    }
    card.appendChild(makeSection(
      "livetv", "LiveTV",
      isLiveTV ? `${liveTVStreams.length} watching` : "idle",
      isLiveTV ? "alert" : "",
      liveTVHtml
    ));

    // Upcoming Recordings
    card.appendChild(makeSection(
      "upcoming", "Upcoming Recordings",
      `${upcomingTotal} scheduled`, "",
      upcomingProgs.length
        ? upcomingProgs.slice(0, 8).map(p => progRow(p, progStatusClass(p))).join("")
        : `<div class="empty">No upcoming recordings</div>`
    ));

    // Recent Recordings
    card.appendChild(makeSection(
      "recent", "Recent Recordings",
      `${recordedTotal} total`, "",
      recentRecs.length
        ? recentRecs.map(p => progRow(p, "")).join("")
        : `<div class="empty">No recordings in library</div>`
    ));

    // Storage
    let storageHtml = "";
    if (storageGroups.length) {
      storageGroups.forEach(sg => {
        const freeGb = typeof sg.free_gb === "number" ? sg.free_gb.toFixed(1) : "—";
        const dirs   = Array.isArray(sg.directories)
          ? sg.directories.join(", ") : (sg.directories || "");
        const roFlag = sg.dir_write === false
          ? `<span class="ro-flag">READ-ONLY</span>` : "";
        storageHtml += `
          <div class="storage-row">
            <div class="storage-top">
              <span class="storage-name">${sg.group || "Default"}${roFlag}</span>
              <span class="storage-free">${freeGb} GB free</span>
            </div>
            ${dirs ? `<div class="storage-dirs">${dirs}</div>` : ""}
          </div>`;
      });
    } else {
      storageHtml = `<div class="empty">No storage data</div>`;
    }
    card.appendChild(makeSection(
      "storage", "Storage",
      `${storageGroups.length} group${storageGroups.length !== 1 ? "s" : ""}`, "",
      storageHtml
    ));

    root.appendChild(card);

    // Collapsible section listeners
    root.querySelectorAll("[data-toggle]").forEach(el => {
      el.addEventListener("click", () => this._toggle(el.dataset.toggle));
    });
  }

  static getStubConfig()    { return { title: "MythTV" }; }
  static getConfigElement() { return document.createElement("mythtv-card-editor"); }
  getCardSize()             { return 5; }
}

customElements.define("mythtv-card", MythTVCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        "mythtv-card",
  name:        "MythTV Dashboard Card",
  description: `MythTV backend status, recordings and storage (v${VERSION})`,
  preview:     false,
});

console.info(
  `%c MYTHTV-CARD %c v${VERSION} `,
  "background:#e05252;color:#fff;font-weight:700;padding:2px 4px;border-radius:3px 0 0 3px",
  "background:#1a1e2e;color:#e05252;font-weight:500;padding:2px 4px;border-radius:0 3px 3px 0"
);
