// PROTOTYPE — throwaway. See ../README.md.
//
// Renders one wayfinder map as a dungeon, grown the way Watabou himself
// describes 1PDG's algorithm (research-procgen-dungeon-theme.md §1.1,
// his own itch.io words): start from a root room; each room spawns
// symmetric children off its own entrance — two to the sides, one
// straight ahead opposite the entrance — and the tree grows outward one
// generation at a time. We apply that same growth rule twice: the map
// (entrance) grows the primary-tier rooms, and each room grows its own
// dependent-tier side-chambers off *its* entrance, continuing outward
// away from the map. crossLinkIds are drawn as the "loops" his own
// description adds afterward — except ours are semantic (a shared
// chamber's other blockers) rather than physically-adjacent, per #53's
// diamond-dependency resolution.

const canvas = document.getElementById("floor");
const ctx = canvas.getContext("2d");
const mapTitleEl = document.getElementById("mapTitle");
const mapDescEl = document.getElementById("mapDesc");
const jumpBar = document.getElementById("jumpBar");
const tooltip = document.getElementById("tooltip");
const tooltipTitle = document.getElementById("tooltipTitle");
const tooltipMeta = document.getElementById("tooltipMeta");
const tooltipGist = document.getElementById("tooltipGist");
const tooltipLink = document.getElementById("tooltipLink");

let summaries = [];
let currentIndex = 0;
let layout = null; // { entrance, rooms, chambers, secretDoors, corridors }
let timeSec = 0;
let lastFrameMs = null;
let mouseX = -1;
let mouseY = -1;
let hovered = null;

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});
canvas.addEventListener("mouseleave", () => {
  mouseX = -1;
  mouseY = -1;
});
canvas.addEventListener("click", () => {
  if (hovered) window.open(hovered.url, "_blank", "noopener");
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", () => {
  resize();
  if (layout) layout = buildLayout(layout.vm);
});

const ROOM_W = 104;
const ROOM_H = 72;
const CHAMBER_W = 66;
const CHAMBER_H = 46;
const ICON_SIZE = 16; // fixed regardless of body size, per #56's moon-legibility feedback
const UNIT = 190; // corridor length between generations

// Watabou's own description (quoted in the research doc): "two [children]
// on both sides from the entrance, one on the opposite end ... or both
// (three children)". We generalize to >3 children by chaining overflow
// rooms further out behind one of the three slots, continuing the
// recursion rather than capping it — his words describe an unbounded
// recursive process, not a 3-child limit.
// A non-terminal room (one with a further sibling continuing past it in
// the same generation's chain) must not sprout its own children straight
// ahead — that direction is already spoken for by the corridor
// continuing through it. Only a chain's terminal room gets all three
// slots; everything upstream of it is restricted to left/right, which is
// also closer to Watabou's own framing of "straight ahead" as the far
// wall opposite a room's entrance — only meaningful for a room that
// doesn't already have a corridor running out its far side.
function growTree(originX, originY, outDir, children, bodyW, bodyH, allowStraight = true) {
  const allSlots = [
    { angle: outDir, label: "straight" },
    { angle: outDir - Math.PI / 2, label: "left" },
    { angle: outDir + Math.PI / 2, label: "right" },
  ];
  const slots = allowStraight ? allSlots : allSlots.slice(1);
  const buckets = slots.map(() => []);
  children.forEach((ticket, i) => buckets[i % slots.length].push(ticket));

  const nodes = [];
  buckets.forEach((bucket, slotIdx) => {
    let x = originX;
    let y = originY;
    const angle = slots[slotIdx].angle;
    bucket.forEach((ticket, hop) => {
      const dist = hop === 0 ? UNIT : UNIT * 0.72;
      const nx = x + dist * Math.cos(angle);
      const ny = y + dist * Math.sin(angle);
      nodes.push({
        ticket,
        x: nx,
        y: ny,
        w: bodyW,
        h: bodyH,
        outDir: angle,
        isTerminal: hop === bucket.length - 1,
        corridor: { fromX: x, fromY: y, toX: nx, toY: ny },
      });
      x = nx;
      y = ny;
    });
  });
  return nodes;
}

