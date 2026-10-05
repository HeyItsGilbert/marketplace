// wayfinder-view client — a dumb drawing layer over the `MapViewModel` the
// server computes. No business logic lives here: tiering, diamond
// resolution, and status are already decided server-side (view-model.ts);
// this file only turns `tickets[]` (flat, `tier`/`hostId`/`crossLinkIds`
// carrying the orbit structure) into a star-map layout and draws it.
//
// Strictly read-only: nothing here ever writes back to the tracker. Data
// loads once per page load and again only on an explicit "Refresh" click —
// never polling, never a live push.

// ---------------------------------------------------------------------
// Tunable layout constants — every size/spacing knob the spec calls out
// lives here, not sprinkled through the drawing code below, so defaults
// can be recalibrated without touching render logic. Starting points are
// the readability-at-scale prototype's calibrated values; the
// dependent-count sizing ceiling (6) keeps a heavily-depended-on planet's
// body growth visible but bounded, matching realistic map scale (primary
// counts rarely exceed ~10).
const TUNING = {
  sunBaseRadius: 20,
  sunGrowthPerSqrtPlanetCount: 10,
  planetBaseRadius: 4,
  planetGrowthPerMoon: 3,
  planetMoonSizingCeiling: 6,
  moonBodyRadius: 2,
  moonToMoonSpacing: 1,
  orbitToOrbitBuffer: 0,
};

// Golden-angle phyllotaxis step — used identically for planets around the
// sun and moons around their planet, so both reads the same "organic
// scatter" visual language.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Hue carries state-urgency heat, not per-ticket identity: warm/active for
// the frontier, cool for stuck, blue for in-progress, green for done. Each
// status also gets a structurally distinct ring treatment (solid+pulse,
// dashed, glow, bold) so status is legible even to a hue-blind reader.
const STATUS_STYLE = {
  frontier: { hue: 32, sat: 82, light: 58, ring: "#ffb648" },
  claimed: { hue: 206, sat: 68, light: 56, ring: "#6fb3ff" },
  blocked: { hue: 0, sat: 62, light: 48, ring: "#c97f82" },
  // Closed stays visually prominent — not dimmed/desaturated — so it keeps
  // its own fully-saturated, bold ring in a dedicated color rather than a
  // faded version of another state's.
  closed: { hue: 142, sat: 48, light: 44, ring: "#52d38a" },
};

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
let hovered = null; // { ticket, x, y, r } in world space, set by the previous draw
let pinned = null; // click-selected ticket id; keeps the HUD open until dismissed

let stars = [];
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

function seedStarfield() {
  const count = Math.floor((window.innerWidth * window.innerHeight) / 2600);
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.2 + 0.2,
    phase: Math.random() * Math.PI * 2,
    speed: 0.3 + Math.random() * 0.8,
  }));
}

// ---------------------------------------------------------------------
// Layout — organic phyllotaxis scatter (issue #61's superseding decision
// over the original concentric-ring baseline). Every primary-tier ticket
// (a "planet") gets its own orbital radius via golden-angle placement; the
// radial gap between any two orbit-adjacent planets alone clears both
// planets' full moon-shell radii, so orbits can never collide even if they
// later animate at independent angular speeds. A planet's own dependents
// ("moons") use the identical algorithm around that planet.

