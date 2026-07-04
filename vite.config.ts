import { defineConfig, type Plugin } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

/**
 * The review UI edits the curated config and must persist to a REAL file
 * (config.json is the lock between curation and show — never localStorage).
 * A browser cannot write to disk, so the dev server exposes a tiny endpoint:
 *   GET  /api/config  -> current config.json
 *   POST /api/config  -> overwrite config.json with the posted JSON
 * This exists only in the dev server; the built show reads config.json statically.
 */
function configPersistence(): Plugin {
  return {
    name: 'boids:config-persistence',
    configureServer(server) {
      server.middlewares.use('/api/config', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
          if (req.method === 'GET') {
            const txt = await readFile(CONFIG_PATH, 'utf8').catch(() => '');
            if (!txt) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'config.json not found — run `npm run curate` first.' }));
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(txt);
            return;
          }
          if (req.method === 'POST' || req.method === 'PUT') {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            const body = Buffer.concat(chunks).toString('utf8');
            const parsed = JSON.parse(body); // validate it is JSON before writing
            await writeFile(CONFIG_PATH, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, bytes: Buffer.byteLength(body) }));
            return;
          }
          res.statusCode = 405;
          res.end();
        } catch (err) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [configPersistence()],
  server: { port: 5173, strictPort: false },
  clearScreen: false,
});
