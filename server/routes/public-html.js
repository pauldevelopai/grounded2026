// Server-rendered HTML for public detail pages, with per-item OG/Twitter
// meta tags injected into the SPA shell. Social crawlers (Twitter, Slack,
// Discord, WhatsApp, LinkedIn, Facebook) don't execute JS, so without this
// they'd fall back to the site-wide defaults for every case/regulation.
//
// Flow:
//   nginx proxies /lawsuits/:id, /regulations/:id, /usecases/:id to Node
//   Node looks up the entity, reads the built client/dist/index.html once,
//   replaces the og-begin…og-end block with a per-item block, and serves.
//   The rest of the HTML is identical so the React app boots normally.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML_PATH = path.resolve(__dirname, '../../client/dist/index.html');

// Read the built SPA shell once per process. If the file is missing (dev),
// we fall through to plain redirects. `--watch` will reload this module on
// file changes, so a fresh `npm run build` is picked up on next restart.
let indexTemplate = null;
try {
  indexTemplate = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
} catch (err) {
  console.warn('[public-html] client/dist/index.html not found — run `npm run build` in client/ for production. Dev is unaffected.');
}

// Tolerates extra text in the comment (eg. `<!-- og-begin (annotation) -->`)
// and arbitrary whitespace, so cosmetic edits to index.html don't break the
// replacement and silently fall back to the (broken) "append" path.
const OG_BLOCK_RE = /<!--\s*og-begin\b[\s\S]*?<!--\s*og-end\b[^>]*-->/;

// SVG is supported by Slack, Discord, Telegram, Twitter (2023+), modern
// WhatsApp. Facebook + LinkedIn still prefer PNG — swap this to a PNG when
// the branding sprint delivers a bitmap version.
const DEFAULT_IMAGE = '/og-default.svg';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s, n) {
  if (!s) return '';
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : flat.slice(0, n - 1).trimEnd() + '…';
}

function hostOf(req) {
  return (req.get('X-Forwarded-Host') || req.get('Host') || 'grounded.developai.co.za').toLowerCase();
}

function originOf(req) {
  const proto = req.get('X-Forwarded-Proto') || req.protocol || 'https';
  return `${proto}://${hostOf(req)}`;
}

// The same server serves detail-page OG for both doors. Brand the OG block by
// host so a BAIR (beaiready.*) share reads "Be AI Ready", not "Grounded: AI
// Legal" (item 7). Everything else (grounded.*) keeps the Grounded branding.
function brandOf(req) {
  return hostOf(req).startsWith('beaiready')
    ? { siteName: 'Be AI Ready',      label: 'Be AI Ready' }
    : { siteName: 'Grounded: AI Legal', label: 'Grounded: AI Legal' };
}

function renderOgBlock({ title, description, url, image, type = 'article', siteName = 'Grounded: AI Legal' }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const i = escapeHtml(image);
  const s = escapeHtml(siteName);
  return `<!-- og-begin -->
    <meta name="description" content="${d}" />
    <meta property="og:site_name" content="${s}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />
    <meta property="og:image" content="${i}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${i}" />
    <title>${t}</title>
    <!-- og-end -->`;
}