function compareTicketIds(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function moonShellRadius(bodyRadius, moonCount) {
  if (moonCount === 0) return bodyRadius;
  return bodyRadius + TUNING.moonBodyRadius + TUNING.moonToMoonSpacing + (moonCount - 1) * (TUNING.moonBodyRadius * 2 + TUNING.moonToMoonSpacing);
}

function planetBodyRadius(moonCount) {
  const sized = Math.min(moonCount, TUNING.planetMoonSizingCeiling);
  return TUNING.planetBaseRadius + sized * TUNING.planetGrowthPerMoon;
}

function buildLayout(tickets) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const primaries = tickets.filter((t) => t.tier === "primary").sort((a, b) => compareTicketIds(a.id, b.id));

  const moonsByHost = new Map();
  for (const t of tickets) {
    if (t.tier !== "dependent") continue;
    if (!moonsByHost.has(t.hostId)) moonsByHost.set(t.hostId, []);
    moonsByHost.get(t.hostId).push(t);
  }
  for (const moons of moonsByHost.values()) moons.sort((a, b) => compareTicketIds(a.id, b.id));

  const sunRadius = TUNING.sunBaseRadius + Math.sqrt(primaries.length) * TUNING.sunGrowthPerSqrtPlanetCount;

  const wanted = primaries.map((p) => {
    const moons = moonsByHost.get(p.id) ?? [];
    const bodyRadius = planetBodyRadius(moons.length);
    return { ticket: p, moons, bodyRadius, shellRadius: moonShellRadius(bodyRadius, moons.length) };
  });

  const planets = [];
  let orbitRadius = Math.max(sunRadius + 30, 90);
  for (let i = 0; i < wanted.length; i++) {
    const prevShell = i === 0 ? 0 : wanted[i - 1].shellRadius;
    orbitRadius += prevShell + wanted[i].shellRadius + TUNING.orbitToOrbitBuffer;
    const angle = (i + 1) * GOLDEN_ANGLE;
    const x = orbitRadius * Math.cos(angle);
    const y = orbitRadius * Math.sin(angle);

    const moons = wanted[i].moons.map((m, j) => {
      const moonRadius = wanted[i].bodyRadius + TUNING.moonBodyRadius + TUNING.moonToMoonSpacing + j * (TUNING.moonBodyRadius * 2 + TUNING.moonToMoonSpacing);
      const mAngle = (j + 1) * GOLDEN_ANGLE;
      return { ticket: m, x: x + moonRadius * Math.cos(mAngle), y: y + moonRadius * Math.sin(mAngle), r: TUNING.moonBodyRadius };
    });

    planets.push({ ticket: wanted[i].ticket, x, y, r: wanted[i].bodyRadius, moons });
  }

  // Cross-link endpoints: for a shared dependent, a thin line out to each
  // non-canonical primary it's also blocked behind (the diamond rule's
  // visual trace). Primary-tier tickets never carry cross-links — any
  // ticket with an in-map blocker is, by construction, a dependent, so
  // the planet ring never needs one.
  const planetById = new Map(planets.map((p) => [p.ticket.id, p]));
  const crossLinks = [];
  for (const planet of planets) {
    for (const moon of planet.moons) {
      for (const otherId of moon.ticket.crossLinkIds) {
        const other = planetById.get(otherId);
        if (other) crossLinks.push({ from: moon, to: other });
      }
    }
  }

  const maxRadius = planets.length ? orbitRadius : sunRadius;
  return { sunRadius, planets, crossLinks, maxRadius, byId };
}

function computeDefaultScale(maxRadius) {
  const target = Math.min(window.innerWidth, window.innerHeight) * 0.42;
  return Math.max(0.05, Math.min(3, target / Math.max(maxRadius, 1)));
}

// ---------------------------------------------------------------------
// Coordinate transforms

function worldToScreen(wx, wy) {
  return { x: window.innerWidth / 2 + (wx - panX) * scale, y: window.innerHeight / 2 + (wy - panY) * scale };
}
function screenToWorld(sx, sy) {
  return { x: (sx - window.innerWidth / 2) / scale + panX, y: (sy - window.innerHeight / 2) / scale + panY };
}

// ---------------------------------------------------------------------
// Type icons — drawn in body-local coordinates centered on (0,0), sized
// independently of the body's own radius so a small moon still renders a
// legible glyph instead of falling back to a plain dot.

function drawFlaskIcon(size, color) {
  skyCtx.strokeStyle = color;
  skyCtx.lineWidth = Math.max(1, size * 0.14);
  const neckW = size * 0.3;
  const neckH = size * 0.3;
  const bodyW = size * 0.8;
  skyCtx.beginPath();
  skyCtx.moveTo(-neckW / 2, -size / 2);
  skyCtx.lineTo(neckW / 2, -size / 2);
  skyCtx.lineTo(neckW / 2, -size / 2 + neckH);
  skyCtx.lineTo(bodyW / 2, size / 2);
  skyCtx.lineTo(-bodyW / 2, size / 2);
  skyCtx.lineTo(-neckW / 2, -size / 2 + neckH);
  skyCtx.closePath();
  skyCtx.stroke();
}

function drawPencilIcon(size, color) {
  skyCtx.strokeStyle = color;
  skyCtx.lineWidth = Math.max(1, size * 0.18);
  skyCtx.beginPath();
  skyCtx.moveTo(-size / 2, size / 2);
  skyCtx.lineTo(size / 2, -size / 2);
  skyCtx.stroke();
  skyCtx.beginPath();
  skyCtx.moveTo(size / 2, -size / 2);
  skyCtx.lineTo(size / 2 - size * 0.28, -size / 2);
  skyCtx.lineTo(size / 2, -size / 2 + size * 0.28);
  skyCtx.closePath();
  skyCtx.fillStyle = color;
  skyCtx.fill();
}

function drawFlameIcon(size, color) {
  skyCtx.fillStyle = color;
  skyCtx.beginPath();
  skyCtx.moveTo(0, -size / 2);
  skyCtx.quadraticCurveTo(size * 0.42, -size * 0.05, size * 0.18, size * 0.3);
  skyCtx.quadraticCurveTo(size * 0.3, size * 0.1, 0, size / 2);
  skyCtx.quadraticCurveTo(-size * 0.3, size * 0.1, -size * 0.18, size * 0.3);
  skyCtx.quadraticCurveTo(-size * 0.42, -size * 0.05, 0, -size / 2);
  skyCtx.fill();
}

