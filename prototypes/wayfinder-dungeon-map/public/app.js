// PROTOTYPE — throwaway. See ../README.md.
//
// Renders one wayfinder map as a dungeon: the map itself is the entrance
// (stairwell down), tier:"primary" tickets are rooms fanned around it,
// tier:"dependent" tickets are side-chambers off their hostId room, and
// crossLinkIds are drawn as dashed secret doors to the other rooms a
// shared chamber is also gated behind. Static layout (no orbit motion) —
// a dungeon is explored, not orbiting.

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
let layout = null; // { entrance, rooms: [{ticket, x, y, w, h, angle}], chambers: [...], secretDoors: [...] }
let timeSec = 0;
let lastFrameMs = null;
let mouseX = -1;
let mouseY = -1;
let hovered = null; // the ticket object under the cursor, from last draw pass

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

const ROOM_W = 100;
const ROOM_H = 68;
const CHAMBER_W = 60;
const CHAMBER_H = 42;
const ICON_SIZE = 15; // fixed regardless of body size, per #56's moon-legibility feedback

function buildLayout(vm) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const rooms = vm.tickets.filter((t) => t.tier === "primary");
  const byHost = new Map();
  for (const t of vm.tickets) {
    if (t.tier !== "dependent") continue;
    const list = byHost.get(t.hostId) ?? [];
    list.push(t);
    byHost.set(t.hostId, list);
  }

  const roomRadius = Math.min(canvas.width, canvas.height) * 0.3;
  const n = Math.max(rooms.length, 1);

  const roomById = new Map();
  const roomLayouts = rooms.map((ticket, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + roomRadius * Math.cos(angle);
    const y = cy + roomRadius * Math.sin(angle);
    const room = { ticket, x, y, w: ROOM_W, h: ROOM_H, angle };
    roomById.set(ticket.id, room);
    return room;
  });

  const chamberLayouts = [];
  const secretDoors = [];
  for (const room of roomLayouts) {
    const deps = byHost.get(room.ticket.id) ?? [];
    const m = Math.max(deps.length, 1);
    deps.forEach((ticket, j) => {
      const spread = Math.min(0.26 * (m - 1), 1.1);
      const chamberAngle = room.angle + (j - (m - 1) / 2) * (spread / Math.max(m - 1, 1) || 0.3);
      const chamberRadius = roomRadius + 120;
      const x = cx + chamberRadius * Math.cos(chamberAngle);
      const y = cy + chamberRadius * Math.sin(chamberAngle);
      const chamber = { ticket, x, y, w: CHAMBER_W, h: CHAMBER_H, hostRoom: room };
      chamberLayouts.push(chamber);

      for (const crossId of ticket.crossLinkIds) {
        const otherRoom = roomById.get(crossId);
        if (otherRoom) secretDoors.push({ from: chamber, to: otherRoom });
      }
    });
  }

  return { vm, cx, cy, rooms: roomLayouts, chambers: chamberLayouts, secretDoors };
}

