// wayfinder-view dungeon theme — Watabou-style symmetric tree-growth
// dungeon renderer. Ported from the ticket #60 prototype
// (`prototype/wayfinder-dungeon-map` branch) essentially as-is per #64's
// resolution; adapted only to implement the shared renderer interface
// app.js drives (see its own header comment for the shape) instead of
// owning its own canvas/session/HUD plumbing.
//
// The algorithm, from Watabou's own words (quoted in
// research-procgen-dungeon-theme.md §1.1): "we pick one of the rooms and
// add symmetrical children to it: two on both sides from the entrance,
// one on the opposite end from the entrance or both (three children)...
// This way we get a symmetrical tree of connected rooms." Implemented
// literally as `growTree()` below, applied twice — the map (entrance)
// grows the primary-tier rooms, and each room grows its own
// dependent-tier side-chambers off its own entry direction, continuing
// outward away from the entrance. `crossLinkIds` render as dashed secret
// doors — the "loops" step Watabou adds afterward — except semantically
// cross-linked (a shared chamber's other blockers, per #53) rather than
// physically adjacent.
//
// Unlike the star-map theme, this layout is static — no pan/zoom, no
// minimap (`usesPanZoom`/`usesMinimap` both false below): the point is a
// point-in-time "explored map" feel, a deliberate stylistic contrast to
// the star map's constant orbital motion, not an oversight. A host room
// with many dependents can still run off-canvas at this repo's realistic
// scale (≤~10 tickets/map) — a known, accepted gap (#64), not fixed here.
(function () {
  const TUNING = {
    roomW: 104,
    roomH: 72,
    chamberW: 66,
    chamberH: 46,
    iconSize: 16, // fixed regardless of body size, per #56's moon-legibility rule
    unit: 190, // corridor length between generations
    chainShrink: 0.72, // each hop after the first in a chain shortens by this factor
  };

  function compareTicketIds(a, b) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Watabou's own description generalizes to >3 children by chaining
  // overflow rooms further out behind one of the three slots, continuing
  // the recursion rather than capping it — his words describe an
  // unbounded recursive process, not a 3-child limit.
  //
  // A non-terminal room (one with a further sibling continuing past it in
  // the same generation's chain) must not sprout its own child straight
  // ahead — that direction is already spoken for by the corridor
  // continuing through it. Only a chain's terminal room gets all three
  // slots; everything upstream is restricted to left/right.
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
        const dist = hop === 0 ? TUNING.unit : TUNING.unit * TUNING.chainShrink;
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

  // World space, origin at the entrance (0,0) — app.js's shared
  // `worldToScreen` places that at the viewport center (identity-scale,
  // zero-pan for this theme), the same convention the star-map theme uses
  // for its sun.
  function buildLayout(tickets) {
    const rooms = tickets.filter((t) => t.tier === "primary").sort((a, b) => compareTicketIds(a.id, b.id));
    const byHost = new Map();
    for (const t of tickets) {
      if (t.tier !== "dependent") continue;
      const list = byHost.get(t.hostId) ?? [];
      list.push(t);
      byHost.set(t.hostId, list);
    }

    const roomNodes = growTree(0, 0, -Math.PI / 2, rooms, TUNING.roomW, TUNING.roomH);
    const roomByTicketId = new Map(roomNodes.map((n) => [n.ticket.id, n]));

    const chamberNodes = [];
    for (const room of roomNodes) {
      const deps = (byHost.get(room.ticket.id) ?? []).sort((a, b) => compareTicketIds(a.id, b.id));
      if (deps.length === 0) continue;
      chamberNodes.push(...growTree(room.x, room.y, room.outDir, deps, TUNING.chamberW, TUNING.chamberH, room.isTerminal));
    }

    const secretDoors = [];
    for (const chamber of chamberNodes) {
      for (const crossId of chamber.ticket.crossLinkIds) {
        const otherRoom = roomByTicketId.get(crossId);
        if (otherRoom) secretDoors.push({ from: chamber, to: otherRoom });
      }
    }

    return {
      entrance: { x: 0, y: 0, w: TUNING.roomW, h: TUNING.roomH },
      rooms: roomNodes,
      chambers: chamberNodes,
      secretDoors,
      byId: new Map(tickets.map((t) => [t.id, t])),
    };
  }

  function drawParchment(ctx) {
    ctx.fillStyle = "#e9dec0";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    // Faint graph-paper grid — a nod to 1PDG's own squared-paper look.
    ctx.strokeStyle = "rgba(120, 100, 60, 0.08)";
    ctx.lineWidth = 1;
    const step = 24;
    ctx.beginPath();
    for (let x = 0; x < window.innerWidth; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, window.innerHeight);
    }
    for (let y = 0; y < window.innerHeight; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(window.innerWidth, y);
    }
    ctx.stroke();
  }

  // A corridor is drawn as a walled passage (two ink rails + floor fill),
  // not a bare line — the single biggest "does this read as a dungeon"
  // lever after room shape.
  function drawCorridor(ctx, fromX, fromY, toX, toY) {
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

  function drawSecretDoor(ctx, fromX, fromY, toX, toY) {
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
  function drawHatching(ctx, x, y, w, h, seed) {
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

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // `screenNode` carries screen-space x/y/w/h/outDir/corridor — see
  // `toScreenNode` below, which transforms a world-space tree node once
  // per frame before any of the draw helpers below touch it.
  function drawRoom(ctx, screenNode, tSec, isHovered) {
    const { x, y, w, h, ticket } = screenNode;
    const style = stateStyle(ticket.status);

    ctx.save();
    ctx.fillStyle = style.fill ?? "#f3ead2";
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
    ctx.fill();

    let alpha = 1;
    if (style.pulse) alpha = 0.65 + 0.35 * Math.sin(tSec * 2.4);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = ticket.status === "closed" ? 2 : 2.5;
    ctx.setLineDash(style.dashed ? [5, 4] : []);
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // Explored stamp: closed rooms get the classic surveyed-room double
    // outline, in ink rather than a neon ring.
    if (ticket.status === "closed") {
      ctx.strokeStyle = "rgba(58, 45, 24, 0.5)";
      ctx.lineWidth = 1;
      roundRect(ctx, x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 3);
      ctx.stroke();
    }

    if (isHovered) {
      ctx.strokeStyle = "#7a2d2d";
      ctx.lineWidth = 2;
      roundRect(ctx, x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8, 6);
      ctx.stroke();
    }

    ctx.restore();

    drawHatching(ctx, x, y, w, h, hashString(ticket.id));
    drawTypeIcon(ctx, ticket.type, x, y);

    // Door gap + jambs where this room's corridor meets its wall.
    if (screenNode.corridor) drawDoorway(ctx, screenNode);
  }

  function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function drawDoorway(ctx, screenNode) {
    const { x, y, w, h, outDir, corridor } = screenNode;
    // Door sits on the wall facing back toward the corridor's origin.
    // `outDir` is an angle, invariant to the world→screen translation.
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
    void outDir;
  }

  function drawTypeIcon(ctx, type, cx, cy) {
    const s = TUNING.iconSize;
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
      roundRect(ctx, -s * 0.4, -s * 0.5, s * 0.8, s, 2);
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

  function drawEntrance(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "#d8c89a";
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = "#3a2d18";
    ctx.lineWidth = 3;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
    ctx.stroke();

    // stairs-down glyph
    ctx.strokeStyle = "#3a2d18";
    ctx.lineWidth = 2;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const sw = w * 0.5 - (i * (w * 0.5)) / steps;
      ctx.beginPath();
      ctx.moveTo(x - sw / 2, y - h * 0.28 + (i * (h * 0.56)) / steps);
      ctx.lineTo(x + sw / 2, y - h * 0.28 + (i * (h * 0.56)) / steps);
      ctx.stroke();
    }
    ctx.restore();
  }

  function pointInBody(px, py, body) {
    return px >= body.x - body.w / 2 && px <= body.x + body.w / 2 && py >= body.y - body.h / 2 && py <= body.y + body.h / 2;
  }

  // Transforms one world-space tree node (and its corridor) to screen
  // space once per frame via the shared `worldToScreen`, so every drawing
  // helper above operates purely in screen pixels — ported unchanged from
  // the prototype, which had no pan/zoom to account for.
  function toScreenNode(node, worldToScreen) {
    const screen = worldToScreen(node.x, node.y);
    const from = worldToScreen(node.corridor.fromX, node.corridor.fromY);
    return {
      ...node,
      x: screen.x,
      y: screen.y,
      corridor: { fromX: from.x, fromY: from.y, toX: screen.x, toY: screen.y },
    };
  }

  function draw(ctx, layout, tSec, view) {
    const { worldToScreen, mouseX, mouseY } = view;
    drawParchment(ctx);
    if (!layout) return { hovered: null };

    const screenRooms = layout.rooms.map((n) => toScreenNode(n, worldToScreen));
    const screenChambers = layout.chambers.map((n) => toScreenNode(n, worldToScreen));
    const roomScreenById = new Map(screenRooms.map((n) => [n.ticket.id, n]));

    for (const room of screenRooms) drawCorridor(ctx, room.corridor.fromX, room.corridor.fromY, room.corridor.toX, room.corridor.toY);
    for (const chamber of screenChambers) drawCorridor(ctx, chamber.corridor.fromX, chamber.corridor.fromY, chamber.corridor.toX, chamber.corridor.toY);
    for (const door of layout.secretDoors) {
      const from = toScreenNode(door.from, worldToScreen);
      const to = roomScreenById.get(door.to.ticket.id);
      if (to) drawSecretDoor(ctx, from.x, from.y, to.x, to.y);
    }

    const entranceScreen = worldToScreen(layout.entrance.x, layout.entrance.y);
    drawEntrance(ctx, entranceScreen.x, entranceScreen.y, layout.entrance.w, layout.entrance.h);

    let hoveredTicket = null;
    for (const room of screenRooms) {
      const isHovered = pointInBody(mouseX, mouseY, room);
      if (isHovered) hoveredTicket = room.ticket;
      drawRoom(ctx, room, tSec, isHovered);
    }
    for (const chamber of screenChambers) {
      const isHovered = pointInBody(mouseX, mouseY, chamber);
      if (isHovered) hoveredTicket = chamber.ticket;
      drawRoom(ctx, chamber, tSec, isHovered);
    }

    return { hovered: hoveredTicket ? { ticket: hoveredTicket } : null };
  }

  window.WayfinderThemes = window.WayfinderThemes || {};
  window.WayfinderThemes.dungeon = {
    id: "dungeon",
    label: "Dungeon",
    usesMinimap: false,
    usesPanZoom: false,
    buildLayout,
    draw,
  };
})();