function drawChecklistIcon(size, color) {
  skyCtx.strokeStyle = color;
  skyCtx.lineWidth = Math.max(1, size * 0.16);
  skyCtx.strokeRect(-size / 2, -size / 2, size, size);
  skyCtx.beginPath();
  skyCtx.moveTo(-size * 0.28, 0);
  skyCtx.lineTo(-size * 0.05, size * 0.22);
  skyCtx.lineTo(size * 0.3, -size * 0.22);
  skyCtx.stroke();
}

const TYPE_ICON = { research: drawFlaskIcon, prototype: drawPencilIcon, grilling: drawFlameIcon, task: drawChecklistIcon };

// ---------------------------------------------------------------------
// Status ring — border treatment carries status so it's legible without
// hovering: solid + slow pulse for frontier, dashed for blocked, a glow
// for claimed, and a bold dedicated-color ring (not dimmed) for closed.

function drawStatusRing(x, y, r, status, tSec) {
  const style = STATUS_STYLE[status];
  const ringR = r + Math.max(3, r * 0.3);
  skyCtx.save();
  if (status === "frontier") {
    skyCtx.globalAlpha = 0.65 + 0.35 * Math.sin(tSec * 1.8);
    skyCtx.strokeStyle = style.ring;
    skyCtx.lineWidth = 2;
    skyCtx.beginPath();
    skyCtx.arc(x, y, ringR, 0, Math.PI * 2);
    skyCtx.stroke();
  } else if (status === "blocked") {
    skyCtx.strokeStyle = style.ring;
    skyCtx.lineWidth = 1.5;
    skyCtx.setLineDash([3, 3]);
    skyCtx.beginPath();
    skyCtx.arc(x, y, ringR, 0, Math.PI * 2);
    skyCtx.stroke();
  } else if (status === "claimed") {
    skyCtx.shadowColor = style.ring;
    skyCtx.shadowBlur = 10;
    skyCtx.strokeStyle = style.ring;
    skyCtx.lineWidth = 2.5;
    skyCtx.beginPath();
    skyCtx.arc(x, y, ringR, 0, Math.PI * 2);
    skyCtx.stroke();
  } else {
    skyCtx.strokeStyle = style.ring;
    skyCtx.lineWidth = 3;
    skyCtx.beginPath();
    skyCtx.arc(x, y, ringR, 0, Math.PI * 2);
    skyCtx.stroke();
  }
  skyCtx.restore();
}

function drawBody(x, y, r, ticket, tSec, isHovered) {
  const style = STATUS_STYLE[ticket.status];
  const light = isHovered ? Math.min(85, style.light + 15) : style.light;
  skyCtx.fillStyle = `hsl(${style.hue}, ${style.sat}%, ${light}%)`;
  skyCtx.beginPath();
  skyCtx.arc(x, y, r, 0, Math.PI * 2);
  skyCtx.fill();

  drawStatusRing(x, y, r, ticket.status, tSec);

  const iconSize = Math.max(6, 11 * Math.min(1, Math.max(0.5, scale)));
  skyCtx.save();
  skyCtx.translate(x, y);
  (TYPE_ICON[ticket.type] ?? drawChecklistIcon)(iconSize, "#0a0b12");
  skyCtx.restore();
}

// ---------------------------------------------------------------------
// Draw

function drawStarfield(tSec) {
  skyCtx.fillStyle = "#05060a";
  skyCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  for (const s of stars) {
    const twinkle = 0.5 + 0.5 * Math.sin(tSec * s.speed + s.phase);
    skyCtx.globalAlpha = 0.25 + twinkle * 0.6;
    skyCtx.fillStyle = "#cfd4ff";
    skyCtx.beginPath();
    skyCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    skyCtx.fill();
  }
  skyCtx.globalAlpha = 1;
}

function drawSun(cx, cy, radius, tSec) {
  const pulse = 1 + 0.03 * Math.sin(tSec * 0.9);
  const r = radius * scale * pulse;
  const glow = skyCtx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
  glow.addColorStop(0, "rgba(255, 224, 150, 0.9)");
  glow.addColorStop(1, "rgba(255, 180, 72, 0)");
  skyCtx.fillStyle = glow;
  skyCtx.beginPath();
  skyCtx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
  skyCtx.fill();
  skyCtx.fillStyle = "#ffe9b0";
  skyCtx.beginPath();
  skyCtx.arc(cx, cy, r, 0, Math.PI * 2);
  skyCtx.fill();
}

