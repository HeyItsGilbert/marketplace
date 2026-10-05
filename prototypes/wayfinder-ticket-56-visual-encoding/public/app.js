// PROTOTYPE — throwaway. See ../README.md.
//
// Renders one fixture system (the map) as a sun with 16 orbiting planets —
// one per type×state cell — plus a few moons hung off two planets. Shared
// orbit/starfield mechanics are lifted from ../../wayfinder-star-map/; what
// this file adds is the thing ticket #56 is actually about: three
// switchable takes on how state (ring) and type (icon) render on a body.

const canvas = document.getElementById("sky");
const ctx = canvas.getContext("2d");
const bodyNameEl = document.getElementById("bodyName");
const bodyDescEl = document.getElementById("bodyDesc");
const legendEl = document.getElementById("legend");
const switcherEl = document.getElementById("switcher");

const VARIANTS = ["A", "B", "C"];
const VARIANT_LABELS = {
  A: "A — identity hue, icons planet-scale only",
  B: "B — urgency hue, icons at any scale",
  C: "C — neutral hue, bold closed ring, icon chip",
};
const STATE_LEGEND = "ring: solid+pulse=frontier, dashed=blocked, glow=claimed, see variant=closed";
const TYPE_LEGEND = "icon: flask=research, pencil=prototype, flame=grilling, check=task";

let system = null;
let layout = null; // computed orbit layout for the fixture system
let stars = [];
let variant = new URLSearchParams(location.search).get("variant") ?? "A";
if (!VARIANTS.includes(variant)) variant = "A";

const SLOWDOWN = 0.15;
let orbitTime = 0;
let lastFrameMs = null;
let mouseX = -1;
let mouseY = -1;
let hoveredBody = null; // set from the previous frame's draw positions
let pausedByHover = false;

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});
canvas.addEventListener("mouseleave", () => {
  mouseX = -1;
  mouseY = -1;
  hoveredBody = null;
  pausedByHover = false;
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);

function seedStarfield() {
  stars = [];
  const count = Math.floor((window.innerWidth * window.innerHeight) / 2200);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.6,
    });
  }
}

// Deterministic hue from a string — used by variant A as "identity," kept
// around so A can be compared directly against B/C's non-identity hues.
function hueFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Variant B's hue: state carries urgency heat directly (not identity).
const STATE_HUE = { frontier: 32, claimed: 205, blocked: 0, closed: 0 };
const STATE_SAT = { frontier: 85, claimed: 70, blocked: 70, closed: 0 };

function buildLayout(sys) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const planetRadius = Math.min(window.innerWidth, window.innerHeight) * 0.38;
  const planets = sys.planets.map((p, i) => {
    const angle = (i / sys.planets.length) * Math.PI * 2;
    const orbitR = planetRadius * (0.55 + 0.45 * ((i % 3) / 2)); // stagger rings so 16 bodies don't overlap
    const period = 40 + (i % 5) * 9;
    const moons = p.moons.map((m, j) => ({
      ticket: m,
      orbitR: 20 + j * 12,
      period: 5 + j * 2,
      angleOffset: (j / Math.max(p.moons.length, 1)) * Math.PI * 2,
    }));
    return { ticket: p, angle, orbitR, period, moons };
  });
  return { cx, cy, planets };
}

