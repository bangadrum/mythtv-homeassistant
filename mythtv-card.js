/**
 * MythTV Dashboard Card for Home Assistant
 *
 * Place this file in:  config/www/mythtv-card.js
 * Register in Lovelace:
 *   resources:
 *     - url: /local/mythtv-card.js
 *       type: module
 *
 * Then use card type:  custom:mythtv-card
 */

const VERSION = "1.0.1";

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const STYLES = `
  :host {
    --c-bg:       var(--card-background-color, #1a1e2e);
    --c-surface:  var(--secondary-background-color, #242840);
    --c-border:   rgba(255,255,255,0.07);
    --c-text:     var(--primary-text-color, #e8eaf2);
    --c-muted:    var(--secondary-text-color, #8890a8);
    --c-accent:   #e05252;
    --c-rec:      #e05252;
    --c-upcoming: #e8a444;
    --c-ok:       #4cad7f;
    --c-info:     #5b8dee;
    --c-warn:     #e8a444;
    --c-dim:      rgba(255,255,255,0.04);
    --radius:     12px;
    --radius-sm:  7px;
    font-family: 'Noto Sans', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    display: block;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .card {
    background: var(--c-bg);
    border-radius: var(--radius);
    overflow: hidden;
    color: var(--c-text);
    font-size: 13px;
    line-height: 1.5;
    border: 1px solid var(--c-border);
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--c-border);
    background: var(--c-surface);
  }
  .header-left { display: flex; align-items: center; gap: 10px; }
  .header-icon {
    width: 28px; height: 28px;
    background: var(--c-accent);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
  }
  .header-icon svg { width: 16px; height: 16px; fill: #fff; }
  .header-title { font-size: 14px; font-weight: 500; letter-spacing: 0.04em; color: var(--c-text); }
  .header-host { font-size: 11px; color: var(--c-muted); letter-spacing: 0.03em; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--c-muted);
    flex-shrink: 0;
  }
  .status-dot.online { background: var(--c-ok); box-shadow: 0 0 0 3px rgba(76,173,127,0.18); }
  .status-dot.offline { background: var(--c-accent); box-shadow: 0 0 0 3px rgba(224,82,82,0.18); }

  /* ── Stats row ── */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-bottom: 1px solid var(--c-border);
  }
  .stat {
    padding: 12px 14px;
    border-right: 1px solid var(--c-border);
    position: relative;
    cursor: default;
  }
  .stat:last-child { border-right: none; }
  .stat-val {
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1;
    margin-bottom: 3px;
    color: var(--c-text);
  }
  .stat-val.accent   { color: var(--c-accent); }
  .stat-val.ok       { color: var(--c-ok); }
  .stat-val.warn     { color: var(--c-warn); }
  .stat-lbl { font-size: 10px; color: var(--c-muted); letter-spacing: 0.06em; text-transform: uppercase; }
  .stat-bar {
    position: absolute;
    bottom: 0; left: 0;
    height: 2px;
    background: var(--c-accent);
    transition: width 0.4s ease;
  }

  /* ── Encoder strip ── */
  .encoders {
    display: flex;
    gap: 8px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--c-border);
    flex-wrap: wrap;
    align-items: center;
  }
  .encoder-lbl { font-size: 10px; color: var(--c-muted); letter-spacing: 0.06em; text-transform: uppercase; margin-right: 4px; }
  .encoder-chip {
    display: flex; align-items: center; gap: 5px;
    padding: 4px 9px;
    border-radius: 4px;
    background: var(--c-dim);
    border: 1px solid var(--c-border);
    font-size: 11px;
    color: var(--c-muted);
  }
  .encoder-chip.recording {
    border-color: rgba(224,82,82,0.4);
    background: rgba(224,82,82,0.08);
    color: var(--c-rec);
  }
  .encoder-chip.idle {
    border-color: rgba(76,173,127,0.25);
    background: rgba(76,173,127,0.06);
    color: var(--c-ok);
  }
  .enc-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

  /* ── Section ── */
  .section { border-bottom: 1px solid var(--c-border); }
  .section:last-child { border-bottom: none; }
  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 18px 8px;
    cursor: pointer;
    user-select: none;
  }
  .section-head:hover { background: var(--c-dim); }
  .section-title { font-size: 10px; color: var(--c-muted); letter-spacing: 0.08em; text-transform: uppercase; }
  .section-badge {
    font-size: 10px; padding: 2px 7px;
    border-radius: 4px;
    background: var(--c-surface);
    color: var(--c-muted);
    border: 1px solid var(--c-border);
  }
  .section-badge.alert { background: rgba(224,82,82,0.12); color: var(--c-rec); border-color: rgba(224,82,82,0.3); }
  .section-chevron { font-size: 10px; color: var(--c-muted); transition: transform 0.2s; }
  .section-chevron.open { transform: rotate(90deg); }
  .section-body { padding: 0 18px 12px; }

  /* ── Programme row ── */
  .prog-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--c-border);
  }
  .prog-row:last-child { border-bottom: none; }
  .prog-status {
    width: 3px; border-radius: 2px; flex-shrink: 0;
    align-self: stretch; min-height: 36px;
    background: var(--c-muted);
  }
  .prog-status.recording { background: var(--c-rec); }
  .prog-status.will-record { background: var(--c-upcoming); }
  .prog-status.conflict { background: var(--c-warn); }
  .prog-info { flex: 1; min-width: 0; }
  .prog-title {
    font-size: 12px; font-weight: 500; color: var(--c-text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .prog-sub { font-size: 11px; color: var(--c-muted); margin-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prog-meta { font-size: 10px; color: var(--c-muted); margin-top: 3px; }
  .prog-time { font-size: 11px; color: var(--c-muted); white-space: nowrap; flex-shrink: 0; text-align: right; }
  .prog-chan { font-size: 10px; color: var(--c-muted); }
  .rec-badge {
    display: inline-block;
    font-size: 9px; padding: 1px 5px; border-radius: 3px;
    background: rgba(224,82,82,0.15); color: var(--c-rec);
    border: 1px solid rgba(224,82,82,0.3);
    margin-left: 5px; vertical-align: middle;
    letter-spacing: 0.04em;
  }
  .conflict-badge {
    display: inline-block;
    font-size: 9px; padding: 1px 5px; border-radius: 3px;
    background: rgba(232,164,68,0.15); color: var(--c-warn);
    border: 1px solid rgba(232,164,68,0.3);
    margin-left: 5px; vertical-align: middle;
  }

  /* ── Storage ── */
  .storage-row { padding: 8px 0; border-bottom: 1px solid var(--c-border); }
  .storage-row:last-child { border-bottom: none; }
  .storage-top { display: flex; justify-content: space-between; margin-bottom: 5px; }
  .storage-name { font-size: 12px; color: var(--c-text); }
  .storage-nums { font-size: 11px; color: var(--c-muted); }
  .storage-dirs { font-size: 10px; color: var(--c-muted); margin-top: 3px; }
  .storage-flag {
    display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px;
    margin-left: 5px; vertical-align: middle;
  }
  .storage-flag.ro {
    background: rgba(232,164,68,0.15); color: var(--c-warn);
    border: 1px solid rgba(232,164,68,0.3);
  }

  /* ── Empty / loading ── */
  .empty { padding: 14px 0; font-size: 12px; color: var(--c-muted); font-style: italic; }
  .loading { padding: 24px 18px; text-align: center; color: var(--c-muted); font-size: 12px; letter-spacing: 0.05em; }

  /* ── Conflict banner ── */
  .conflict-banner {
    background: rgba(232,164,68,0.08);
    border-bottom: 1px solid rgba(232,164,68,0.2);
    padding: 8px 18px;
    font-size: 11px; color: var(--c-warn);
    display: flex; align-items: center; gap: 8px;
  }
  .conflict-banner svg { flex-shrink: 0; }
`;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmtTime(utcStr) {
  if (!utcStr) return "—";
  try {
    const d = new Date(utcStr.endsWith("Z") ? utcStr : utcStr + "Z");
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return utcStr; }
}

