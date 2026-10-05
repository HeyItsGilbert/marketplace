// PROTOTYPE — throwaway, see README.md in this directory.
//
// Serves a star-system visualization of a dependency graph: a central
// task/map is the sun, its direct dependencies are planets, and *their*
// dependencies are moons. We ground that generic shape in this repo's real
// marketplace data so the systems aren't fake fixtures:
//
//   sun   = plugin          (the central task/map)
//   planet = skill or agent the plugin depends on
//   moon  = a tool that skill depends on (its `allowed-tools` entries)
//
// Data is read live off disk on every request, nothing is persisted.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const repoRoot = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const publicDir = join(dirname(new URL(import.meta.url).pathname), "public");

type Moon = { id: string; name: string };
type Planet = { id: string; name: string; description: string; moons: Moon[] };
type System = {
  id: string;
  name: string;
  description: string;
  planets: Planet[];
};

// Minimal frontmatter reader — every SKILL.md / agent .md / plugin.json
// field we need here is a flat `key: value` line, so a full YAML/JSON
// parser is overkill for a prototype that throws this code away.
function parseFrontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

// "PowerShell(*), Bash(find *), Bash(git diff *)" -> ["PowerShell", "Bash", "Bash"]
// (dedup kept simple: last write wins per unique tool name)
function moonsFromAllowedTools(raw: string | undefined): Moon[] {
  if (!raw) return [];
  const names = new Set<string>();
  for (const entry of raw.split(",")) {
    const name = entry.trim().replace(/\(.*\)$/, "").trim();
    if (name) names.add(name);
  }
  return [...names].map((name) => ({ id: name, name }));
}

function loadPlanetFromFile(dirName: string, filePath: string): Planet {
  const fm = parseFrontmatter(readFileSync(filePath, "utf8"));
  return {
    id: dirName,
    name: fm.name ?? dirName,
    description: fm.description ?? "",
    moons: moonsFromAllowedTools(fm["allowed-tools"]),
  };
}

function loadPlanets(pluginDir: string): Planet[] {
  const skillsDir = join(pluginDir, "skills");
  if (existsSync(skillsDir)) {
    return readdirSync(skillsDir)
      .sort()
      .map((skillName) => join(skillsDir, skillName, "SKILL.md"))
      .filter(existsSync) // e.g. eval workspace dirs have no SKILL.md
      .map((f) => loadPlanetFromFile(dirname(f).split("/").pop()!, f));
  }

  const agentsDir = join(pluginDir, "agents");
  if (existsSync(agentsDir)) {
    return readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => loadPlanetFromFile(f.replace(/\.md$/, ""), join(agentsDir, f)));
  }

  return [];
}

function loadSystems(): System[] {
  const pluginsDir = join(repoRoot, "plugins");
  const systems: System[] = [];

  for (const pluginName of readdirSync(pluginsDir).sort()) {
    const pluginDir = join(pluginsDir, pluginName);
    const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    systems.push({
      id: pluginName,
      name: manifest.name ?? pluginName,
      description: manifest.description ?? "",
      planets: loadPlanets(pluginDir),
    });
  }

  return systems;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function startServer(port: number, attemptsLeft = 10): void {
  try {
    const server = Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/api/systems") {
          return Response.json(loadSystems());
        }

        const path = url.pathname === "/" ? "/index.html" : url.pathname;
        const ext = path.slice(path.lastIndexOf("."));
        const file = Bun.file(join(publicDir, path));
        if (!(await file.exists())) return new Response("not found", { status: 404 });
        return new Response(file, {
          headers: { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" },
        });
      },
    });
    console.log(`wayfinder star map (prototype) → http://localhost:${server.port}`);
  } catch (err: any) {
    if (err?.code === "EADDRINUSE" && attemptsLeft > 0) {
      startServer(port + 1, attemptsLeft - 1);
      return;
    }
    throw err;
  }
}

startServer(4173);