function serveHtml(res, og) {
  if (!indexTemplate) {
    // Not built — just pass through to the SPA (user-agents that run JS will
    // still see the page; crawlers get a minimal placeholder).
    res.status(200).type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(og.title)}</title><meta name="description" content="${escapeHtml(og.description)}"></head><body>${escapeHtml(og.title)}</body></html>`);
    return;
  }
  // Strip the static <title> so ours wins.
  let html = indexTemplate.replace(/<title>[^<]*<\/title>\s*/i, '');
  const block = renderOgBlock(og);
  if (OG_BLOCK_RE.test(html)) {
    // Preferred path: replace the marked block in place.
    html = html.replace(OG_BLOCK_RE, block);
  } else {
    // Older build without markers — inject immediately before </head>.
    html = html.replace(/<\/head>/i, `${block}\n  </head>`);
  }
  res.status(200).type('html').send(html);
}

const router = express.Router();

// ── / (marketing root) → host-aware SPA shell for crawlers ──────────────────
// The marketing root is the most-shared URL, and social crawlers don't run JS,
// so the client head-manager (client/src/beaiready/brand.js) can't fix their
// link previews. The static index.html hard-codes "Grounded", so on the BAIR
// door (beaiready.*) a shared root link would preview as "Grounded". Serving the
// root through Node lets us inject the right OG per host (item 7).
//
// PROD WIRING (box Caddy): on the beaiready.developai.co.za block, route the
// bare root to Node so this handler fires — e.g.
//     handle / { reverse_proxy localhost:3001 }
// placed BEFORE the static SPA-fallback `handle { … try_files … }`. The grounded
// door can keep serving `/` statically (this handler is host-aware and harmless
// if it also fires there). See deploy/caddy/beaiready.developai.co.za.caddy.
const ROOT_OG = {
  beaiready: {
    title:       'Be AI Ready — get your business AI-ready',
    description: 'Be AI Ready gets your business ready to use AI safely and well — capture your knowledge, train your team, put governance in place, and measure what AI saves you. By Develop AI.',
    siteName:    'Be AI Ready',
  },
  grounded: {
    title:       'Grounded — Newsroom-owned AI',
    description: 'Small AI tools newsrooms run and own, plus an open tracker of AI in law and regulation. By Develop AI.',
    siteName:    'Grounded',
  },
};
router.get('/', (req, res) => {
  const origin = originOf(req);
  const brand  = hostOf(req).startsWith('beaiready') ? ROOT_OG.beaiready : ROOT_OG.grounded;
  serveHtml(res, {
    title:       brand.title,
    description: brand.description,
    url:         `${origin}/`,
    image:       `${origin}${DEFAULT_IMAGE}`,
    type:        'website',
    siteName:    brand.siteName,
  });
});

// ── /lawsuits/:id ──────────────────────────────────────────────────────────
router.get('/lawsuits/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, case_name, jurisdiction, case_type, summary, status
         FROM ai_lawsuits WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return next();
    const l = rows[0];
    const origin = originOf(req);
    const brand = brandOf(req);
    serveHtml(res, {
      title:       `${l.case_name} — ${brand.label}`,
      description: truncate(l.summary || `${l.case_name} · ${l.jurisdiction || 'Jurisdiction unknown'} · ${l.case_type || 'AI lawsuit'}.`, 300),
      url:         `${origin}/lawsuits/${l.id}`,
      image:       `${origin}${DEFAULT_IMAGE}`,
      type:        'article',
      siteName:    brand.siteName,
    });
  } catch (err) {
    next(err);
  }
});

// ── /regulations/:id ───────────────────────────────────────────────────────
router.get('/regulations/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, regulation_name, short_name, jurisdiction, regulation_type, summary, status
         FROM ai_regulations WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return next();
    const r = rows[0];
    const label = r.short_name ? `${r.short_name} — ${r.regulation_name}` : r.regulation_name;
    const origin = originOf(req);
    const brand = brandOf(req);
    serveHtml(res, {
      title:       `${label} — ${brand.label}`,
      description: truncate(r.summary || `${label} · ${r.jurisdiction || 'Jurisdiction unknown'} · ${r.regulation_type || 'AI regulation'}.`, 300),
      url:         `${origin}/regulations/${r.id}`,
      image:       `${origin}${DEFAULT_IMAGE}`,
      type:        'article',
      siteName:    brand.siteName,
    });
  } catch (err) {
    next(err);
  }
});

// ── /usecases/:id ──────────────────────────────────────────────────────────
router.get('/usecases/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, firm_name, use_case_title, summary, jurisdiction
         FROM ai_legal_usecases WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return next();
    const u = rows[0];
    const origin = originOf(req);
    const brand = brandOf(req);
    serveHtml(res, {
      title:       `${u.firm_name}: ${u.use_case_title} — ${brand.label}`,
      description: truncate(u.summary || `How ${u.firm_name} is using AI. ${u.jurisdiction || ''}`, 300),
      url:         `${origin}/usecases/${u.id}`,
      image:       `${origin}${DEFAULT_IMAGE}`,
      type:        'article',
      siteName:    brand.siteName,
    });
  } catch (err) {
    next(err);
  }
});

// ── /sitemap.xml ───────────────────────────────────────────────────────────
// Dynamic sitemap for search engines. Lists every public lawsuit, regulation,
// and use-case page plus the static section pages. Regenerated per request;
// the 30-min cache header keeps crawler load low.
router.get('/sitemap.xml', async (req, res) => {
  try {
    const origin = originOf(req);
    const [lawsuits, regulations, usecases] = await Promise.all([
      pool.query(`SELECT id, updated_at FROM ai_lawsuits`),
      pool.query(`SELECT id, updated_at FROM ai_regulations WHERE status = ANY($1::text[])`, [
        ['enacted', 'in_force', 'partial_force', 'amended'],
      ]),
      pool.query(`SELECT id, updated_at FROM ai_legal_usecases WHERE is_published = true`),
    ]);

    const urls = [];

    // Static hubs — priority weighted so crawlers favour them.
    const today = new Date().toISOString().slice(0, 10);
    urls.push({ loc: `${origin}/legal`,        lastmod: today, changefreq: 'daily',  priority: '1.0' });
    urls.push({ loc: `${origin}/lawsuits`,     lastmod: today, changefreq: 'daily',  priority: '0.9' });
    urls.push({ loc: `${origin}/regulations`,  lastmod: today, changefreq: 'daily',  priority: '0.9' });
    urls.push({ loc: `${origin}/usecases`,     lastmod: today, changefreq: 'weekly', priority: '0.7' });
    urls.push({ loc: `${origin}/api/v1/docs`,  lastmod: today, changefreq: 'monthly', priority: '0.4' });

    for (const l of lawsuits.rows) {
      urls.push({
        loc: `${origin}/lawsuits/${l.id}`,
        lastmod: new Date(l.updated_at).toISOString().slice(0, 10),
        changefreq: 'weekly',
        priority: '0.7',
      });
    }
    for (const r of regulations.rows) {
      urls.push({
        loc: `${origin}/regulations/${r.id}`,
        lastmod: new Date(r.updated_at).toISOString().slice(0, 10),
        changefreq: 'weekly',
        priority: '0.7',
      });
    }
    for (const u of usecases.rows) {
      urls.push({
        loc: `${origin}/usecases/${u.id}`,
        lastmod: new Date(u.updated_at).toISOString().slice(0, 10),
        changefreq: 'monthly',
        priority: '0.5',
      });
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u =>
  `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
).join('\n')}
</urlset>`;

    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.type('application/xml').send(body);
  } catch (err) {
    console.error('[sitemap]', err);
    res.status(500).type('application/xml').send('<?xml version="1.0"?><urlset></urlset>');
  }
});

export default router;