function drawFloorTexture() {
  ctx.fillStyle = "#140f0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCorridor(x1, y1, x2, y2, dashed) {
  ctx.save();
  ctx.strokeStyle = dashed ? "rgba(122, 95, 191, 0.55)" : "rgba(201, 180, 148, 0.35)";
  ctx.lineWidth = dashed ? 1.5 : 6;
  if (dashed) ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function stateRingStyle(status) {
  switch (status) {
    case "frontier":
      return { stroke: "#ff7a3d", dashed: false, pulse: true, glow: false, double: false };
    case "blocked":
      return { stroke: "#7a5fbf", dashed: true, pulse: false, glow: false, double: false };
    case "claimed":
      return { stroke: "#e8c84a", dashed: false, pulse: false, glow: true, double: false };
    case "closed":
    default:
      return { stroke: "#5fd1a0", dashed: false, pulse: false, glow: false, double: true };
  }
}

function drawRoom(body, tSec, isHovered) {
  const { x, y, w, h, ticket } = body;
  const style = stateRingStyle(ticket.status);

  ctx.save();
  // Fill
  ctx.fillStyle = "rgba(58, 29, 11, 0.85)";
  roundRect(x - w / 2, y - h / 2, w, h, 8);
  ctx.fill();

  // State ring
  let lineWidth = 2.5;
  let alpha = 1;
  if (style.pulse) alpha = 0.6 + 0.4 * Math.sin(tSec * 2.2);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = lineWidth;
  if (style.dashed) ctx.setLineDash([5, 4]);
  else ctx.setLineDash([]);
  if (style.glow) {
    ctx.shadowColor = style.stroke;
    ctx.shadowBlur = 12;
  }
  roundRect(x - w / 2, y - h / 2, w, h, 8);
  ctx.stroke();
  if (style.double) {
    ctx.shadowBlur = 0;
    roundRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 6);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  if (isHovered) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    roundRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 10);
    ctx.stroke();
  }

  drawTypeIcon(ticket.type, x, y);
  ctx.restore();
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

// Fixed-size glyphs so a small chamber's icon reads exactly as clearly as
// a room's — per #56's "icon size decoupled from body radius" feedback.
function drawTypeIcon(type, cx, cy) {
  const s = ICON_SIZE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "#f4c77a";
  ctx.fillStyle = "#f4c77a";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (type === "research") {
    // flask
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
    // pencil
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.5);
    ctx.lineTo(s * 0.1, -s * 0.5);
    ctx.lineTo(s * 0.35, -s * 0.25);
    ctx.lineTo(-s * 0.15, s * 0.5);
    ctx.closePath();
    ctx.stroke();
  } else if (type === "grilling") {
    // flame
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.quadraticCurveTo(s * 0.4, -s * 0.05, s * 0.18, s * 0.25);
    ctx.quadraticCurveTo(s * 0.3, s * 0.1, s * 0.1, s * 0.5);
    ctx.quadraticCurveTo(-s * 0.35, s * 0.3, -s * 0.15, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.1, -s * 0.3, 0, -s * 0.5);
    ctx.closePath();
    ctx.stroke();
  } else {
    // checklist
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

function drawEntrance(x, y, tSec) {
  const pulse = 1 + 0.03 * Math.sin(tSec * 1.3);
  const r = 24 * pulse;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
  glow.addColorStop(0, "rgba(244, 199, 122, 0.55)");
  glow.addColorStop(1, "rgba(244, 199, 122, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2a1708";
  ctx.strokeStyle = "#f4c77a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // spiral stairwell hint
  ctx.strokeStyle = "rgba(244, 199, 122, 0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 3.2; a += 0.2) {
    const rr = (a / (Math.PI * 3.2)) * r * 0.75;
    const px = x + rr * Math.cos(a);
    const py = y + rr * Math.sin(a);
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
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
  const nowSec = t / 1000;
  if (lastFrameMs !== null) timeSec += (t - lastFrameMs) / 1000;
  lastFrameMs = t;

  drawFloorTexture();

  if (!layout) {
    requestAnimationFrame(render);
    return;
  }

  const { cx, cy, rooms, chambers, secretDoors } = layout;

  for (const room of rooms) drawCorridor(cx, cy, room.x, room.y, false);
  for (const chamber of chambers) drawCorridor(chamber.hostRoom.x, chamber.hostRoom.y, chamber.x, chamber.y, false);
  for (const door of secretDoors) drawCorridor(door.from.x, door.from.y, door.to.x, door.to.y, true);

  drawEntrance(cx, cy, nowSec);

  let next = null;
  for (const room of rooms) {
    const isHovered = pointInBody(mouseX, mouseY, room);
    if (isHovered) next = room.ticket;
    drawRoom(room, nowSec, isHovered);
  }
  for (const chamber of chambers) {
    const isHovered = pointInBody(mouseX, mouseY, chamber);
    if (isHovered) next = chamber.ticket;
    drawRoom(chamber, nowSec, isHovered);
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
