// PROTOTYPE — throwaway. See ../README.md.
//
// Renders one "system" (a plugin) as a sun with orbiting planets (its
// skills/agents) and moons (each planet's allowed-tools). Jumping systems
// just swaps which system's data drives the orbit layout.

const canvas = document.getElementById("sky");
const ctx = canvas.getContext("2d");
const systemNameEl = document.getElementById("systemName");
const systemDescEl = document.getElementById("systemDesc");
const jumpBar = document.getElementById("jumpBar");

let systems = [];
let currentIndex = 0;
let layout = null; // computed orbit layout for the current system
let stars = [];

// Orbits run on their own accumulated clock (seconds), not the raw rAF
// timestamp (ms) — advancing it is how hover-pause freezes motion, and
// SLOWDOWN is the "a lot slower" the user asked for on top of the base
// (already-correct) orbital periods.
const SLOWDOWN = 0.15;
let orbitTime = 0;
let lastFrameMs = null;
let mouseX = -1;
let mouseY = -1;
let hoveredPlanet = null; // set from the previous frame's draw positions
let pausedByHover = false;

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});
canvas.addEventListener("mouseleave", () => {
  mouseX = -1;
  mouseY = -1;
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (systems.length) layout = buildLayout(systems[currentIndex]);
}
window.addEventListener("resize", resize);

function seedStarfield() {
  const count = Math.floor((window.innerWidth * window.innerHeight) / 2200);
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: Math.random() * 1.3 + 0.2,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 1.2,
  }));
}

// Deterministic hue from a string so the same skill/tool always gets the
// same color across renders and systems.
function hueFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function buildLayout(system) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const maxRadius = Math.min(canvas.width, canvas.height) * 0.42;
  const minRadius = 70;
  const n = Math.max(system.planets.length, 1);

  const planets = system.planets.map((planet, i) => {
    const orbitRadius = minRadius + ((maxRadius - minRadius) * (i + 1)) / n;
    const moons = planet.moons.map((moon, j) => ({
      ...moon,
      orbitRadius: 16 + j * 10,
      angle: (j / Math.max(planet.moons.length, 1)) * Math.PI * 2,
      // inner moons circle faster, like real orbital mechanics
      speed: 1.6 + j * 0.6,
      hue: hueFromName(moon.name),
    }));
    return {
      ...planet,
      orbitRadius,
      angle: (i / n) * Math.PI * 2 + i * 0.6,
      speed: 0.18 + 0.5 / (i + 1.6),
      size: 7 + Math.min(planet.description.length / 25, 6),
      hue: hueFromName(planet.name),
      moons,
    };
  });

  return { cx, cy, planets };
}

function drawStarfield(tSec) {
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of stars) {
    const twinkle = 0.5 + 0.5 * Math.sin(tSec * s.speed + s.phase);
    ctx.globalAlpha = 0.25 + twinkle * 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSun(cx, cy, tSec, name) {
  const pulse = 1 + 0.04 * Math.sin(tSec * 1.5);
  const r = 26 * pulse;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
  glow.addColorStop(0, "rgba(255, 209, 102, 0.9)");
  glow.addColorStop(0.3, "rgba(255, 170, 60, 0.35)");
  glow.addColorStop(1, "rgba(255, 170, 60, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffe9b0";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawOrbitRing(cx, cy, radius) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLabel(x, y, text, size) {
  ctx.font = `${size}px ui-monospace, monospace`;
  ctx.fillStyle = "rgba(231, 233, 240, 0.85)";
  ctx.fillText(text, x + size + 4, y + size / 3);
}

function render(t) {
  const nowSec = t / 1000;
  if (lastFrameMs !== null) {
    const dtSec = (t - lastFrameMs) / 1000;
    if (!pausedByHover) orbitTime += dtSec * SLOWDOWN;
  }
  lastFrameMs = t;

  drawStarfield(nowSec);

  if (!layout) {
    requestAnimationFrame(render);
    return;
  }

  const { cx, cy, planets } = layout;
  const system = systems[currentIndex];

  drawSun(cx, cy, nowSec, system.name);

  let nextHovered = null;

  for (const planet of planets) {
    drawOrbitRing(cx, cy, planet.orbitRadius);

    const angle = planet.angle + orbitTime * planet.speed;
    const px = cx + planet.orbitRadius * Math.cos(angle);
    const py = cy + planet.orbitRadius * Math.sin(angle);

    const isHovered = Math.hypot(mouseX - px, mouseY - py) <= planet.size + 8;
    if (isHovered) nextHovered = planet.id;

    if (isHovered) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, planet.size + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = `hsl(${planet.hue}, 70%, 65%)`;
    ctx.beginPath();
    ctx.arc(px, py, planet.size, 0, Math.PI * 2);
    ctx.fill();
    drawLabel(px, py, planet.name, 12);

    for (const moon of planet.moons) {
      drawOrbitRing(px, py, moon.orbitRadius);
      const mAngle = moon.angle + orbitTime * moon.speed;
      const mx = px + moon.orbitRadius * Math.cos(mAngle);
      const my = py + moon.orbitRadius * Math.sin(mAngle);

      ctx.fillStyle = `hsl(${moon.hue}, 20%, 75%)`;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
      drawLabel(mx, my, moon.name, 9);
    }
  }

  // Pause takes effect next frame — negligible one-frame lag, avoids
  // computing this frame's positions from a decision made on this frame's
  // not-yet-drawn positions.
  pausedByHover = nextHovered !== null;
  hoveredPlanet = nextHovered;
  canvas.style.cursor = pausedByHover ? "pointer" : "default";

  requestAnimationFrame(render);
}


function renderJumpBar() {
  jumpBar.innerHTML = "";

  const prev = document.createElement("button");
  prev.className = "arrow";
  prev.textContent = "←";
  prev.onclick = () => jumpTo(currentIndex - 1);
  jumpBar.appendChild(prev);

  systems.forEach((system, i) => {
    const btn = document.createElement("button");
    btn.textContent = system.name;
    if (i === currentIndex) btn.classList.add("active");
    btn.onclick = () => jumpTo(i);
    jumpBar.appendChild(btn);
  });

  const next = document.createElement("button");
  next.className = "arrow";
  next.textContent = "→";
  next.onclick = () => jumpTo(currentIndex + 1);
  jumpBar.appendChild(next);
}

function jumpTo(index) {
  currentIndex = (index + systems.length) % systems.length;
  const system = systems[currentIndex];
  layout = buildLayout(system);
  systemNameEl.textContent = system.name;
  systemDescEl.textContent = system.description;
  renderJumpBar();
}

window.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) return;
  if (e.key === "ArrowLeft") jumpTo(currentIndex - 1);
  if (e.key === "ArrowRight") jumpTo(currentIndex + 1);
});

async function init() {
  resize();
  seedStarfield();
  systems = await fetch("/api/systems").then((r) => r.json());
  jumpTo(0);
  requestAnimationFrame(render);
}

init();
