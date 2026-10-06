// wayfinder-view star-map theme — organic phyllotaxis orbit renderer.
//
// Implements the renderer interface app.js drives (see its own header
// comment for the shape every theme module must register under
// `window.WayfinderThemes.<id>`): `buildLayout`/`draw`/`drawMinimap` plus
// the `usesPanZoom`/`usesMinimap` capability flags and an `onActivate`
// hook that (re)seeds the starfield backdrop. No business logic lives
// here: tiering, diamond resolution, and status are already decided
// server-side (view-model.ts); this file only turns `tickets[]` (flat,
// `tier`/`hostId`/`crossLinkIds` carrying the orbit structure) into a
// star-map layout and draws it.
//
// Layout — organic phyllotaxis scatter (issue #61's superseding decision
// over the original concentric-ring baseline). Every primary-tier ticket
// (a "planet") gets its own orbital radius via golden-angle placement; the
// radial gap between any two orbit-adjacent planets alone clears both
// planets' full moon-shell radii, so orbits can never collide even if they
// later animate at independent angular speeds. A planet's own dependents
// ("moons") use the identical algorithm around that planet.
(function () {
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

  // Hue carries state-urgency heat, not per-ticket identity: warm/active
  // for the frontier, cool for stuck, blue for in-progress, green for
  // done. Each status also gets a structurally distinct ring treatment
  // (solid+pulse, dashed, glow, bold) so status is legible even to a
  // hue-blind reader.
  const STATUS_STYLE = {
    frontier: { hue: 32, sat: 82, light: 58, ring: "#ffb648" },
    claimed: { hue: 206, sat: 68, light: 56, ring: "#6fb3ff" },
    blocked: { hue: 0, sat: 62, light: 48, ring: "#c97f82" },
    // Closed stays visually prominent — not dimmed/desaturated — so it
    // keeps its own fully-saturated, bold ring in a dedicated color
    // rather than a faded version of another state's.
    closed: { hue: 142, sat: 48, light: 44, ring: "#52d38a" },
  };

  let stars = [];

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

  function computeDefaultScale(layout) {
    const target = Math.min(window.innerWidth, window.innerHeight) * 0.42;
    return Math.max(0.05, Math.min(3, target / Math.max(layout.maxRadius, 1)));
  }

  // ---------------------------------------------------------------------
  // Type icons — drawn in body-local coordinates centered on (0,0), sized
  // independently of the body's own radius so a small moon still renders a
  // legible glyph instead of falling back to a plain dot.

  function drawFlaskIcon(ctx, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.14);
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

  function drawPencilIcon(ctx, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.18);
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

  function drawFlameIcon(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size / 2);
    ctx.quadraticCurveTo(size * 0.42, -size * 0.05, size * 0.18, size * 0.3);
    ctx.quadraticCurveTo(size * 0.3, size * 0.1, 0, size / 2);
    ctx.quadraticCurveTo(-size * 0.3, size * 0.1, -size * 0.18, size * 0.3);
    ctx.quadraticCurveTo(-size * 0.42, -size * 0.05, 0, -size / 2);
    ctx.fill();
  }

  function drawChecklistIcon(ctx, size, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.16);
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, 0);
    ctx.lineTo(-size * 0.05, size * 0.22);
    ctx.lineTo(size * 0.3, -size * 0.22);
    ctx.stroke();
  }

  const TYPE_ICON = { research: drawFlaskIcon, prototype: drawPencilIcon, grilling: drawFlameIcon, task: drawChecklistIcon };

  // ---------------------------------------------------------------------
  // Status ring — border treatment carries status so it's legible without
  // hovering: solid + slow pulse for frontier, dashed for blocked, a glow
  // for claimed, and a bold dedicated-color ring (not dimmed) for closed.

  function drawStatusRing(ctx, x, y, r, status, tSec) {
    const style = STATUS_STYLE[status];
    const ringR = r + Math.max(3, r * 0.3);
    ctx.save();
    if (status === "frontier") {
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(tSec * 1.8);
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    } else if (status === "blocked") {
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    } else if (status === "claimed") {
      ctx.shadowColor = style.ring;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBody(ctx, x, y, r, ticket, tSec, isHovered, scale) {
    const style = STATUS_STYLE[ticket.status];
    const light = isHovered ? Math.min(85, style.light + 15) : style.light;
    ctx.fillStyle = `hsl(${style.hue}, ${style.sat}%, ${light}%)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    drawStatusRing(ctx, x, y, r, ticket.status, tSec);

    const iconSize = Math.max(6, 11 * Math.min(1, Math.max(0.5, scale)));
    ctx.save();
    ctx.translate(x, y);
    (TYPE_ICON[ticket.type] ?? drawChecklistIcon)(ctx, iconSize, "#0a0b12");
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Draw

  function drawStarfield(ctx, tSec) {
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    for (const s of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(tSec * s.speed + s.phase);
      ctx.globalAlpha = 0.25 + twinkle * 0.6;
      ctx.fillStyle = "#cfd4ff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSun(ctx, cx, cy, radius, tSec, scale) {
    const pulse = 1 + 0.03 * Math.sin(tSec * 0.9);
    const r = radius * scale * pulse;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
    glow.addColorStop(0, "rgba(255, 224, 150, 0.9)");
    glow.addColorStop(1, "rgba(255, 180, 72, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe9b0";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(ctx, layout, tSec, view) {
    const { worldToScreen, scale, mouseX, mouseY } = view;
    drawStarfield(ctx, tSec);
    if (!layout) return { hovered: null };

    const sunScreen = worldToScreen(0, 0);

    // Faint connector lines under the bodies: sun→planet, planet→moon —
    // the hierarchy edges are visible directly on the canvas, not just
    // inferable from position.
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    for (const planet of layout.planets) {
      const ps = worldToScreen(planet.x, planet.y);
      ctx.beginPath();
      ctx.moveTo(sunScreen.x, sunScreen.y);
      ctx.lineTo(ps.x, ps.y);
      ctx.stroke();
      for (const moon of planet.moons) {
        const ms = worldToScreen(moon.x, moon.y);
        ctx.beginPath();
        ctx.moveTo(ps.x, ps.y);
        ctx.lineTo(ms.x, ms.y);
        ctx.stroke();
      }
    }

    // Cross-link lines: thin, dashed, dimmer than the hierarchy edges —
    // diamond-dependency information, not the primary hierarchy.
    ctx.strokeStyle = "rgba(170,200,255,0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (const link of layout.crossLinks) {
      const from = worldToScreen(link.from.x, link.from.y);
      const to = worldToScreen(link.to.x, link.to.y);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    drawSun(ctx, sunScreen.x, sunScreen.y, layout.sunRadius, tSec, scale);

    let nextHovered = null;
    const testHover = (x, y, r, ticket) => {
      const dist = Math.hypot(mouseX - x, mouseY - y);
      if (dist <= r + 6) nextHovered = { ticket };
    };

    for (const planet of layout.planets) {
      const ps = worldToScreen(planet.x, planet.y);
      const pr = Math.max(2, planet.r * scale);
      testHover(ps.x, ps.y, pr, planet.ticket);
      drawBody(ctx, ps.x, ps.y, pr, planet.ticket, tSec, nextHovered?.ticket.id === planet.ticket.id, scale);

      for (const moon of planet.moons) {
        const ms = worldToScreen(moon.x, moon.y);
        const mr = Math.max(1.5, moon.r * scale);
        testHover(ms.x, ms.y, mr, moon.ticket);
        drawBody(ctx, ms.x, ms.y, mr, moon.ticket, tSec, nextHovered?.ticket.id === moon.ticket.id, scale);
      }
    }

    return { hovered: nextHovered };
  }

  function drawMinimap(ctx, layout, view) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(5,6,10,0.7)";
    ctx.fillRect(0, 0, w, h);
    if (!layout) return;

    const pad = 10 * devicePixelRatio;
    const mScale = (Math.min(w, h) - pad * 2) / (layout.maxRadius * 2);
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = "#ffe9b0";
    ctx.beginPath();
    ctx.arc(cx, cy, 3 * devicePixelRatio, 0, Math.PI * 2);
    ctx.fill();

    for (const planet of layout.planets) {
      ctx.fillStyle = STATUS_STYLE[planet.ticket.status].ring;
      ctx.beginPath();
      ctx.arc(cx + planet.x * mScale, cy + planet.y * mScale, 2 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }

    const topLeft = view.screenToWorld(0, 0);
    const bottomRight = view.screenToWorld(window.innerWidth, window.innerHeight);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 1.5 * devicePixelRatio;
    ctx.strokeRect(
      cx + topLeft.x * mScale,
      cy + topLeft.y * mScale,
      (bottomRight.x - topLeft.x) * mScale,
      (bottomRight.y - topLeft.y) * mScale,
    );
  }

  window.WayfinderThemes = window.WayfinderThemes || {};
  window.WayfinderThemes.starmap = {
    id: "starmap",
    label: "Star map",
    usesMinimap: true,
    usesPanZoom: true,
    onActivate: seedStarfield,
    buildLayout,
    computeDefaultScale,
    draw,
    drawMinimap,
  };
})();
