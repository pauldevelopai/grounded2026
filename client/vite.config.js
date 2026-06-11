import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

// ── Local "box" routing (dev only) ─────────────────────────────────────────
// On the box, Caddy fronts everything: /nodes/<slug>/app/* → that hosted
// Node's port (prefix stripped), /nodes/* → the static front door
// (/var/www/nodes = the pauldevelopai/nodes repo), /tools/* → AIKit (:8000).
// This config mirrors that locally so the WHOLE platform runs on this machine
// (started by grounded2026/start.sh). No effect on the production build.

// slug → local port for the hosted Nodes (start.sh boots them on these).
const HOSTED_NODES = {
  analytics: 4101,
  verifier: 4102,
  progress: 4103,
  aiready: 4104,
  salesrep: 4105,
};

// The front door repo (static files: index.html, chrome.js, nodes.json).
const FRONT_DOOR_DIR = join(__dirname, '..', '..', 'Nodes', 'nodes');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// Serves /nodes/* from the local front door repo — the dev twin of Caddy's
// `root /var/www/nodes` + file_server. /nodes/<slug>/app/* never reaches this
// middleware (the proxy entries below win), and /nodes/<slug>/mac|windows get
// the same GitHub redirect Caddy issues.
function nodesFrontDoor() {
  return {
    name: 'grounded-nodes-front-door',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith('/nodes')) return next();

        const installer = url.match(/^\/nodes\/([a-z0-9-]+)\/(mac|windows)$/);
        if (installer) {
          const file = installer[2] === 'mac' ? 'install.sh' : 'install.ps1';
          res.writeHead(302, { Location: `https://raw.githubusercontent.com/pauldevelopai/node-${installer[1]}/main/${file}` });
          return res.end();
        }

        let rel = url.replace(/^\/nodes\/?/, '');
        if (rel === '' || rel.endsWith('/')) rel += 'index.html';
        const path = normalize(join(FRONT_DOOR_DIR, rel));
        if (!path.startsWith(FRONT_DOOR_DIR)) return next();
        try {
          const body = await readFile(path);
          const ext = path.slice(path.lastIndexOf('.'));
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
          res.end(body);
        } catch {
          next();
        }
      });
    },
  };
}

// /nodes/<slug>/app/* → the locally-running hosted Node, prefix stripped —
// the dev twin of Caddy's `handle_path /nodes/<slug>/app/* { reverse_proxy }`.
const hostedNodeProxies = Object.fromEntries(
  Object.entries(HOSTED_NODES).map(([slug, port]) => [
    `/nodes/${slug}/app`,
    {
      target: `http://localhost:${port}`,
      changeOrigin: false, // keep Host: localhost:5173 so cookies stay first-party
      rewrite: (p) => p.replace(new RegExp(`^/nodes/${slug}/app`), '') || '/',
    },
  ]),
);

export default defineConfig({
  plugins: [react(), nodesFrontDoor()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      ...hostedNodeProxies,
      // AIKit (/tools/*) — the local FastAPI instance (started by start.sh;
      // venv at ~/.venvs/aikit, source in ONMAC/aikit_bundle/aikit_source).
      // Path passed through intact, same as Caddy on the box.
      '/tools': {
        target: 'http://localhost:8000',
        changeOrigin: false,
      },
    },
  },
});
