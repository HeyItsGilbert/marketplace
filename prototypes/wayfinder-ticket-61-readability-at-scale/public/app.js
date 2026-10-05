// PROTOTYPE — throwaway. See ../README.md.
//
// Stress-tests wayfinder #61's locked structural decisions against a live
// planet/moon-count slider, instead of guessing a readability number in
// the abstract:
//
//   - three layout modes to compare: single growing ring, concentric
//     rings, and an organic phyllotaxis scatter (each planet its own
//     orbital radius) — scatter is default, per feedback
//   - scatter's orbital spacing is rotation-safe: radial gap alone (never
//     angular position) must clear both neighbors' full moon-shell radii,
//     so planets could actually orbit at independent speeds without ever
//     colliding
//   - moon orbit radius grows with moon count; moons past a shell's own
//     packing capacity collapse into a "+K more" badge
//   - pan + zoom, with an initial "legible default" scale
//   - a corner minimap, always shown
//   - sun radius grows with planet count (sqrt); planet body radius grows
//     with that planet's own moon count — both for visual variety and as
//     an at-a-glance crowding/weight signal
//
// Fixture data is synthetic (Pn / moon counts from a seeded PRNG), not
// read off real tickets — this prototype is about the layout math holding
// up at scale, not about real content.

const canvas = document.getElementById("sky");
const ctx = canvas.getContext("2d");
const minimapCanvas = document.getElementById("minimap");
const mctx = minimapCanvas.getContext("2d");

const planetCountInput = document.getElementById("planetCount");
const layoutModeInput = document.getElementById("layoutMode");
const moonCountInput = document.getElementById("moonCount");
const planetCountLabel = document.getElementById("planetCountLabel");
const moonCountLabel = document.getElementById("moonCountLabel");
const statsEl = document.getElementById("stats");

// Tuning sliders — size/spacing knobs the user plays with directly rather
// than fixed constants edited and re-served each time.
const tuningInputs = {
  sunBase: document.getElementById("sunBase"),
  sunGrowth: document.getElementById("sunGrowth"),
  planetBase: document.getElementById("planetBase"),
  planetPerMoon: document.getElementById("planetPerMoon"),
  moonBody: document.getElementById("moonBody"),
  moonStep: document.getElementById("moonStep"),
  orbitBuffer: document.getElementById("orbitBuffer"),
};
const tuningLabels = {
  sunBase: document.getElementById("sunBaseLabel"),
  sunGrowth: document.getElementById("sunGrowthLabel"),
  planetBase: document.getElementById("planetBaseLabel"),
  planetPerMoon: document.getElementById("planetPerMoonLabel"),
  moonBody: document.getElementById("moonBodyLabel"),
  moonStep: document.getElementById("moonStepLabel"),
  orbitBuffer: document.getElementById("orbitBufferLabel"),
};

function readTuning() {
  return {
    sunBase: parseFloat(tuningInputs.sunBase.value),
    sunGrowth: parseFloat(tuningInputs.sunGrowth.value),
    planetBase: parseFloat(tuningInputs.planetBase.value),
    planetPerMoon: parseFloat(tuningInputs.planetPerMoon.value),
    moonBody: parseFloat(tuningInputs.moonBody.value),
    moonStep: parseFloat(tuningInputs.moonStep.value),
    orbitBuffer: parseFloat(tuningInputs.orbitBuffer.value),
  };
}

// World-space constants (not screen pixels) — the "budget" the ring-growth
// and moon-cap decisions are protecting. These stay fixed (not sliders):
// they set the overall layout scale, not a visual size/spacing knob.
const TARGET_GAP_WORLD = 46; // desired world-space distance between neighboring planet centers
const MIN_RING_RADIUS = 90;
const DESIRED_PX_GAP = 60; // on-screen gap at the "legible default" zoom
const DEFAULT_SCALE = DESIRED_PX_GAP / TARGET_GAP_WORLD;

let scale = DEFAULT_SCALE;
let panX = 0;
let panY = 0;
let dragging = false;
let dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

let layout = null;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Fixed CSS size (see style.css #minimap) — computed up front, not from
  // clientWidth, because that reads 0 while display:none hides it and the
  // minimap only becomes visible later once planet count crosses the gate.
  minimapCanvas.width = 160 * devicePixelRatio;
  minimapCanvas.height = 160 * devicePixelRatio;
}
window.addEventListener("resize", resize);

// Deterministic PRNG so moving a slider reshuffles counts predictably
// rather than jittering every frame.
function seededRand(seed) {
  let x = Math.sin(seed * 999.17) * 43758.5453;
  return x - Math.floor(x);
}

