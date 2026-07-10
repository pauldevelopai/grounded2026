// node-catalogue.js — the single source for the BE AI READY Nodes storefront. Reads the
// static registry (nodes.json — the box copy, the local sibling repo, or the live URL),
// shapes each Node for the storefront, and caches 5 min. Used by the public storefront
// (/api/public/bair-nodes — everyone, for browsing) AND the per-client list
// (/api/beaiready/my-nodes — a signed-in client's entitled Nodes only).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Nodes kept out of the storefront panels (registry stays the single source of truth;
// these are just not surfaced here). 'aiready' is folded into KnowHow. Paul's call.
const HIDDEN_STOREFRONT_SLUGS = new Set(['podcasting', 'progress', 'salesrep', 'aiready']);

let _cache = { at: 0, data: null };

async function loadRegistry() {
  const candidates = [
    process.env.NODES_REGISTRY_FILE,
    '/var/www/nodes/nodes.json',                              // the box
    path.join(__dirname, '../../../Nodes/nodes/nodes.json'),  // local dev sibling repo
  ].filter(Boolean);
  for (const f of candidates) {
    try { return JSON.parse(await readFile(f, 'utf8')); } catch { /* try next */ }
  }
  const url = process.env.NODES_REGISTRY_URL || 'https://grounded.developai.co.za/nodes/nodes.json';
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`registry ${r.status}`);
  return r.json();
}

// The storefront Node list, shaped + sorted (built-in first, then live, then soon).
export async function listStorefrontNodes() {
  if (_cache.data && Date.now() - _cache.at < 5 * 60 * 1000) return _cache.data;
  const reg = await loadRegistry();
  const nodes = ((reg && reg.nodes) || [])
    .filter((n) => Array.isArray(n.products) && n.products.length > 0)
    .filter((n) => !HIDDEN_STOREFRONT_SLUGS.has(n.slug))
    .map((n) => {
      // A 'builtin' Node lives inside the tracker app (e.g. LeadFinder) — it opens at its
      // in-app href, not a hosted /nodes/<slug>/app/ process, and has no download link.
      const builtin = n.kind === 'builtin';
      return {
        slug: n.slug, name: n.name, desc: n.desc || '', status: n.status || 'soon',
        hosted: !!n.hosted, builtin,
        // Every hosted Node is served on the beaiready host too (one shared Caddy block),
        // so a SAME-ORIGIN URL runs it in-place and sends the host-scoped cookie.
        runUrl: builtin ? (n.href || null) : (n.hosted ? `/nodes/${n.slug}/app/` : null),
      };
    })
    .sort((a, b) => (Number(b.builtin) - Number(a.builtin))
      || (Number(b.status === 'live') - Number(a.status === 'live')));
  _cache = { at: Date.now(), data: nodes };
  return nodes;
}
