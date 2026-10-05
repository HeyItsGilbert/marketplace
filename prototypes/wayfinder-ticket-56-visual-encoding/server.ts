// PROTOTYPE — throwaway, see README.md in this directory.
//
// Serves fixture ticket data (not live repo data — this prototype is
// answering a visual-encoding question, not a feasibility question) plus
// the static canvas app that renders it as a star system.

import { dirname, join } from "node:path";

const publicDir = join(dirname(new URL(import.meta.url).pathname), "public");

type TicketType = "research" | "prototype" | "grilling" | "task";
type TicketState = "closed" | "blocked" | "frontier" | "claimed";

type Ticket = {
  id: string;
  name: string;
  type: TicketType;
  state: TicketState;
  moons: Ticket[];
};

const TYPES: TicketType[] = ["research", "prototype", "grilling", "task"];
const STATES: TicketState[] = ["closed", "blocked", "frontier", "claimed"];

// One planet per type×state cell — the full 16-cell grid the ticket asks
// about, so every combination is on screen at once instead of sampled.
const planets: Ticket[] = [];
for (const type of TYPES) {
  for (const state of STATES) {
    planets.push({
      id: `${type}-${state}`,
      name: `${type} / ${state}`,
      type,
      state,
      moons: [],
    });
  }
}

// Hang a few moons off two planets to stress-test icon legibility at moon
// scale (variant A's stated fallback vs. variant B's decoupled icon size).
function moon(type: TicketType, state: TicketState, n: number): Ticket {
  return { id: `${type}-${state}-moon${n}`, name: `${type} / ${state} (moon)`, type, state, moons: [] };
}
const taskFrontier = planets.find((p) => p.id === "task-frontier")!;
taskFrontier.moons = [moon("research", "closed", 1), moon("grilling", "blocked", 2)];
const prototypeClaimed = planets.find((p) => p.id === "prototype-claimed")!;
prototypeClaimed.moons = [moon("task", "frontier", 1)];

const system = {
  id: "map-52",
  name: "Wayfinder view map (#52)",
  description: "Fixture: every type×state cell as a planet, plus moons on two planets for scale-testing icons.",
  planets,
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

function startServer(port: number, attemptsLeft = 10): void {
  try {
    const server = Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/system") {
          return Response.json(system);
        }
        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = Bun.file(join(publicDir, path));
        if (await file.exists()) {
          const ext = path.slice(path.lastIndexOf("."));
          return new Response(file, { headers: { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" } });
        }
        return new Response("Not found", { status: 404 });
      },
    });
    console.log(`Listening on http://localhost:${server.port}`);
  } catch (err) {
    const isAddrInUse = err !== null && typeof err === "object" && "code" in err && err.code === "EADDRINUSE";
    if (attemptsLeft > 0 && isAddrInUse) {
      startServer(port + 1, attemptsLeft - 1);
    } else {
      throw err;
    }
  }
}

startServer(4174);
