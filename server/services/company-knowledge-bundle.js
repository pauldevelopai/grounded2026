// company-knowledge-bundle.js — KnowHow's OUTWARD export. Assembles a deploy-ready
// zip the business drops onto its OWN public website: llms.txt, llms-full.txt,
// robots.txt, markdown mirrors, and schema.org JSON-LD — built in memory with jszip.
// Only sources the business explicitly marked PUBLISH (and not sensitive) are included;
// their encrypted text is decrypted in memory only. Ported from node-aiready
// lib/bundle.js + jsonld.js, adapted to beaiready_company_sources.
import JSZip from 'jszip';
import pool from '../db/pool.js';
import { decryptFor } from './crypto.js';

export const CRAWLERS = ['ClaudeBot', 'GPTBot', 'PerplexityBot', 'CCBot', 'Google-Extended'];

function slugify(s, fallback = 'page') {
  const base = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return base || fallback;
}
function oneLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function yaml(s) { const v = String(s ?? ''); return /[:#]/.test(v) ? JSON.stringify(v) : v; }

export async function getSettings(newsroomId) {
  const { rows: [s] } = await pool.query(
    'SELECT org_name, site_url, crawlers FROM beaiready_knowhow_settings WHERE newsroom_id = $1', [newsroomId]);
  const { rows: [nr] } = await pool.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
  return {
    org_name: s?.org_name || nr?.name || 'Our business',
    site_url: s?.site_url || '',
    crawlers: { ...Object.fromEntries([...CRAWLERS, '*'].map((c) => [c, 'allow'])), ...(s?.crawlers || {}) },
  };
}

export async function saveSettings(newsroomId, { org_name, site_url, crawlers }) {
  const { rows: [s] } = await pool.query(
    `INSERT INTO beaiready_knowhow_settings (newsroom_id, org_name, site_url, crawlers, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (newsroom_id) DO UPDATE SET org_name = EXCLUDED.org_name, site_url = EXCLUDED.site_url,
       crawlers = EXCLUDED.crawlers, updated_at = NOW()
     RETURNING org_name, site_url, crawlers`,
    [newsroomId, org_name || null, site_url || null, JSON.stringify(crawlers || {})]);
  return s;
}

// Published, non-sensitive sources with decrypted text + a stable, collision-free slug.
async function publishableSources(newsroomId) {
  const { rows } = await pool.query(
    `SELECT id, kind, title, url, summary, extracted_text FROM beaiready_company_sources
      WHERE newsroom_id = $1 AND publish = true AND sensitive = false
        AND extracted_text IS NOT NULL AND length(extracted_text) > 0
      ORDER BY created_at DESC`, [newsroomId]);
  const used = new Set();
  const out = [];
  for (const r of rows) {
    const text = decryptFor(newsroomId, r.extracted_text) || '';
    if (!text) continue;
    let slug = slugify(r.title || r.url || 'page'); const base = slug; let i = 2;
    while (used.has(slug)) slug = `${base}-${i++}`;
    used.add(slug);
    out.push({ ...r, text, slug, summary: r.summary || oneLine(text).slice(0, 200) });
  }
  return out;
}

export async function bundleStats(newsroomId) {
  return { publishable: (await publishableSources(newsroomId)).length };
}

export async function buildBundle(newsroomId) {
  const settings = await getSettings(newsroomId);
  const items = await publishableSources(newsroomId);
  const zip = new JSZip();
  for (const a of items) {
    zip.file(`mirror/${a.slug}.md`, mirrorFile(a));
    zip.file(`jsonld/${a.slug}.json`, JSON.stringify(jsonLd(a, settings), null, 2));
  }
  zip.file('llms.txt', buildLlmsTxt(settings, items));
  zip.file('llms-full.txt', buildLlmsFull(settings, items));
  zip.file('robots.txt', buildRobots(settings));
  zip.file('README.md', buildReadme(settings, items.length));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, filename: 'knowhow-ai-bundle.zip', count: items.length };
}

function mirrorFile(a) {
  const fm = ['---', `title: ${yaml(a.title || a.slug)}`];
  if (a.url) fm.push(`source_url: ${yaml(a.url)}`);
  fm.push('---', '');
  const heading = /^\s*#\s+\S/.test(a.text) ? '' : `# ${a.title || a.slug}\n\n`;
  return fm.join('\n') + heading + a.text + '\n';
}

function jsonLd(a, settings) {
  return {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.title || a.slug,
    ...(a.url ? { url: a.url, mainEntityOfPage: a.url } : {}),
    description: a.summary,
    articleBody: oneLine(a.text).slice(0, 5000),
    publisher: { '@type': 'Organization', name: settings.org_name, ...(settings.site_url ? { url: settings.site_url } : {}) },
  };
}

function buildLlmsTxt(settings, items) {
  const out = [`# ${settings.org_name}`, '', '## Knowledge', ''];
  for (const a of items) {
    const link = a.url || `${(settings.site_url || '').replace(/\/$/, '')}/mirror/${a.slug}.md`;
    out.push(`- [${a.title || a.slug}](${link})${a.summary ? `: ${oneLine(a.summary)}` : ''}`);
  }
  return out.join('\n').trim() + '\n';
}

function buildLlmsFull(settings, items) {
  const out = [`# ${settings.org_name} — full text`, ''];
  for (const a of items) {
    out.push('---', '', `# ${a.title || a.slug}`);
    if (a.url) out.push(`Source: ${a.url}`);
    out.push('', a.text, '');
  }
  return out.join('\n').trim() + '\n';
}

function buildRobots(settings) {
  const lines = ['# AI crawler policy — generated by Be AI Ready KnowHow', ''];
  for (const bot of CRAWLERS) {
    const allow = (settings.crawlers?.[bot] || 'allow') === 'allow';
    lines.push(`User-agent: ${bot}`, allow ? 'Allow: /' : 'Disallow: /', '');
  }
  const star = (settings.crawlers?.['*'] || 'allow') === 'allow';
  lines.push('User-agent: *', star ? 'Allow: /' : 'Disallow: /', '');
  return lines.join('\n');
}

function buildReadme(settings, count) {
  return `# ${settings.org_name} — your AI-ready bundle

Everything here is yours to put on your **own** website so AI systems read, trust and
cite your business correctly. Nothing here is hosted for you.

| File | Where it goes |
|---|---|
| \`llms.txt\` | Your site root (\`/llms.txt\`) — an index of what you've published. |
| \`llms-full.txt\` | Your site root — the full text for AI to ingest. |
| \`robots.txt\` | Your site root (merge with any existing one) — per-AI-crawler policy. |
| \`mirror/<slug>.md\` | Serve at a public path; match it to your site URL. |
| \`jsonld/<slug>.json\` | Inject into each page's \`<head>\` inside \`<script type="application/ld+json">\`. |

Included: ${count} published item(s). Anything not marked **Publish**, or marked
**Sensitive**, is deliberately left out. Re-export any time you change what's published.
`;
}
