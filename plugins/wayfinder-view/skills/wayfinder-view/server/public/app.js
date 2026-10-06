// wayfinder-view client — shared session/chrome controller. Owns session
// loading, map picking, the jump bar, URL params, the HUD text panel,
// theme switching, and pan/zoom/mouse plumbing; delegates all map-specific
// layout and drawing to the active *theme* module.
//
// Theme interface: each `themes/<id>.js` file registers itself at
// `window.WayfinderThemes.<id>` (loaded via <script> tags before this
// file, no build step) as an object shaped:
//   id, label               — identity, and the toggle button's label
//   usesPanZoom: boolean     — does this theme support drag-pan/wheel-zoom?
//   usesMinimap: boolean     — does this theme want the minimap shown?
//   onActivate?()            — optional, called once when this theme
//                              becomes active (e.g. reseed a backdrop)
//   buildLayout(tickets)     — raw `MapViewModel.tickets[]` -> an opaque,
//                              theme-owned layout object in WORLD space
//                              (origin (0,0) is the map's own focal
//                              point — star-map's sun, dungeon's entrance)
//   computeDefaultScale(layout) — required iff usesPanZoom
//   draw(ctx, layout, tSec, view) -> { hovered: { ticket } | null }
//     `view` is { worldToScreen, screenToWorld, scale, mouseX, mouseY }
//   drawMinimap(ctx, layout, view) — required iff usesMinimap
//
// No business logic lives here or in any theme: tiering, diamond
// resolution, and status are already decided server-side (view-model.ts).
// Strictly read-only: nothing here ever writes back to the tracker. Data
// loads once per page load and again only on an explicit "Refresh" click —
// never polling, never a live push.

const THEMES = window.WayfinderThemes;
const DEFAULT_THEME = "starmap";
const THEME_STORAGE_KEY = "wayfinder-view:theme";

const TYPE_LABEL = { research: "research", prototype: "prototype", grilling: "grilling", task: "task" };

const sky = document.getElementById("sky");
const skyCtx = sky.getContext("2d");
const minimap = document.getElementById("minimap");
const minimapCtx = minimap.getContext("2d");

const pickerEl = document.getElementById("picker");
const pickerListEl = document.getElementById("pickerList");
const topbarEl = document.getElementById("topbar");
const repoPathEl = document.getElementById("repoPath");
const trackerBadgeEl = document.getElementById("trackerBadge");
const refreshBtn = document.getElementById("refreshBtn");
const themeBtn = document.getElementById("themeBtn");
const jumpBarEl = document.getElementById("jumpBar");
const legendEl = document.getElementById("legend");
const emptyEl = document.getElementById("empty");
const hudEl = document.getElementById("hud");
const hudTitleEl = document.getElementById("hudTitle");
const hudMetaEl = document.getElementById("hudMeta");
const hudGistEl = document.getElementById("hudGist");
const hudLinkEl = document.getElementById("hudLink");
const hudCloseBtn = document.getElementById("hudClose");

let sessionId = null;
let maps = [];
let currentMapId = null;
let viewModel = null;
let layout = null;
let activeTheme = THEMES[DEFAULT_THEME];

let scale = 1;
let panX = 0;
let panY = 0;
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;
let dragMoved = false;

let mouseX = -1;
let mouseY = -1;
let hovered = null; // { ticket } — set from the active theme's draw() each frame
let pinned = null; // click-selected ticket id; keeps the HUD open until dismissed

let clockSec = 0;
let lastFrameMs = null;

function resize() {
  sky.width = window.innerWidth * devicePixelRatio;
  sky.height = window.innerHeight * devicePixelRatio;
  sky.style.width = `${window.innerWidth}px`;
  sky.style.height = `${window.innerHeight}px`;
  skyCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  const minimapCss = 160;
  minimap.width = minimapCss * devicePixelRatio;
  minimap.height = minimapCss * devicePixelRatio;
  minimap.style.width = `${minimapCss}px`;
  minimap.style.height = `${minimapCss}px`;
}
window.addEventListener("resize", resize);

// ---------------------------------------------------------------------
// Coordinate transforms — shared by every theme. A pan/zoom-less theme
// (`usesPanZoom: false`) simply never moves `scale`/`panX`/`panY` away
// from their identity defaults, so its world space and screen space
// coincide (offset only by centering on the viewport).

function worldToScreen(wx, wy) {
  return { x: window.innerWidth / 2 + (wx - panX) * scale, y: window.innerHeight / 2 + (wy - panY) * scale };
}
function screenToWorld(sx, sy) {
  return { x: (sx - window.innerWidth / 2) / scale + panX, y: (sy - window.innerHeight / 2) / scale + panY };
}

