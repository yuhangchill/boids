import { defineConfig, type Plugin } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const CONFIG_PATH = resolve(process.cwd(), "config.json");

/**
 * Curation-time file I/O for the review UI. This is the ONLY server dependency,
 * and it exists only so the human can lock edits back to config.json (a real
 * file, never localStorage). The show/runtime never touches this — it reads a
 * static config.json and needs no server at all.
 */
function configApiPlugin(): Plugin {
  return {
    name: "boids-config-api",
    configureServer(server) {
      server.middlewares.use("/api/config", async (req, res) => {
        try {
          if (req.method === "GET") {
            if (!existsSync(CONFIG_PATH)) {
              res.statusCode = 404;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ error: "config.json not found. Run `npm run curate` first." }));
              return;
            }
            const body = await readFile(CONFIG_PATH, "utf8");
            res.setHeader("content-type", "application/json");
            res.end(body);
            return;
          }
          if (req.method === "POST" || req.method === "PUT") {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            const text = Buffer.concat(chunks).toString("utf8");
            // Validate it parses before writing, so we never persist junk.
            const parsed = JSON.parse(text);
            await writeFile(CONFIG_PATH, JSON.stringify(parsed, null, 2) + "\n", "utf8");
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, bytes: text.length }));
            return;
          }
          res.statusCode = 405;
          res.end("Method Not Allowed");
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
        }
      });
    },
  };
}

export default defineConfig({
  // Root = repo root so the UI can import data/*.json and read config.json.
  root: process.cwd(),
  publicDir: false,
  server: { port: 5173, open: false },
  build: {
    outDir: resolve(process.cwd(), "dist"),
    emptyOutDir: true,
  },
  plugins: [configApiPlugin()],
});