function buildLayoutSingle(n, maxMoons, sunRadius, tuning) {
  const innerFloor = Math.max(MIN_RING_RADIUS, sunRadius + 20);
  const radius = Math.max(innerFloor, TARGET_GAP_WORLD / (2 * Math.sin(Math.PI / n)));
  const chordGap = 2 * radius * Math.sin(Math.PI / n);
  const moonCap = chordGap / 2;
  const ring = { radius };

  const planets = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    planets.push(placePlanet(i + 1, radius * Math.cos(angle), radius * Math.sin(angle), chordGap, moonCap, maxMoons, i + 1, tuning));
  }

  return { mode: "single", rings: [ring], planets, maxRadius: radius };
}

function buildLayoutConcentric(n, maxMoons, sunRadius, tuning) {
  const innerFloor = Math.max(MIN_RING_RADIUS, sunRadius + 20);
  // Ring spacing must clear the widest moon shell a planet on the inner
  // ring could grow, so outward rings never visually collide with the
  // previous ring's moons — unlike the single-ring model, radial distance
  // between rings is a real constraint, not just an angular one.
  const maxPossibleMoonRadius = moonFieldRadius(tuning.planetBase + maxMoons * tuning.planetPerMoon, maxMoons, tuning);
  const ringSpacing = Math.max(90, maxPossibleMoonRadius * 2 + 30);

  const rings = [];
  const planets = [];
  let remaining = n;
  let ringIndex = 0;
  let placedIdx = 0;

  while (remaining > 0) {
    const radius = innerFloor + ringIndex * ringSpacing;
    const capacity = Math.max(1, Math.floor((2 * Math.PI * radius) / TARGET_GAP_WORLD));
    const count = Math.min(remaining, capacity);
    const chordGap = 2 * radius * Math.sin(Math.PI / count);
    // also never let a moon shell reach halfway to the next ring radially
    const moonCap = Math.min(chordGap / 2, ringSpacing / 2 - 10);
    rings.push({ radius });

    const angleOffset = (ringIndex % 2) * (Math.PI / count);
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + angleOffset;
      placedIdx++;
      planets.push(placePlanet(placedIdx, radius * Math.cos(angle), radius * Math.sin(angle), chordGap, moonCap, maxMoons, placedIdx, tuning));
    }

    remaining -= count;
    ringIndex++;
  }

  const maxRadius = rings.length ? rings[rings.length - 1].radius : innerFloor;
  return { mode: "concentric", rings, planets, maxRadius };
}

// Phyllotaxis-ordered placement — angle advances by the golden angle each
// step for an organic, non-lattice read, but radius is NOT a smooth
// sqrt(index) curve: each planet sits on its own fixed-radius circular
// orbit, and if these ever rotate (per-planet angular speed, like the
// original star-map prototype), two planets on different orbits will
// eventually pass through the same angle — at which point their only
// separation is the radial gap between their orbits. So the radial gap
// between every pair of orbit-adjacent planets must by itself clear both
// planets' full moon-shell radii; angular position can never be relied on
// for separation, only radius can.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function buildLayoutScatter(n, maxMoons, sunRadius, tuning) {
  const wanted = [];
  for (let i = 1; i <= n; i++) {
    const moonCount = Math.round(maxMoons * (0.25 + 0.75 * seededRand(i)));
    const bodyRadiusWorld = tuning.planetBase + moonCount * tuning.planetPerMoon;
    const wantedMoonRadius = moonFieldRadius(bodyRadiusWorld, moonCount, tuning);
    wanted.push({ idx: i, wantedMoonRadius });
  }

  const raw = [];
  let radius = Math.max(MIN_RING_RADIUS, sunRadius + 20);
  for (let k = 0; k < wanted.length; k++) {
    const prevShell = k === 0 ? 0 : wanted[k - 1].wantedMoonRadius;
    radius += prevShell + wanted[k].wantedMoonRadius + tuning.orbitBuffer;
    const angle = wanted[k].idx * GOLDEN_ANGLE;
    raw.push({ idx: wanted[k].idx, radius, wx: radius * Math.cos(angle), wy: radius * Math.sin(angle), wantedMoonRadius: wanted[k].wantedMoonRadius });
  }

  const planets = raw.map((p, k) => {
    const gapPrev = k === 0 ? Infinity : p.radius - raw[k - 1].radius;
    const gapNext = k === raw.length - 1 ? Infinity : raw[k + 1].radius - p.radius;
    // moonCap == the shell radius this orbit's spacing was built to fit —
    // placePlanet's cap never actually binds here (it's exactly what was
    // wanted), unlike single/concentric mode where neighbors can squeeze it.
    return placePlanet(p.idx, p.wx, p.wy, Math.min(gapPrev, gapNext), p.wantedMoonRadius, maxMoons, p.idx, tuning);
  });

  const maxRadius = raw.length ? raw[raw.length - 1].radius : MIN_RING_RADIUS;
  // one faint boundary circle for scale orientation — not a real "ring"
  return { mode: "scatter", rings: [{ radius: maxRadius }], planets, maxRadius };
}