// ---------------------------------------------------------------------
// Theme switching — a runtime re-render of the already-fetched
// `MapViewModel`, never a refetch or page reload.

function resetView() {
  scale = activeTheme.usesPanZoom && layout ? activeTheme.computeDefaultScale(layout) : 1;
  panX = 0;
  panY = 0;
}

function applyThemeChrome() {
  document.body.classList.toggle("theme-dungeon", activeTheme.id === "dungeon");
  minimap.hidden = !activeTheme.usesMinimap;
  const otherTheme = activeTheme.id === "starmap" ? THEMES.dungeon : THEMES.starmap;
  themeBtn.textContent = `Switch to ${otherTheme.label}`;
  themeBtn.title = `Currently ${activeTheme.label} — switch renderer theme`;
}

function setTheme(id, { persist = true } = {}) {
  activeTheme = THEMES[id] ?? THEMES[DEFAULT_THEME];
  if (activeTheme.onActivate) activeTheme.onActivate();
  applyThemeChrome();
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, activeTheme.id);
  if (viewModel) {
    layout = activeTheme.buildLayout(viewModel.tickets);
    resetView();
  }
}

themeBtn.addEventListener("click", () => {
  setTheme(activeTheme.id === "starmap" ? "dungeon" : "starmap");
});

function resolveInitialTheme() {
  const fromUrl = new URLSearchParams(location.search).get("theme");
  if (fromUrl && THEMES[fromUrl]) return fromUrl;
  const fromStorage = localStorage.getItem(THEME_STORAGE_KEY);
  if (fromStorage && THEMES[fromStorage]) return fromStorage;
  return DEFAULT_THEME;
}

// ---------------------------------------------------------------------
// Draw

function draw(tSec) {
  const result = activeTheme.draw(skyCtx, layout, tSec, { worldToScreen, screenToWorld, scale, mouseX, mouseY }) ?? { hovered: null };
  hovered = result.hovered;
  sky.style.cursor = hovered ? "pointer" : activeTheme.usesPanZoom ? (dragging ? "grabbing" : "grab") : "default";

  if (activeTheme.usesMinimap) activeTheme.drawMinimap(minimapCtx, layout, { worldToScreen, screenToWorld, scale });

  updateHud();
}

// ---------------------------------------------------------------------
// HUD — labels/titles appear only on hover or click, never as always-on
// canvas text. Theme-agnostic: every theme's tickets share the same
// fields (title/type/status/size/priority/gist/url).

function showHud(ticket) {
  hudEl.hidden = false;
  hudTitleEl.textContent = ticket.title;
  const metaParts = [TYPE_LABEL[ticket.type] ?? ticket.type, ticket.status];
  if (ticket.size) metaParts.push(`size: ${ticket.size}`);
  if (ticket.priority) metaParts.push(`priority: ${ticket.priority}`);
  hudMetaEl.textContent = metaParts.join(" · ");
  hudGistEl.textContent = ticket.gist ?? "";
  hudGistEl.hidden = !ticket.gist;
  if (/^https?:\/\//.test(ticket.url)) {
    hudLinkEl.href = ticket.url;
    hudLinkEl.hidden = false;
  } else {
    hudLinkEl.hidden = true;
  }
}

function updateHud() {
  const active = pinned ?? hovered?.ticket ?? null;
  if (!active) {
    hudEl.hidden = true;
    return;
  }
  showHud(active);
}

hudCloseBtn.addEventListener("click", () => {
  pinned = null;
  hudEl.hidden = true;
});

// ---------------------------------------------------------------------
// Pan/zoom/hover/click — drag/wheel/double-click/minimap-click are no-ops
// for a theme with `usesPanZoom: false`; hover/click (HUD pin) work
// identically for every theme.

