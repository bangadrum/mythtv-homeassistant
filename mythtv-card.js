/**
 * MythTV Dashboard Card for Home Assistant  v1.0.4
 *
 * Install: copy to config/www/mythtv-card.js
 * Register: Settings → Dashboards → Resources → /local/mythtv-card.js (module)
 * Use:      type: custom:mythtv-card
 *
 * Changelog v1.0.4
 * ─────────────────
 * • FIXED: ACTIVE_RECORDING_STATUSES corrected to {-6,-12,-14,-15,-16}.
 *   The v0.3 changelog claimed the set was changed to {-2,-10,-15} labelled
 *   "Recording, Tuning, Pending", but those codes actually map to Conflict,
 *   Cancelled, and Tuning — the first two are NOT active tuner states.
 *   progStatusClass() now matches mythtv_api.py exactly.
 * • FIXED: storage display reads free_gb from coordinator-aggregated groups
 *   (keyed by GroupName). Total/used space is not available from the API.
 * • FIXED: conflict list is read from sensor.mythtv_recording_conflicts
 *   attributes, not the binary sensor (which has no programme list).
 * • FIXED: setConfig() guard no longer throws on valid configs that lack the
 *   non-existent "host_entity" key.
 * • FIXED: conflicts_entity correctly defaults to the sensor, not binary_sensor.
 */