function buildLayout(vm) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const rooms = vm.tickets.filter((t) => t.tier === "primary").sort((a, b) => a.number - b.number);
  const byHost = new Map();
  for (const t of vm.tickets) {
    if (t.tier !== "dependent") continue;
    const list = byHost.get(t.hostId) ?? [];
    list.push(t);
    byHost.set(t.hostId, list);
  }

  // The entrance's own "entry direction" is arbitrary — pick straight up
  // the screen, same as Watabou's root room having no parent to orient
  // against.
  const roomNodes = growTree(cx, cy, -Math.PI / 2, rooms, ROOM_W, ROOM_H);
  const roomByTicketId = new Map(roomNodes.map((n) => [n.ticket.id, n]));

  const chamberNodes = [];
  for (const room of roomNodes) {
    const deps = (byHost.get(room.ticket.id) ?? []).sort((a, b) => a.number - b.number);
    if (deps.length === 0) continue;
    chamberNodes.push(...growTree(room.x, room.y, room.outDir, deps, CHAMBER_W, CHAMBER_H, room.isTerminal));
  }

  const secretDoors = [];
  for (const chamber of chamberNodes) {
    for (const crossId of chamber.ticket.crossLinkIds) {
      const otherRoom = roomByTicketId.get(crossId);
      if (otherRoom) secretDoors.push({ from: chamber, to: otherRoom });
    }
  }

  return {
    vm,
    cx,
    cy,
    entrance: { x: cx, y: cy, w: ROOM_W, h: ROOM_H },
    rooms: roomNodes,
    chambers: chamberNodes,
    secretDoors,
  };
}

function drawParchment() {
  ctx.fillStyle = "#e9dec0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Faint graph-paper grid — a nod to 1PDG's own squared-paper look.
  ctx.strokeStyle = "rgba(120, 100, 60, 0.08)";
  ctx.lineWidth = 1;
  const step = 24;
  ctx.beginPath();
  for (let x = 0; x < canvas.width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
  }
  for (let y = 0; y < canvas.height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
  }
  ctx.stroke();
}

// A corridor is drawn as a walled passage (two ink rails + floor fill),
// not a bare line — the single biggest "does this read as a dungeon"
// lever after room shape.
function drawCorridor(fromX, fromY, toX, toY) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const halfW = 11;

  ctx.save();
  ctx.fillStyle = "#e9dec0";
  ctx.beginPath();
  ctx.moveTo(fromX + nx * halfW, fromY + ny * halfW);
  ctx.lineTo(toX + nx * halfW, toY + ny * halfW);
  ctx.lineTo(toX - nx * halfW, toY - ny * halfW);
  ctx.lineTo(fromX - nx * halfW, fromY - ny * halfW);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#3a2d18";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fromX + nx * halfW, fromY + ny * halfW);
  ctx.lineTo(toX + nx * halfW, toY + ny * halfW);
  ctx.moveTo(fromX - nx * halfW, fromY - ny * halfW);
  ctx.lineTo(toX - nx * halfW, toY - ny * halfW);
  ctx.stroke();
  ctx.restore();
}

function drawSecretDoor(fromX, fromY, toX, toY) {
  ctx.save();
  ctx.strokeStyle = "rgba(122, 45, 45, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();

  const mx = (fromX + toX) / 2;
  const my = (fromY + toY) / 2;
  ctx.save();
  ctx.translate(mx, my);
  ctx.strokeStyle = "#7a2d2d";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-5, -5);
  ctx.lineTo(5, 5);
  ctx.moveTo(5, -5);
  ctx.lineTo(-5, 5);
  ctx.stroke();
  ctx.restore();
}

// Short jittered strokes along the inner wall — an approximation of the
// Poisson-disk-sampled hatching Watabou describes for 1PDG's shading
// (research doc §1.4), not a real Poisson-disk implementation.
function drawHatching(x, y, w, h, seed) {
  const rng = mulberry32(seed);
  const inset = 7;
  const perimeter = 2 * (w - inset * 2) + 2 * (h - inset * 2);
  const spacing = 9;
  const count = Math.floor(perimeter / spacing);
  ctx.save();
  ctx.strokeStyle = "rgba(58, 45, 24, 0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * perimeter + rng() * 3;
    const [px, py, inAngle] = pointOnInsetRect(x, y, w, h, inset, t);
    const len = 4 + rng() * 3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + len * Math.cos(inAngle), py + len * Math.sin(inAngle));
    ctx.stroke();
  }
  ctx.restore();
}