// Exact outer radius a planet's moon spiral needs to fit `moonCount` moons
// with no capping — used both to size a planet's own moons (placePlanet)
// and to reserve enough orbital spacing between planets in the first place
// (buildLayoutScatter/Concentric), so the two never disagree about how
// much room moons actually need.
function moonFieldRadius(bodyRadiusWorld, moonCount, tuning) {
  if (moonCount === 0) return bodyRadiusWorld;
  return bodyRadiusWorld + tuning.moonBody + tuning.moonStep + (moonCount - 1) * (tuning.moonBody * 2 + tuning.moonStep);
}

function placePlanet(id, wx, wy, neighborGap, moonCap, maxMoons, seed, tuning) {
  const moonCount = Math.round(maxMoons * (0.25 + 0.75 * seededRand(seed)));
  const bodyRadiusWorld = tuning.planetBase + moonCount * tuning.planetPerMoon;

  // Moons spiral outward using the same golden-angle, rotation-safe
  // placement as planets around the sun — "each moon its own ring" too,
  // not one shared shell. Stop once the spiral would exceed moonCap (the
  // room this planet's neighbors leave it); the rest become overflow.
  const moons = [];
  let moonRadius = bodyRadiusWorld;
  for (let j = 0; j < moonCount; j++) {
    moonRadius += (j === 0 ? tuning.moonBody : tuning.moonBody * 2) + tuning.moonStep;
    if (moonRadius > moonCap) break;
    const angle = (j + 1) * GOLDEN_ANGLE;
    moons.push({ x: wx + moonRadius * Math.cos(angle), y: wy + moonRadius * Math.sin(angle) });
  }
  const overflow = moonCount - moons.length;

  return {
    id: `P${id}`, wx, wy, bodyRadiusWorld, moons, overflow, moonCount,
    neighborGap, moonCap,
    wasCapped: overflow > 0,
  };
}

function worldToScreen(wx, wy) {
  return {
    x: canvas.width / 2 + (wx - panX) * scale,
    y: canvas.height / 2 + (wy - panY) * scale,
  };
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - canvas.width / 2) / scale + panX,
    y: (sy - canvas.height / 2) / scale + panY,
  };
}