function drawStarfield(tSec) {
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  for (const s of stars) {
    const twinkle = 0.5 + 0.5 * Math.sin(tSec * s.speed + s.phase);
    ctx.globalAlpha = 0.3 + twinkle * 0.7;
    ctx.fillStyle = "#cfd4ff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSun(cx, cy, tSec, name) {
  const pulse = 1 + 0.03 * Math.sin(tSec * 0.8);
  const r = 26 * pulse;
  const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.4);
  grad.addColorStop(0, "#fff3c4");
  grad.addColorStop(0.4, "#ffd166");
  grad.addColorStop(1, "rgba(255,209,102,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawOrbitRing(cx, cy, radius) {
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

// --- type icons, drawn in body-local coordinates centered on (0,0) -------

function drawFlaskIcon(size, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.12);
  const neckW = size * 0.3;
  const neckH = size * 0.3;
  const bodyW = size * 0.8;
  ctx.beginPath();
  ctx.moveTo(-neckW / 2, -size / 2);
  ctx.lineTo(neckW / 2, -size / 2);
  ctx.lineTo(neckW / 2, -size / 2 + neckH);
  ctx.lineTo(bodyW / 2, size / 2);
  ctx.lineTo(-bodyW / 2, size / 2);
  ctx.lineTo(-neckW / 2, -size / 2 + neckH);
  ctx.closePath();
  ctx.stroke();
}

function drawPencilIcon(size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.beginPath();
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size / 2, -size / 2);
  ctx.lineTo(size / 2 - size * 0.28, -size / 2);
  ctx.lineTo(size / 2, -size / 2 + size * 0.28);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawFlameIcon(size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size / 2);
  ctx.quadraticCurveTo(size * 0.42, -size * 0.05, size * 0.18, size * 0.3);
  ctx.quadraticCurveTo(size * 0.3, size * 0.1, 0, size / 2);
  ctx.quadraticCurveTo(-size * 0.3, size * 0.1, -size * 0.18, size * 0.3);
  ctx.quadraticCurveTo(-size * 0.42, -size * 0.05, 0, -size / 2);
  ctx.fill();
}

function drawChecklistIcon(size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.14);
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.beginPath();
  ctx.moveTo(-size * 0.28, 0);
  ctx.lineTo(-size * 0.05, size * 0.22);
  ctx.lineTo(size * 0.3, -size * 0.22);
  ctx.stroke();
}

const TYPE_ICON = { research: drawFlaskIcon, prototype: drawPencilIcon, grilling: drawFlameIcon, task: drawChecklistIcon };

// --- state rings -----------------------------------------------------------