function fmtDate(utcStr) {
  if (!utcStr) return "—";
  try {
    const d = new Date(utcStr.endsWith("Z") ? utcStr : utcStr + "Z");
    const today = new Date();
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tom.toDateString()) return "Tomorrow";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  } catch { return utcStr; }
}

function stateVal(hass, entityId) {
  if (!hass || !entityId) return null;
  return hass.states[entityId]?.state ?? null;
}

function attrVal(hass, entityId, attr) {
  if (!hass || !entityId) return null;
  return hass.states[entityId]?.attributes?.[attr] ?? null;
}

/**
 * Determine the coloured-bar class for a programme row.
 *
 * FIX: The original code checked for status codes -6 and -14 as "recording",
 * which were wrong (they resolved to Cancelled and Failing in the corrected
 * status table).  The correct active-recording codes are:
 *   -8  → Recording  (tuner is writing content)
 *   -12 → Tuning     (tuner is locking on to the signal)
 *
 * The rec_status attribute from sensor.py is already a human-readable string
 * (e.g. "Recording", "Tuning", "Conflict") so we check that first.
 * The numeric fallback is kept for any edge case where the raw code leaks
 * through (e.g. third-party sensor overrides).
 */
function progStatusClass(prog) {
  const status = prog?.rec_status || prog?.Recording?.Status || "";

  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (s === "recording" || s === "tuning") return "recording";
    if (s === "conflict")                    return "conflict";
    return "will-record";
  }

  // Numeric fallback — corrected codes
  if (typeof status === "number") {
    if (status === -8 || status === -12) return "recording";  // FIX: was -6, -14
    if (status === -1)                   return "conflict";
  }

  return "will-record";
}