const VERSION = "1.0.4";

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const STYLES = `
:host {
  --c-bg:      var(--card-background-color,    #1a1e2e);
  --c-surface: var(--secondary-background-color, #242840);
  --c-border:  rgba(255,255,255,0.07);
  --c-text:    var(--primary-text-color,       #e8eaf2);
  --c-muted:   var(--secondary-text-color,     #8890a8);
  --c-accent:  #e05252;
  --c-rec:     #e05252;
  --c-ok:      #4cad7f;
  --c-warn:    #e8a444;
  --c-info:    #5b8dee;
  --c-dim:     rgba(255,255,255,0.04);
  --radius:    12px;
  --radius-sm: 7px;
  font-family: 'Noto Sans','Roboto','Helvetica Neue',Arial,sans-serif;
  display: block;
}
* { box-sizing:border-box; margin:0; padding:0; }
.card { background:var(--c-bg); border-radius:var(--radius); overflow:hidden;
        color:var(--c-text); font-size:13px; line-height:1.5;
        border:1px solid var(--c-border); }
.header { display:flex; align-items:center; justify-content:space-between;
          padding:14px 18px 12px; border-bottom:1px solid var(--c-border);
          background:var(--c-surface); }
.header-left { display:flex; align-items:center; gap:10px; }
.header-icon { width:28px; height:28px; background:var(--c-accent); border-radius:6px;
               display:flex; align-items:center; justify-content:center; }
.header-icon svg { width:16px; height:16px; fill:#fff; }
.header-title { font-size:14px; font-weight:500; letter-spacing:.04em; }
.header-host  { font-size:11px; color:var(--c-muted); }
.status-dot { width:8px; height:8px; border-radius:50%; background:var(--c-muted); }
.status-dot.online  { background:var(--c-ok);    box-shadow:0 0 0 3px rgba(76,173,127,.18); }
.status-dot.offline { background:var(--c-accent); box-shadow:0 0 0 3px rgba(224,82,82,.18); }
.stats { display:grid; grid-template-columns:repeat(4,1fr); border-bottom:1px solid var(--c-border); }
.stat { padding:12px 14px; border-right:1px solid var(--c-border); position:relative; }
.stat:last-child { border-right:none; }
.stat-val { font-size:22px; font-weight:500; letter-spacing:-.02em; line-height:1;
            margin-bottom:3px; }
.stat-val.accent { color:var(--c-accent); }
.stat-val.ok     { color:var(--c-ok); }
.stat-lbl { font-size:10px; color:var(--c-muted); letter-spacing:.06em; text-transform:uppercase; }
.stat-bar { position:absolute; bottom:0; left:0; height:2px; background:var(--c-accent);
            transition:width .4s ease; }
.encoders { display:flex; gap:8px; padding:12px 18px; border-bottom:1px solid var(--c-border);
            flex-wrap:wrap; align-items:center; }
.enc-lbl { font-size:10px; color:var(--c-muted); letter-spacing:.06em; text-transform:uppercase; margin-right:4px; }
.enc-chip { display:flex; align-items:center; gap:5px; padding:4px 9px; border-radius:4px;
            background:var(--c-dim); border:1px solid var(--c-border); font-size:11px; color:var(--c-muted); }
.enc-chip.recording { border-color:rgba(224,82,82,.4); background:rgba(224,82,82,.08); color:var(--c-rec); }
.enc-chip.idle      { border-color:rgba(76,173,127,.25); background:rgba(76,173,127,.06); color:var(--c-ok); }
.enc-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0; }
.section { border-bottom:1px solid var(--c-border); }
.section:last-child { border-bottom:none; }
.section-head { display:flex; align-items:center; justify-content:space-between;
                padding:10px 18px 8px; cursor:pointer; user-select:none; }
.section-head:hover { background:var(--c-dim); }
.section-title { font-size:10px; color:var(--c-muted); letter-spacing:.08em; text-transform:uppercase; }
.section-badge { font-size:10px; padding:2px 7px; border-radius:4px; background:var(--c-surface);
                 color:var(--c-muted); border:1px solid var(--c-border); }
.section-badge.alert { background:rgba(224,82,82,.12); color:var(--c-rec); border-color:rgba(224,82,82,.3); }
.section-chevron { font-size:10px; color:var(--c-muted); transition:transform .2s; }
.section-chevron.open { transform:rotate(90deg); }
.section-body { padding:0 18px 12px; }
.prog-row { display:flex; align-items:flex-start; gap:10px; padding:8px 0;
            border-bottom:1px solid var(--c-border); }
.prog-row:last-child { border-bottom:none; }
.prog-status { width:3px; border-radius:2px; flex-shrink:0; align-self:stretch;
               min-height:36px; background:var(--c-muted); }
.prog-status.recording   { background:var(--c-rec); }
.prog-status.will-record { background:var(--c-warn); }
.prog-status.conflict    { background:var(--c-warn); }
.prog-info { flex:1; min-width:0; }
.prog-title { font-size:12px; font-weight:500; white-space:nowrap;
              overflow:hidden; text-overflow:ellipsis; }
.prog-sub   { font-size:11px; color:var(--c-muted); margin-top:1px;
              white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.prog-meta  { font-size:10px; color:var(--c-muted); margin-top:3px; }
.prog-time  { font-size:11px; color:var(--c-muted); white-space:nowrap; text-align:right; flex-shrink:0; }
.rec-badge      { display:inline-block; font-size:9px; padding:1px 5px; border-radius:3px;
                  background:rgba(224,82,82,.15); color:var(--c-rec);
                  border:1px solid rgba(224,82,82,.3); margin-left:5px; vertical-align:middle; }
.conflict-badge { display:inline-block; font-size:9px; padding:1px 5px; border-radius:3px;
                  background:rgba(232,164,68,.15); color:var(--c-warn);
                  border:1px solid rgba(232,164,68,.3); margin-left:5px; vertical-align:middle; }
.storage-row { padding:8px 0; border-bottom:1px solid var(--c-border); }
.storage-row:last-child { border-bottom:none; }
.storage-top  { display:flex; justify-content:space-between; margin-bottom:3px; }
.storage-name { font-size:12px; }
.storage-free { font-size:11px; color:var(--c-muted); }
.storage-dirs { font-size:10px; color:var(--c-muted); margin-top:2px; }
.conflict-banner { background:rgba(232,164,68,.08); border-bottom:1px solid rgba(232,164,68,.2);
                   padding:8px 18px; font-size:11px; color:var(--c-warn);
                   display:flex; align-items:center; gap:8px; }
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
function stateVal(hass, id)         { return hass?.states?.[id]?.state ?? null; }
function attrVal(hass, id, attr)    { return hass?.states?.[id]?.attributes?.[attr] ?? null; }

/**
 * Map a programme's rec_status string (or numeric code) to a CSS class.
 *
 * Matches ACTIVE_RECORDING_STATUSES in mythtv_api.py:
 *   {-6 CurrentRecording, -12 TunerBusy, -14 Pending, -15 Tuning, -16 OtherTuning}
 *
 * The v0.3 branch incorrectly used {-2, -10, -15} calling them
 * "Recording, Tuning, Pending" — those labels were wrong:
 *   -2  = Conflict   (not Recording)
 *   -10 = Cancelled  (not Tuning)
 * This has been corrected below.
 */
function progStatusClass(prog) {
  const status = prog?.rec_status ?? prog?.Recording?.Status ?? "";
  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (["currentrecording","tuning","othertuning","tunerbusy","pending"].includes(s))
      return "recording";
    if (s === "conflict") return "conflict";
    return "will-record";
  }
  if (typeof status === "number") {
    if ([-6,-12,-14,-15,-16].includes(status)) return "recording";
    if (status === -2) return "conflict";
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
        ${sub     ? `<div class="prog-sub">${sub}</div>`     : ""}
        ${channel ? `<div class="prog-meta">${channel}</div>` : ""}
      </div>
      <div class="prog-time">
        <div>${fmtDate(start)}</div>
        <div>${fmtTime(start)}${end ? "–"+fmtTime(end) : ""}</div>
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
    this._sections = { recording:true, upcoming:true, recent:true, storage:false };
  }

  setConfig(config) {
    // All entity IDs have sensible defaults — no required keys.
    this._config = {
      title: "MythTV",
      connected_entity:        "binary_sensor.mythtv_backend_connected",
      recording_entity:        "binary_sensor.mythtv_currently_recording",
      // conflicts_binary_entity: on/off state for the banner trigger.
      conflicts_binary_entity: "binary_sensor.mythtv_recording_conflicts",
      // conflicts_entity: the *sensor* that carries the conflicts attribute list.
      // The binary sensor does NOT have a programme list in its attributes.
      conflicts_entity:        "sensor.mythtv_recording_conflicts",
      active_count_entity:     "sensor.mythtv_active_recordings",
      upcoming_entity:         "sensor.mythtv_upcoming_recordings",
      next_title_entity:       "sensor.mythtv_next_recording",
      next_start_entity:       "sensor.mythtv_next_recording_start",
      recorded_entity:         "sensor.mythtv_total_recordings",
      encoders_entity:         "sensor.mythtv_total_encoders",
      storage_entity:          "sensor.mythtv_storage_groups",
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
      root.innerHTML += `<div class="card"><div class="loading">Connecting…</div></div>`;
      return;
    }

    /* ── data ── */
    const isOnline       = stateVal(h, c.connected_entity)        === "on";
    const isRecording    = stateVal(h, c.recording_entity)        === "on";
    const hasConflicts   = stateVal(h, c.conflicts_binary_entity) === "on";
    const activeCount    = parseInt(stateVal(h, c.active_count_entity) || "0", 10);
    const upcomingTotal  = parseInt(stateVal(h, c.upcoming_entity)     || "0", 10);
    const recordedTotal  = parseInt(stateVal(h, c.recorded_entity)     || "0", 10);
    const numEncoders    = parseInt(stateVal(h, c.encoders_entity)     || "0", 10);
    const hostname       = stateVal(h, c.hostname_entity) || c.title;

    const activeRecs     = attrVal(h, c.active_count_entity, "recordings")   || [];
    const upcomingProgs  = attrVal(h, c.upcoming_entity,     "upcoming")      || [];
    const recentRecs     = attrVal(h, c.recorded_entity,     "recent")        || [];
    const encoders       = attrVal(h, c.encoders_entity,     "encoders")      || [];

    // Storage: read from the sensor whose attributes contain the grouped list.
    // Coordinator aggregates directories by GroupName and provides free_gb.
    // Total/used space is NOT available from the MythTV Services API.
    const storageGroups  = attrVal(h, c.storage_entity, "storage_groups")     || [];

    // Conflict details come from the *sensor* (has a "conflicts" attr list),
    // NOT from the binary sensor (which only has conflict_count + a list of its own).
    const conflictList   = attrVal(h, c.conflicts_entity,        "conflicts")  || [];
    const conflictCount  = Array.isArray(conflictList) ? conflictList.length
                          : (hasConflicts ? 1 : 0);

    /* ── card ── */
    const card = document.createElement("div");
    card.className = "card";

    /* Header */
    card.innerHTML += `
      <div class="header">
        <div class="header-left">
          <div class="header-icon">
            <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1
            0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM8 15c0 .55.45 1 1 1h6c.55 0
            1-.45 1-1v-4c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v4zm1-4h6v4H9v-4zm-4 1h2v2H5v-2zm13
            0h2v2h-2v-2z"/></svg>
          </div>
          <div>
            <div class="header-title">${c.title}</div>
            <div class="header-host">${hostname}</div>
          </div>
        </div>
        <div class="status-dot ${isOnline ? "online" : "offline"}"></div>
      </div>`;

    /* Conflict banner */
    if (hasConflicts) card.innerHTML += `
      <div class="conflict-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
        </svg>
        ${conflictCount} recording conflict${conflictCount !== 1 ? "s" : ""} detected
      </div>`;

    /* Stats */
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

    /* Encoder strip */
    if (encoders.length) {
      let enc = `<div class="encoders"><span class="enc-lbl">Tuners</span>`;
      encoders.forEach((e, i) => {
        // State "0" = idle (matches MythTV encoder State enum).
        const busy = e.state !== "0" && e.state !== 0 && e.connected;
        const cls  = e.connected ? (busy ? "recording" : "idle") : "";
        enc += `<div class="enc-chip ${cls}"><span class="enc-dot"></span>${e.host || "Tuner "+(i+1)}</div>`;
      });
      enc += "</div>";
      card.innerHTML += enc;
    }

    /* Section helper */
    const makeSection = (key, title, badge, badgeCls, rows) => {
      const open = this._sections[key];
      const sec  = document.createElement("div");
      sec.className = "section";
      sec.innerHTML = `
        <div class="section-head" data-toggle="${key}">
          <span class="section-title">${title}</span>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="section-badge ${badgeCls}">${badge}</span>
            <span class="section-chevron ${open ? "open" : ""}">&#9658;</span>
          </div>
        </div>`;
      if (open) {
        const body = document.createElement("div");
        body.className = "section-body";
        body.innerHTML = rows || `<div class="empty">No data</div>`;
        sec.appendChild(body);
      }
      return sec;
    };

    /* Currently Recording */
    card.appendChild(makeSection(
      "recording", "Currently Recording",
      activeCount > 0 ? `${activeCount} active` : "idle",
      activeCount > 0 ? "alert" : "",
      activeRecs.length
        ? activeRecs.map(p => progRow(p, "recording")).join("")
        : `<div class="empty">No active recordings</div>`
    ));

    /* Upcoming */
    card.appendChild(makeSection(
      "upcoming", "Upcoming Recordings",
      `${upcomingTotal} scheduled`, "",
      upcomingProgs.length
        ? upcomingProgs.slice(0,8).map(p => progRow(p, progStatusClass(p))).join("")
        : `<div class="empty">No upcoming recordings</div>`
    ));

    /* Recent */
    card.appendChild(makeSection(
      "recent", "Recent Recordings",
      `${recordedTotal} total`, "",
      recentRecs.length
        ? recentRecs.map(p => progRow(p, "")).join("")
        : `<div class="empty">No recordings in library</div>`
    ));

    /* Storage */
    let storageRows = "";
    if (storageGroups.length) {
      storageGroups.forEach(sg => {
        const freeGb  = typeof sg.free_gb === "number" ? sg.free_gb.toFixed(1) : "—";
        const dirs    = Array.isArray(sg.directories) ? sg.directories.join(", ") : (sg.directories || "");
        const roFlag  = sg.dir_write === false
          ? `<span style="font-size:9px;padding:1px 4px;border-radius:3px;
               background:rgba(232,164,68,.15);color:var(--c-warn);
               border:1px solid rgba(232,164,68,.3);margin-left:5px">READ-ONLY</span>` : "";
        storageRows += `
          <div class="storage-row">
            <div class="storage-top">
              <span class="storage-name">${sg.group || "Default"}${roFlag}</span>
              <span class="storage-free">${freeGb} GB free</span>
            </div>
            ${dirs ? `<div class="storage-dirs">${dirs}</div>` : ""}
          </div>`;
      });
    } else {
      storageRows = `<div class="empty">No storage data</div>`;
    }
    card.appendChild(makeSection(
      "storage", "Storage",
      `${storageGroups.length} group${storageGroups.length !== 1 ? "s" : ""}`, "",
      storageRows
    ));

    root.appendChild(card);

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
  type: "mythtv-card",
  name: "MythTV Dashboard Card",
  description: `MythTV backend status, recordings and storage (v${VERSION})`,
  preview: false,
});
console.info(
  `%c MYTHTV-CARD %c v${VERSION} `,
  "background:#e05252;color:#fff;font-weight:700;padding:2px 4px;border-radius:3px 0 0 3px",
  "background:#1a1e2e;color:#e05252;font-weight:500;padding:2px 4px;border-radius:0 3px 3px 0"
);