// Shared ring geometry (solid/dashed/glow) used by all three variants;
// `closedStyle` is the one piece each variant disagrees about.
function drawStateRing(x, y, r, state, tSec, ringColor, closedStyle) {
  const ringR = r + 5;
  if (state === "frontier") {
    const pulse = 0.7 + 0.3 * Math.sin(tSec * 2);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (state === "blocked") {
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (state === "claimed") {
    ctx.save();
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (state === "closed") {
    closedStyle(x, y, ringR);
  }
}

// --- per-variant body rendering ---------------------------------------------

function drawBody(x, y, r, ticket, tSec, isMoon) {
  const icon = TYPE_ICON[ticket.type];

  if (variant === "A") {
    const hue = hueFromName(ticket.id); // identity hue, same trick as the precedent prototype
    const fill = `hsl(${hue}, 70%, 60%)`;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    drawStateRing(x, y, r, ticket.state, tSec, "#e7e9f0", (cx, cy, ringR) => {
      ctx.strokeStyle = "#6a6f85";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    // Icons only at planet scale — moons fall back to the colored dot alone.
    if (!isMoon) {
      ctx.save();
      ctx.translate(x, y);
      icon(r * 0.9, "#05060a");
      ctx.restore();
    }
  } else if (variant === "B") {
    const hue = STATE_HUE[ticket.state];
    const sat = STATE_SAT[ticket.state];
    const fill = `hsl(${hue}, ${sat}%, ${ticket.state === "closed" ? 35 : 55}%)`;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    drawStateRing(x, y, r, ticket.state, tSec, "#e7e9f0", (cx, cy, ringR) => {
      ctx.strokeStyle = "#8a8fa8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Icon size is fixed regardless of body radius, so moons stay legible.
    ctx.save();
    ctx.translate(x, y);
    icon(14, "#05060a");
    ctx.restore();
  } else {
    // Variant C: hue stays neutral (freed for a future cross-link channel);
    // closed gets a bold, fully-saturated ring instead of just "undimmed."
    ctx.fillStyle = "#4a4f68";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    drawStateRing(x, y, r, ticket.state, tSec, "#9ec8ff", (cx, cy, ringR) => {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Icon on a small dark contrast chip so it reads over any ring color.
    const chip = Math.max(14, r * 1.1);
    ctx.fillStyle = "rgba(5,6,10,0.85)";
    ctx.beginPath();
    ctx.roundRect(x - chip / 2, y - chip / 2, chip, chip, 3);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    icon(chip * 0.6, "#e7e9f0");
    ctx.restore();
  }
}

function drawLabel(x, y, text, size) {
  ctx.font = `${size}px ui-monospace, monospace`;
  ctx.fillStyle = "#e7e9f0";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

function render(t) {
  const dt = lastFrameMs === null ? 0 : (t - lastFrameMs) / 1000;
  lastFrameMs = t;
  if (!pausedByHover) orbitTime += dt * SLOWDOWN;
  const tSec = orbitTime;

  drawStarfield(t / 1000);

  if (!layout) {
    requestAnimationFrame(render);
    return;
  }

  drawSun(layout.cx, layout.cy, t / 1000, system.name);

  let nextHovered = null;
  const PLANET_R = 9;
  const MOON_R = 5;

  for (const planet of layout.planets) {
    drawOrbitRing(layout.cx, layout.cy, planet.orbitR);
    const angle = planet.angle + tSec * (Math.PI * 2) / planet.period;
    const px = layout.cx + Math.cos(angle) * planet.orbitR;
    const py = layout.cy + Math.sin(angle) * planet.orbitR;

    if (mouseX >= 0 && Math.hypot(mouseX - px, mouseY - py) < PLANET_R + 6) nextHovered = planet.ticket;

    drawBody(px, py, PLANET_R, planet.ticket, tSec, false);

    for (const m of planet.moons) {
      const mAngle = m.angleOffset + tSec * (Math.PI * 2) / m.period;
      const mx = px + Math.cos(mAngle) * m.orbitR;
      const my = py + Math.sin(mAngle) * m.orbitR;
      if (mouseX >= 0 && Math.hypot(mouseX - mx, mouseY - my) < MOON_R + 6) nextHovered = m.ticket;
      drawBody(mx, my, MOON_R, m.ticket, tSec, true);
    }
  }

  pausedByHover = nextHovered !== null;
  if (nextHovered !== hoveredBody) {
    hoveredBody = nextHovered;
    if (hoveredBody) {
      bodyNameEl.textContent = hoveredBody.name;
      bodyDescEl.textContent = `type: ${hoveredBody.type}  ·  state: ${hoveredBody.state}`;
    } else {
      bodyNameEl.textContent = "Hover a planet or moon";
      bodyDescEl.textContent = "";
    }
  }

  requestAnimationFrame(render);
}

function renderSwitcher() {
  switcherEl.innerHTML = "";
  const left = document.createElement("button");
  left.textContent = "←";
  left.addEventListener("click", () => cycle(-1));
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = VARIANT_LABELS[variant];
  const right = document.createElement("button");
  right.textContent = "→";
  right.addEventListener("click", () => cycle(1));
  switcherEl.append(left, label, right);
}

function cycle(delta) {
  const i = VARIANTS.indexOf(variant);
  variant = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length];
  const params = new URLSearchParams(location.search);
  params.set("variant", variant);
  history.replaceState(null, "", `${location.pathname}?${params}`);
  renderSwitcher();
}

window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")) return;
  if (e.key === "ArrowLeft") cycle(-1);
  if (e.key === "ArrowRight") cycle(1);
});

async function init() {
  resize();
  seedStarfield();
  system = await fetch("/api/system").then((r) => r.json());
  layout = buildLayout(system);
  legendEl.textContent = `${STATE_LEGEND}  ·  ${TYPE_LEGEND}`;
  renderSwitcher();
  requestAnimationFrame(render);
}

init();