/* ─── Custom Element ──────────────────────────────────────────────────────── */
class MythTVCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._sections = { recording: true, upcoming: true, recent: true, storage: false };
  }

  setConfig(config) {
    if (!config.host_entity && !config.upcoming_entity) {
      throw new Error("MythTV card: set at least host_entity or upcoming_entity");
    }
    this._config = {
      title: "MythTV",
      connected_entity:    config.connected_entity    || "binary_sensor.mythtv_backend_connected",
      recording_entity:    config.recording_entity    || "binary_sensor.mythtv_currently_recording",
      conflicts_entity:    config.conflicts_entity    || "binary_sensor.mythtv_recording_conflicts",
      active_count_entity: config.active_count_entity || "sensor.mythtv_active_recordings",
      upcoming_entity:     config.upcoming_entity     || "sensor.mythtv_upcoming_recordings",
      next_title_entity:   config.next_title_entity   || "sensor.mythtv_next_recording",
      next_start_entity:   config.next_start_entity   || "sensor.mythtv_next_recording_start",
      recorded_entity:     config.recorded_entity     || "sensor.mythtv_total_recordings",
      last_recorded_entity:config.last_recorded_entity|| "sensor.mythtv_last_recorded",
      encoders_entity:     config.encoders_entity     || "sensor.mythtv_total_encoders",
      schedules_entity:    config.schedules_entity    || "sensor.mythtv_recording_schedules",
      storage_entity:      config.storage_entity      || "sensor.mythtv_storage_groups",
      hostname_entity:     config.hostname_entity     || "sensor.mythtv_backend_hostname",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _toggle(key) {
    this._sections[key] = !this._sections[key];
    this._render();
  }

  _render() {
    const h = this._hass;
    const c = this._config;
    if (!c) return;

    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    if (!h) {
      const loading = document.createElement("div");
      loading.className = "card";
      loading.innerHTML = `<div class="loading">Connecting to Home Assistant…</div>`;
      root.appendChild(loading);
      return;
    }

    /* ── gather data ── */
    const isOnline     = stateVal(h, c.connected_entity) === "on";
    const isRecording  = stateVal(h, c.recording_entity) === "on";
    const hasConflicts = stateVal(h, c.conflicts_entity) === "on";

    const activeCount    = parseInt(stateVal(h, c.active_count_entity) || "0", 10);
    const upcomingTotal  = parseInt(stateVal(h, c.upcoming_entity)     || "0", 10);
    const recordedTotal  = parseInt(stateVal(h, c.recorded_entity)     || "0", 10);
    const schedulesCount = parseInt(stateVal(h, c.schedules_entity)    || "0", 10);
    const numEncoders    = parseInt(stateVal(h, c.encoders_entity)     || "0", 10);

    const hostname = stateVal(h, c.hostname_entity) || c.title;
    const nextTitle = stateVal(h, c.next_title_entity);
    const nextStart = stateVal(h, c.next_start_entity);

    // Rich attribute data
    const activeRecordings = attrVal(h, c.active_count_entity, "recordings") || [];
    const upcomingPrograms  = attrVal(h, c.upcoming_entity,     "upcoming")   || [];
    const recentRecordings  = attrVal(h, c.recorded_entity,     "recent")     || [];
    const encoders          = attrVal(h, c.encoders_entity,     "encoders")   || [];
    const storageGroups     = attrVal(h, c.storage_entity,      "storage_groups") || [];

    // FIX: The conflicts attribute is a list called "conflicts", not "conflict_count".
    // Derive the count from the list length, or fall back to the binary sensor state.
    const conflictList  = attrVal(h, c.conflicts_entity, "conflicts") || [];
    const conflictCount = Array.isArray(conflictList)
      ? conflictList.length
      : (hasConflicts ? 1 : 0);

    /* ── build card ── */
    const card = document.createElement("div");
    card.className = "card";

    /* Header */
    card.innerHTML += `
      <div class="header">
        <div class="header-left">
          <div class="header-icon">
            <svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM8 15c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v4zm1-4h6v4H9v-4zm-4 1h2v2H5v-2zm13 0h2v2h-2v-2z"/></svg>
          </div>
          <div>
            <div class="header-title">${c.title}</div>
            <div class="header-host">${hostname}</div>
          </div>
        </div>
        <div class="status-dot ${isOnline ? "online" : "offline"}"></div>
      </div>`;

    /* Conflict banner */
    if (hasConflicts) {
      card.innerHTML += `
        <div class="conflict-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
          ${conflictCount} recording conflict${conflictCount !== 1 ? "s" : ""} detected — check your schedule
        </div>`;
    }

    /* Stats row */
    const recPct = numEncoders > 0 ? Math.round((activeCount / numEncoders) * 100) : 0;
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
    if (encoders.length > 0) {
      let encHtml = `<div class="encoders"><span class="encoder-lbl">Tuners</span>`;
      encoders.forEach((enc, i) => {
        const isRec = enc.state !== "0" && enc.state !== 0 && enc.connected;
        const cls = enc.connected ? (isRec ? "recording" : "idle") : "";
        const lbl = enc.host || `Tuner ${i + 1}`;
        encHtml += `<div class="encoder-chip ${cls}"><span class="enc-dot"></span>${lbl}</div>`;
      });
      encHtml += `</div>`;
      card.innerHTML += encHtml;
    }

    /* ── Currently Recording section ── */
    const recOpen = this._sections.recording;
    const recSection = document.createElement("div");
    recSection.className = "section";
    recSection.innerHTML = `
      <div class="section-head" data-toggle="recording">
        <span class="section-title">Currently Recording</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${activeCount > 0 ? `<span class="section-badge alert">${activeCount} active</span>` : `<span class="section-badge">idle</span>`}
          <span class="section-chevron ${recOpen ? "open" : ""}">&#9658;</span>
        </div>
      </div>`;
    if (recOpen) {
      const body = document.createElement("div");
      body.className = "section-body";
      if (activeRecordings.length === 0) {
        body.innerHTML = `<div class="empty">No active recordings</div>`;
      } else {
        activeRecordings.forEach(prog => {
          body.innerHTML += progRow(prog, "recording");
        });
      }
      recSection.appendChild(body);
    }
    card.appendChild(recSection);

    /* ── Upcoming section ── */
    const upOpen = this._sections.upcoming;
    const upSection = document.createElement("div");
    upSection.className = "section";
    upSection.innerHTML = `
      <div class="section-head" data-toggle="upcoming">
        <span class="section-title">Upcoming Recordings</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="section-badge">${upcomingTotal} scheduled</span>
          <span class="section-chevron ${upOpen ? "open" : ""}">&#9658;</span>
        </div>
      </div>`;
    if (upOpen) {
      const body = document.createElement("div");
      body.className = "section-body";
      if (upcomingPrograms.length === 0 && nextTitle) {
        body.innerHTML = `
          <div class="prog-row">
            <div class="prog-status will-record"></div>
            <div class="prog-info">
              <div class="prog-title">${nextTitle}</div>
              <div class="prog-meta">${fmtDate(nextStart)} at ${fmtTime(nextStart)}</div>
            </div>
          </div>`;
      } else if (upcomingPrograms.length === 0) {
        body.innerHTML = `<div class="empty">No upcoming recordings</div>`;
      } else {
        upcomingPrograms.slice(0, 8).forEach(prog => {
          body.innerHTML += progRow(prog, progStatusClass(prog));
        });
      }
      upSection.appendChild(body);
    }
    card.appendChild(upSection);

    /* ── Recent Recordings section ── */
    const recRecOpen = this._sections.recent;
    const recRecSection = document.createElement("div");
    recRecSection.className = "section";
    recRecSection.innerHTML = `
      <div class="section-head" data-toggle="recent">
        <span class="section-title">Recent Recordings</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="section-badge">${recordedTotal} total</span>
          <span class="section-chevron ${recRecOpen ? "open" : ""}">&#9658;</span>
        </div>
      </div>`;
    if (recRecOpen) {
      const body = document.createElement("div");
      body.className = "section-body";
      if (recentRecordings.length === 0) {
        body.innerHTML = `<div class="empty">No recordings in library</div>`;
      } else {
        recentRecordings.forEach(prog => {
          body.innerHTML += progRow(prog, "");
        });
      }
      recRecSection.appendChild(body);
    }
    card.appendChild(recRecSection);

    /* ── Storage section ── */
    const storOpen = this._sections.storage;
    const storSection = document.createElement("div");
    storSection.className = "section";
    storSection.innerHTML = `
      <div class="section-head" data-toggle="storage">
        <span class="section-title">Storage</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="section-badge">${storageGroups.length} group${storageGroups.length !== 1 ? "s" : ""}</span>
          <span class="section-chevron ${storOpen ? "open" : ""}">&#9658;</span>
        </div>
      </div>`;
    if (storOpen) {
      const body = document.createElement("div");
      body.className = "section-body";
      if (storageGroups.length === 0) {
        body.innerHTML = `<div class="empty">No storage data available</div>`;
      } else {
        // FIX: Storage data now comes from Myth/GetStorageGroupDirs via the
        // backend integration.  The old fields (total_gb, used_gb) no longer
        // exist because the MythTV API does not expose total or used space
        // through that endpoint — only free space per directory (KiBFree),
        // aggregated into free_gb by the coordinator.
        //
        // We therefore display free space only, and show a read-only warning
        // badge if the group is not writable.  The indeterminate progress bar
        // is removed since we cannot calculate a meaningful percentage without
        // total space.
        storageGroups.forEach(sg => {
          const freeGb   = typeof sg.free_gb === "number" ? sg.free_gb.toFixed(1) : "?";
          const groupName = sg.group || "Default";
          const host      = sg.host  ? ` · ${sg.host}` : "";
          const writable  = sg.dir_write !== false;
          const roFlag    = writable ? "" : `<span class="storage-flag ro">READ-ONLY</span>`;
          const dirs      = Array.isArray(sg.directories) && sg.directories.length > 0
            ? sg.directories.join(", ")
            : "";

          body.innerHTML += `
            <div class="storage-row">
              <div class="storage-top">
                <span class="storage-name">${groupName}${roFlag}</span>
                <span class="storage-nums">${freeGb} GB free${host}</span>
              </div>
              ${dirs ? `<div class="storage-dirs">${dirs}</div>` : ""}
            </div>`;
        });
      }
      storSection.appendChild(body);
    }
    card.appendChild(storSection);

    root.appendChild(card);

    /* ── Event listeners for collapsible sections ── */
    root.querySelectorAll("[data-toggle]").forEach(el => {
      el.addEventListener("click", () => this._toggle(el.dataset.toggle));
    });
  }

  static getConfigElement() {
    return document.createElement("mythtv-card-editor");
  }

  static getStubConfig() {
    return { title: "MythTV" };
  }
}

/* ─── Programme row helper ────────────────────────────────────────────────── */
function progRow(prog, statusCls) {
  const title    = prog.title    || "Unknown";
  const subtitle = prog.subtitle || "";
  const channel  = (prog.channel || "").trim();
  const start    = prog.start    || prog.rec_start || "";
  const end      = prog.end      || prog.rec_end   || "";
  const isRec      = statusCls === "recording";
  const isConflict = statusCls === "conflict";

  return `
    <div class="prog-row">
      <div class="prog-status ${statusCls}"></div>
      <div class="prog-info">
        <div class="prog-title">
          ${title}
          ${isRec      ? `<span class="rec-badge">REC</span>`           : ""}
          ${isConflict ? `<span class="conflict-badge">CONFLICT</span>` : ""}
        </div>
        ${subtitle ? `<div class="prog-sub">${subtitle}</div>` : ""}
        ${channel  ? `<div class="prog-meta">${channel}</div>`  : ""}
      </div>
      <div class="prog-time">
        <div>${fmtDate(start)}</div>
        <div class="prog-chan">${fmtTime(start)}${end ? "–" + fmtTime(end) : ""}</div>
      </div>
    </div>`;
}

/* ─── Register ────────────────────────────────────────────────────────────── */
customElements.define("mythtv-card", MythTVCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "mythtv-card",
  name: "MythTV Dashboard Card",
  description: `MythTV backend status, recordings, and storage (v${VERSION})`,
  preview: false,
});

console.info(
  `%c MYTHTV-CARD %c v${VERSION} `,
  "background:#e05252;color:#fff;font-weight:700;padding:2px 4px;border-radius:3px 0 0 3px;",
  "background:#1a1e2e;color:#e05252;font-weight:500;padding:2px 4px;border-radius:0 3px 3px 0;"
);