function draw() {
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const n = parseInt(planetCountInput.value, 10);
  const maxMoons = parseInt(moonCountInput.value, 10);
  const mode = layoutModeInput.value;
  const tuning = readTuning();
  const sunRadius = tuning.sunBase + Math.sqrt(n) * tuning.sunGrowth;
  layout = mode === "scatter" ? buildLayoutScatter(n, maxMoons, sunRadius, tuning)
    : mode === "concentric" ? buildLayoutConcentric(n, maxMoons, sunRadius, tuning)
    : buildLayoutSingle(n, maxMoons, sunRadius, tuning);

  // sun — grows with planet count (sqrt, not linear, so it doesn't dwarf
  // everything at high n)
  const sunS = worldToScreen(0, 0);
  ctx.fillStyle = "#ffe9b0";
  ctx.beginPath();
  ctx.arc(sunS.x, sunS.y, sunRadius * scale, 0, Math.PI * 2);
  ctx.fill();

  // ring guides — one per ring in concentric mode, one in single mode
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (const ring of layout.rings) {
    ctx.beginPath();
    ctx.arc(sunS.x, sunS.y, ring.radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  let cappedCount = 0;
  let overflowTotal = 0;

  // faint parent/child connector lines — sun→planet, planet→moon. Not
  // orbit paths, just the hierarchy edge; drawn under the bodies.
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;

  for (const planet of layout.planets) {
    const ps = worldToScreen(planet.wx, planet.wy);
    // body grows with this planet's own moon count — same signal the moon
    // field size already carries, just visible without hovering
    const bodyR = Math.max(2, planet.bodyRadiusWorld * scale);

    ctx.beginPath();
    ctx.moveTo(sunS.x, sunS.y);
    ctx.lineTo(ps.x, ps.y);
    ctx.stroke();

    ctx.fillStyle = planet.wasCapped ? "#ff6b6b" : "#7cc4ff";
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, bodyR, 0, Math.PI * 2);
    ctx.fill();

    if (planet.wasCapped) cappedCount++;
    overflowTotal += planet.overflow;

    for (const moon of planet.moons) {
      const ms = worldToScreen(moon.x, moon.y);

      ctx.beginPath();
      ctx.moveTo(ps.x, ps.y);
      ctx.lineTo(ms.x, ms.y);
      ctx.stroke();

      ctx.fillStyle = "rgba(231,233,240,0.8)";
      ctx.beginPath();
      ctx.arc(ms.x, ms.y, Math.max(1, tuning.moonBody * scale), 0, Math.PI * 2);
      ctx.fill();
    }

    if (planet.overflow > 0 && scale > 0.25) {
      ctx.fillStyle = "rgba(255,209,102,0.9)";
      ctx.font = `${Math.max(8, 10 * scale)}px ui-monospace, monospace`;
      ctx.fillText(`+${planet.overflow}`, ps.x + bodyR + 2, ps.y - bodyR);
    }
  }

  // minimap always on, per feedback — crowding signal moved to sun/planet
  // size scaling instead
  drawMinimap(layout);

  const tightestGap = Math.min(...layout.planets.map((p) => p.neighborGap));
  const smallestMoonCap = Math.min(...layout.planets.map((p) => p.moonCap));

  statsEl.innerHTML = `
    mode: <b>${layout.mode}</b> — rings: <b>${layout.rings.length}</b><br>
    max radius: <b>${layout.maxRadius.toFixed(0)}</b> world units<br>
    tightest neighbor gap: <b>${tightestGap.toFixed(0)}</b> world units<br>
    smallest moon cap: <b>${smallestMoonCap.toFixed(0)}</b> world units<br>
    planets with capped moon shell: <b>${cappedCount}</b> / ${n}<br>
    moons hidden behind "+K": <b>${overflowTotal}</b><br>
    current zoom: <b>${scale.toFixed(2)}x</b> (legible default: ${DEFAULT_SCALE.toFixed(2)}x)<br>
    minimap: <b>shown</b> (always)
  `;
}

function drawMinimap(layout) {
  const w = minimapCanvas.width, h = minimapCanvas.height;
  mctx.clearRect(0, 0, w, h);
  const pad = 10 * devicePixelRatio;
  const mScale = (Math.min(w, h) - pad * 2) / (layout.maxRadius * 2);
  const cx = w / 2, cy = h / 2;

  mctx.strokeStyle = "rgba(255,255,255,0.2)";
  for (const ring of layout.rings) {
    mctx.beginPath();
    mctx.arc(cx, cy, ring.radius * mScale, 0, Math.PI * 2);
    mctx.stroke();
  }

  mctx.fillStyle = "#7cc4ff";
  for (const planet of layout.planets) {
    mctx.beginPath();
    mctx.arc(cx + planet.wx * mScale, cy + planet.wy * mScale, 2 * devicePixelRatio, 0, Math.PI * 2);
    mctx.fill();
  }

  // viewport rect
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(canvas.width, canvas.height);
  mctx.strokeStyle = "#ffd166";
  mctx.lineWidth = 1.5 * devicePixelRatio;
  mctx.strokeRect(
    cx + topLeft.x * mScale,
    cy + topLeft.y * mScale,
    (bottomRight.x - topLeft.x) * mScale,
    (bottomRight.y - topLeft.y) * mScale,
  );

  minimapCanvas.onclick = (e) => {
    const rect = minimapCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * devicePixelRatio;
    const my = (e.clientY - rect.top) * devicePixelRatio;
    panX = (mx - cx) / mScale;
    panY = (my - cy) / mScale;
  };
}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.001);
  scale = Math.min(6, Math.max(0.1, scale * factor));
}, { passive: false });

canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  panStartX = panX;
  panStartY = panY;
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  panX = panStartX - (e.clientX - dragStartX) / scale;
  panY = panStartY - (e.clientY - dragStartY) / scale;
});
window.addEventListener("mouseup", () => { dragging = false; });

canvas.addEventListener("dblclick", () => {
  scale = DEFAULT_SCALE;
  panX = 0;
  panY = 0;
});

function syncLabels() {
  planetCountLabel.textContent = planetCountInput.value;
  moonCountLabel.textContent = moonCountInput.value;
  for (const key of Object.keys(tuningInputs)) {
    tuningLabels[key].textContent = tuningInputs[key].value;
  }
}
[planetCountInput, moonCountInput, ...Object.values(tuningInputs)].forEach((el) => el.addEventListener("input", syncLabels));

function loop() {
  draw();
  requestAnimationFrame(loop);
}

resize();
syncLabels();
loop();