function pointOnInsetRect(cx, cy, w, h, inset, t) {
  const left = cx - w / 2 + inset;
  const right = cx + w / 2 - inset;
  const top = cy - h / 2 + inset;
  const bottom = cy + h / 2 - inset;
  const widthSeg = right - left;
  const heightSeg = bottom - top;
  let d = t;
  if (d < widthSeg) return [left + d, top, Math.PI / 2]; // top edge, hatch pointing down
  d -= widthSeg;
  if (d < heightSeg) return [right, top + d, Math.PI]; // right edge, hatch pointing left
  d -= heightSeg;
  if (d < widthSeg) return [right - d, bottom, -Math.PI / 2]; // bottom edge, hatch pointing up
  d -= widthSeg;
  return [left, bottom - d, 0]; // left edge, hatch pointing right
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stateStyle(status) {
  switch (status) {
    case "frontier":
      return { stroke: "#b33a2e", dashed: false, pulse: true, fill: null };
    case "blocked":
      return { stroke: "#6b4f9e", dashed: true, pulse: false, fill: null };
    case "claimed":
      return { stroke: "#8a6a1e", dashed: false, pulse: false, fill: "rgba(240, 200, 105, 0.35)" };
    case "closed":
    default:
      return { stroke: "#3a2d18", dashed: false, pulse: false, fill: null };
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoom(node, tSec, isHovered) {
  const { x, y, w, h, ticket } = node;
  const style = stateStyle(ticket.status);

  ctx.save();
  ctx.fillStyle = style.fill ?? "#f3ead2";
  roundRect(x - w / 2, y - h / 2, w, h, 4);
  ctx.fill();

  let alpha = 1;
  if (style.pulse) alpha = 0.65 + 0.35 * Math.sin(tSec * 2.4);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = ticket.status === "closed" ? 2 : 2.5;
  ctx.setLineDash(style.dashed ? [5, 4] : []);
  roundRect(x - w / 2, y - h / 2, w, h, 4);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // Explored stamp: closed rooms get the classic surveyed-room double
  // outline, in ink rather than a neon ring.
  if (ticket.status === "closed") {
    ctx.strokeStyle = "rgba(58, 45, 24, 0.5)";
    ctx.lineWidth = 1;
    roundRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 3);
    ctx.stroke();
  }

  if (isHovered) {
    ctx.strokeStyle = "#7a2d2d";
    ctx.lineWidth = 2;
    roundRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 6);
    ctx.stroke();
  }

  ctx.restore();

  drawHatching(x, y, w, h, hashString(ticket.id));
  drawTypeIcon(ticket.type, x, y);

  // Door gap + jambs where this room's corridor meets its wall.
  if (node.corridor) drawDoorway(node);
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function drawDoorway(node) {
  const { x, y, w, h, outDir, corridor } = node;
  // Door sits on the wall facing back toward the corridor's origin.
  const backAngle = Math.atan2(corridor.fromY - y, corridor.fromX - x);
  const hw = w / 2;
  const hh = h / 2;
  const edgeX = x + Math.cos(backAngle) * hw * 0.9;
  const edgeY = y + Math.sin(backAngle) * hh * 0.9;
  const perp = backAngle + Math.PI / 2;
  const jamb = 8;

  ctx.save();
  ctx.strokeStyle = "#3a2d18";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(edgeX + Math.cos(perp) * jamb, edgeY + Math.sin(perp) * jamb);
  ctx.lineTo(edgeX - Math.cos(perp) * jamb, edgeY - Math.sin(perp) * jamb);
  ctx.stroke();
  ctx.restore();
}

function drawTypeIcon(type, cx, cy) {
  const s = ICON_SIZE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "#3a2d18";
  ctx.fillStyle = "#3a2d18";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (type === "research") {
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.5);
    ctx.lineTo(-s * 0.18, -s * 0.05);
    ctx.lineTo(-s * 0.45, s * 0.5);
    ctx.lineTo(s * 0.45, s * 0.5);
    ctx.lineTo(s * 0.18, -s * 0.05);
    ctx.lineTo(s * 0.18, -s * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, -s * 0.5);
    ctx.lineTo(s * 0.28, -s * 0.5);
    ctx.stroke();
  } else if (type === "prototype") {
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.5);
    ctx.lineTo(s * 0.1, -s * 0.5);
    ctx.lineTo(s * 0.35, -s * 0.25);
    ctx.lineTo(-s * 0.15, s * 0.5);
    ctx.closePath();
    ctx.stroke();
  } else if (type === "grilling") {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.4, -s * 0.05, s * 0.18, s * 0.25);
    ctx.quadraticCurveTo(s * 0.3, s * 0.1, s * 0.1, s * 0.5);
    ctx.quadraticCurveTo(-s * 0.35, s * 0.3, -s * 0.15, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.1, -s * 0.3, 0, -s * 0.5);
    ctx.closePath();
    ctx.stroke();
  } else {
    roundRect(-s * 0.4, -s * 0.5, s * 0.8, s, 2);
    ctx.stroke();
    for (const dy of [-0.2, 0.05, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.22, dy * s);
      ctx.lineTo(s * 0.22, dy * s);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawEntrance(x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "#d8c89a";
  roundRect(x - w / 2, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = "#3a2d18";
  ctx.lineWidth = 3;
  roundRect(x - w / 2, y - h / 2, w, h, 4);
  ctx.stroke();

  // stairs-down glyph
  ctx.strokeStyle = "#3a2d18";
  ctx.lineWidth = 2;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const sw = w * 0.5 - i * (w * 0.5) / steps;
    ctx.beginPath();
    ctx.moveTo(x - sw / 2, y - h * 0.28 + i * (h * 0.56) / steps);
    ctx.lineTo(x + sw / 2, y - h * 0.28 + i * (h * 0.56) / steps);
    ctx.stroke();
  }
  ctx.restore();
}

function pointInBody(px, py, body) {
  return (
    px >= body.x - body.w / 2 &&
    px <= body.x + body.w / 2 &&
    py >= body.y - body.h / 2 &&
    py <= body.y + body.h / 2
  );
}

function render(t) {
  if (lastFrameMs !== null) timeSec += (t - lastFrameMs) / 1000;
  lastFrameMs = t;

  drawParchment();

  if (!layout) {
    requestAnimationFrame(render);
    return;
  }

  const { entrance, rooms, chambers, secretDoors } = layout;

  for (const room of rooms) drawCorridor(room.corridor.fromX, room.corridor.fromY, room.corridor.toX, room.corridor.toY);
  for (const chamber of chambers) drawCorridor(chamber.corridor.fromX, chamber.corridor.fromY, chamber.corridor.toX, chamber.corridor.toY);
  for (const door of secretDoors) drawSecretDoor(door.from.x, door.from.y, door.to.x, door.to.y);

  drawEntrance(entrance.x, entrance.y, entrance.w, entrance.h);

  let next = null;
  for (const room of rooms) {
    const isHovered = pointInBody(mouseX, mouseY, room);
    if (isHovered) next = room.ticket;
    drawRoom(room, timeSec, isHovered);
  }
  for (const chamber of chambers) {
    const isHovered = pointInBody(mouseX, mouseY, chamber);
    if (isHovered) next = chamber.ticket;
    drawRoom(chamber, timeSec, isHovered);
  }

  hovered = next;
  canvas.style.cursor = hovered ? "pointer" : "default";
  updateTooltip();

  requestAnimationFrame(render);
}

function updateTooltip() {
  if (!hovered) {
    tooltip.classList.add("hidden");
    return;
  }
  tooltip.classList.remove("hidden");
  tooltip.style.left = `${mouseX + 16}px`;
  tooltip.style.top = `${mouseY + 16}px`;
  tooltipTitle.textContent = `${hovered.id} ${hovered.title}`;
  tooltipMeta.textContent = `${hovered.type} · ${hovered.status}${hovered.claimedBy ? ` · @${hovered.claimedBy}` : ""}`;
  tooltipGist.textContent = hovered.gist ?? "";
  tooltipLink.href = hovered.url;
}

function renderJumpBar() {
  jumpBar.innerHTML = "";

  const prev = document.createElement("button");
  prev.className = "arrow";
  prev.textContent = "←";
  prev.onclick = () => jumpTo(currentIndex - 1);
  jumpBar.appendChild(prev);

  summaries.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.textContent = `${s.id} (${s.closedCount}/${s.totalCount})`;
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

async function jumpTo(index) {
  currentIndex = (index + summaries.length) % summaries.length;
  const summary = summaries[currentIndex];
  const vm = await fetch(`/api/maps/${summary.number}`).then((r) => r.json());
  layout = buildLayout(vm);
  mapTitleEl.textContent = `${vm.id} ${vm.title}`;
  mapDescEl.textContent = vm.destination;
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
  summaries = await fetch("/api/maps").then((r) => r.json());
  await jumpTo(0);
  requestAnimationFrame(render);
}

init();