function draw(tSec) {
  drawStarfield(tSec);
  if (!layout) return;

  const sunScreen = worldToScreen(0, 0);

  // Faint connector lines under the bodies: sun→planet, planet→moon — the
  // hierarchy edges are visible directly on the canvas, not just
  // inferable from position.
  skyCtx.strokeStyle = "rgba(255,255,255,0.10)";
  skyCtx.lineWidth = 1;
  for (const planet of layout.planets) {
    const ps = worldToScreen(planet.x, planet.y);
    skyCtx.beginPath();
    skyCtx.moveTo(sunScreen.x, sunScreen.y);
    skyCtx.lineTo(ps.x, ps.y);
    skyCtx.stroke();
    for (const moon of planet.moons) {
      const ms = worldToScreen(moon.x, moon.y);
      skyCtx.beginPath();
      skyCtx.moveTo(ps.x, ps.y);
      skyCtx.lineTo(ms.x, ms.y);
      skyCtx.stroke();
    }
  }

  // Cross-link lines: thin, dashed, dimmer than the hierarchy edges —
  // diamond-dependency information, not the primary hierarchy.
  skyCtx.strokeStyle = "rgba(170,200,255,0.3)";
  skyCtx.lineWidth = 1;
  skyCtx.setLineDash([2, 3]);
  for (const link of layout.crossLinks) {
    const from = worldToScreen(link.from.x, link.from.y);
    const to = worldToScreen(link.to.x, link.to.y);
    skyCtx.beginPath();
    skyCtx.moveTo(from.x, from.y);
    skyCtx.lineTo(to.x, to.y);
    skyCtx.stroke();
  }
  skyCtx.setLineDash([]);

  drawSun(sunScreen.x, sunScreen.y, layout.sunRadius, tSec);

  let nextHovered = null;
  const testHover = (x, y, r, ticket) => {
    const dist = Math.hypot(mouseX - x, mouseY - y);
    if (dist <= r + 6) nextHovered = { ticket, x, y, r };
  };

  for (const planet of layout.planets) {
    const ps = worldToScreen(planet.x, planet.y);
    const pr = Math.max(2, planet.r * scale);
    testHover(ps.x, ps.y, pr, planet.ticket);
    drawBody(ps.x, ps.y, pr, planet.ticket, tSec, hovered?.ticket.id === planet.ticket.id);

    for (const moon of planet.moons) {
      const ms = worldToScreen(moon.x, moon.y);
      const mr = Math.max(1.5, moon.r * scale);
      testHover(ms.x, ms.y, mr, moon.ticket);
      drawBody(ms.x, ms.y, mr, moon.ticket, tSec, hovered?.ticket.id === moon.ticket.id);
    }
  }
  hovered = nextHovered;
  sky.style.cursor = hovered ? "pointer" : dragging ? "grabbing" : "grab";

  drawMinimap();
  updateHud();
}

function drawMinimap() {
  const w = minimap.width;
  const h = minimap.height;
  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = "rgba(5,6,10,0.7)";
  minimapCtx.fillRect(0, 0, w, h);
  if (!layout) return;

  const pad = 10 * devicePixelRatio;
  const mScale = (Math.min(w, h) - pad * 2) / (layout.maxRadius * 2);
  const cx = w / 2;
  const cy = h / 2;

  minimapCtx.fillStyle = "#ffe9b0";
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, 3 * devicePixelRatio, 0, Math.PI * 2);
  minimapCtx.fill();

  for (const planet of layout.planets) {
    minimapCtx.fillStyle = STATUS_STYLE[planet.ticket.status].ring;
    minimapCtx.beginPath();
    minimapCtx.arc(cx + planet.x * mScale, cy + planet.y * mScale, 2 * devicePixelRatio, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(window.innerWidth, window.innerHeight);
  minimapCtx.strokeStyle = "#ffd166";
  minimapCtx.lineWidth = 1.5 * devicePixelRatio;
  minimapCtx.strokeRect(
    cx + topLeft.x * mScale,
    cy + topLeft.y * mScale,
    (bottomRight.x - topLeft.x) * mScale,
    (bottomRight.y - topLeft.y) * mScale,
  );
}

// ---------------------------------------------------------------------
// HUD — labels/titles appear only on hover or click, never as always-on
// canvas text.

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
// Pan/zoom/hover/click

sky.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (dragging) {
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
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.001);
    scale = Math.min(6, Math.max(0.03, scale * factor));
  },
  { passive: false },
);
sky.addEventListener("dblclick", () => {
  if (layout) scale = computeDefaultScale(layout.maxRadius);
  panX = 0;
  panY = 0;
});
minimap.addEventListener("click", (e) => {
  if (!layout) return;
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
  layout = buildLayout(viewModel.tickets);
  scale = computeDefaultScale(layout.maxRadius);
  panX = 0;
  panY = 0;
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
  resize();
  seedStarfield();

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