sky.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (activeTheme.usesPanZoom && dragging) {
    dragMoved = true;
    panX = panStartX - (e.clientX - dragStartX) / scale;
    panY = panStartY - (e.clientY - dragStartY) / scale;
  }
});
sky.addEventListener("mouseleave", () => {
  mouseX = -1;
  mouseY = -1;
});
sky.addEventListener("mousedown", (e) => {
  if (!activeTheme.usesPanZoom) return;
  dragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  panStartX = panX;
  panStartY = panY;
});
window.addEventListener("mouseup", () => {
  dragging = false;
});
sky.addEventListener("click", () => {
  if (dragMoved) return; // a drag, not a click
  pinned = hovered ? hovered.ticket : null;
  updateHud();
});
sky.addEventListener(
  "wheel",
  (e) => {
    if (!activeTheme.usesPanZoom) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.001);
    scale = Math.min(6, Math.max(0.03, scale * factor));
  },
  { passive: false },
);
sky.addEventListener("dblclick", () => {
  if (!activeTheme.usesPanZoom) return;
  resetView();
});
minimap.addEventListener("click", (e) => {
  if (!activeTheme.usesPanZoom || !activeTheme.usesMinimap || !layout) return;
  const rect = minimap.getBoundingClientRect();
  const w = minimap.width;
  const h = minimap.height;
  const pad = 10 * devicePixelRatio;
  const mScale = (Math.min(w, h) - pad * 2) / (layout.maxRadius * 2);
  const mx = (e.clientX - rect.left) * devicePixelRatio;
  const my = (e.clientY - rect.top) * devicePixelRatio;
  panX = (mx - w / 2) / mScale;
  panY = (my - h / 2) / mScale;
});

// ---------------------------------------------------------------------
// Session / map loading — data refreshes only on page load or this
// explicit refresh control, never polling.

function renderJumpBar() {
  jumpBarEl.hidden = maps.length === 0;
  emptyEl.hidden = maps.length !== 0;
  jumpBarEl.innerHTML = "";
  for (const map of maps) {
    const btn = document.createElement("button");
    btn.className = map.id === currentMapId ? "active" : "";
    const progress = `${map.closedCount}/${map.totalCount}`;
    btn.innerHTML = `<strong>${escapeHtml(map.title)}</strong><span class="progress">${progress}</span><span class="dest">${escapeHtml(map.destination)}</span>`;
    btn.addEventListener("click", () => selectMap(map.id));
    jumpBarEl.appendChild(btn);
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function updateUrlParam(mapId) {
  const params = new URLSearchParams(location.search);
  if (mapId) params.set("map", mapId);
  else params.delete("map");
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

async function selectMap(mapId) {
  pinned = null;
  hudEl.hidden = true;
  if (!mapId) {
    viewModel = null;
    layout = null;
    currentMapId = null;
    renderJumpBar();
    return;
  }
  currentMapId = mapId;
  renderJumpBar();
  const res = await fetch(`/s/${sessionId}/api/maps/${mapId}`);
  viewModel = await res.json();
  layout = activeTheme.buildLayout(viewModel.tickets);
  resetView();
  updateUrlParam(mapId);
}

async function loadSession() {
  const info = await fetch(`/s/${sessionId}/api/session`).then((r) => r.json());
  repoPathEl.textContent = info.repoPath;
  trackerBadgeEl.textContent = info.tracker;
  const { maps: list } = await fetch(`/s/${sessionId}/api/maps`).then((r) => r.json());
  maps = list;
  renderJumpBar();
}

refreshBtn.addEventListener("click", async () => {
  await loadSession();
  if (currentMapId && maps.some((m) => m.id === currentMapId)) {
    await selectMap(currentMapId);
  } else {
    await selectMap(maps[0]?.id ?? null);
  }
});

async function renderPicker() {
  pickerEl.hidden = false;
  const { sessions } = await fetch("/sessions").then((r) => r.json());
  pickerListEl.innerHTML = "";
  for (const s of sessions) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = s.url;
    a.textContent = `${s.repoPath} (${s.tracker})`;
    li.appendChild(a);
    pickerListEl.appendChild(li);
  }
  if (sessions.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No sessions yet — create one with POST /sessions.";
    pickerListEl.appendChild(li);
  }
}

async function init() {
  setTheme(resolveInitialTheme(), { persist: false });
  resize();

  const match = /^\/s\/([^/]+)/.exec(location.pathname);
  if (!match) {
    await renderPicker();
    return;
  }
  sessionId = match[1];
  topbarEl.hidden = false;
  jumpBarEl.hidden = false;
  legendEl.hidden = false;

  const sessionCheck = await fetch(`/s/${sessionId}/api/session`);
  if (sessionCheck.status === 404) {
    topbarEl.hidden = true;
    jumpBarEl.hidden = true;
    legendEl.hidden = true;
    await renderPicker();
    return;
  }

  await loadSession();
  const requestedMap = new URLSearchParams(location.search).get("map");
  await selectMap(requestedMap && maps.some((m) => m.id === requestedMap) ? requestedMap : (maps[0]?.id ?? null));

  requestAnimationFrame(loop);
}

function loop(t) {
  const dt = lastFrameMs === null ? 0 : (t - lastFrameMs) / 1000;
  lastFrameMs = t;
  clockSec += dt;
  draw(clockSec);
  requestAnimationFrame(loop);
}

init();
