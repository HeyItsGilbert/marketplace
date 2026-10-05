// PROTOTYPE — throwaway, see README.md in this directory.
//
// Pure static file server. All fixture generation and layout math happens
// client-side in public/app.js so the planet/moon-count sliders can
// rebuild the layout live with no round-trip.

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

const publicDir = join(dirname(new URL(import.meta.url).pathname), "public");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function startServer(port: number, attemptsLeft = 10): void {
  try {
    const server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        let path = url.pathname === "/" ? "/index.html" : url.pathname;
        const filePath = join(publicDir, path);
        if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
          return new Response("not found", { status: 404 });
        }
        const ext = path.slice(path.lastIndexOf("."));
        return new Response(Bun.file(filePath), {
          headers: { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" },
        });
      },
    });
    console.log(`Listening on http://localhost:${server.port}`);
  } catch (err) {
    if (attemptsLeft <= 0) throw err;
    startServer(port + 1, attemptsLeft - 1);
  }
}

startServer(4174);
