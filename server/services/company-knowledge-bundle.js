// company-knowledge-bundle.js — KnowHow's OUTWARD export. Assembles the deploy-ready
// zip a business drops onto its OWN public website: llms.txt, llms-full.txt,
// robots.txt, markdown mirrors, and schema.org JSON-LD — built in memory with jszip.
// Honours the full manifest: bulk rules → effective toggles, per-document output
// toggles (out_*), and the publish gate (inclusion=include AND sensitivity=none).
// Encrypted source text is decrypted in memory only. Ported from node-aiready
// lib/bundle.js, adapted to beaiready_company_sources.
import JSZip from 'jszip';
import pool from '../db/pool.js';
import { decryptFor } from './crypto.js';
import { applyRules, isPublishable } from './company-knowledge-rules.js';
import { buildJsonLd } from './company-knowledge-generate.js';

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
    'SELECT org_name, site_url, crawlers, llms_summary, mirror_base, rules FROM beaiready_knowhow_settings WHERE newsroom_id = $1', [newsroomId]);
  const { rows: [nr] } = await pool.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
  return {
    org_name: s?.org_name || nr?.name || 'Our business',
    site_url: s?.site_url || '',
    llms_summary: s?.llms_summary || '',
    mirror_base: s?.mirror_base || '/',
    crawlers: { ...Object.fromEntries([...CRAWLERS, '*'].map((c) => [c, 'allow'])), ...(s?.crawlers || {}) },
    rules: s?.rules || [],
  };
}

// Merge-upsert: only the provided keys change (so /settings and /rules don't clobber).
export async function saveSettings(newsroomId, patch = {}) {
  const cur = await getSettings(newsroomId);
  const next = { ...cur, ...patch };
  await pool.query(
    `INSERT INTO beaiready_knowhow_settings (newsroom_id, org_name, site_url, crawlers, llms_summary, mirror_base, rules, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (newsroom_id) DO UPDATE SET org_name = EXCLUDED.org_name, site_url = EXCLUDED.site_url,
       crawlers = EXCLUDED.crawlers, llms_summary = EXCLUDED.llms_summary, mirror_base = EXCLUDED.mirror_base,
       rules = EXCLUDED.rules, updated_at = NOW()`,
    [newsroomId, next.org_name || null, next.site_url || null, JSON.stringify(next.crawlers || {}),
     next.llms_summary || null, next.mirror_base || null, JSON.stringify(next.rules || [])]);
  return getSettings(newsroomId);
}

// Publishable items (rules applied, isPublishable gate), decrypted, with a stable slug.
async function publishableItems(newsroomId, settings) {
  const rules = settings.rules || [];
  const { rows } = await pool.query(
    `SELECT id, kind, title, url, author, category, published_at, summary, slug, inclusion, sensitivity,
            out_clean_markdown, out_json_ld, out_mirror_md, in_llms_txt, in_llms_full, manual_overrides, extracted_text
       FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]);
  const used = new Set();
  const out = [];
  for (const r of rows) {
    const eff = applyRules(r, rules);
    if (!isPublishable(eff)) continue;
    const text = decryptFor(newsroomId, r.extracted_text) || '';
    if (!text) continue;
    let slug = r.slug || slugify(r.title || r.url || 'page'); const base = slug; let i = 2;
    while (used.has(slug)) slug = `${base}-${i++}`;
    used.add(slug);
    out.push({ ...eff, text, slug, summary: r.summary || oneLine(text).slice(0, 200) });
  }
  return out;
}

export async function bundleStats(newsroomId) {
  const settings = await getSettings(newsroomId);
  const items = await publishableItems(newsroomId, settings);
  return {
    publishable: items.length,
    mirror: items.filter((a) => a.out_mirror_md).length,
    jsonld: items.filter((a) => a.out_json_ld).length,
    llms_txt: items.filter((a) => a.in_llms_txt).length,
    llms_full: items.filter((a) => a.in_llms_full).length,
  };
}

export async function buildBundle(newsroomId) {
  const settings = await getSettings(newsroomId);
  const items = await publishableItems(newsroomId, settings);
  const zip = new JSZip();
  for (const a of items) {
    if (a.out_mirror_md) zip.file(`mirror/${a.slug}.md`, mirrorFile(a));
    if (a.out_json_ld) zip.file(`jsonld/${a.slug}.json`, JSON.stringify(buildJsonLd(a, settings), null, 2));
  }
  const llmsList = items.filter((a) => a.in_llms_txt);
  const llmsFull = items.filter((a) => a.in_llms_full);
  zip.file('llms.txt', buildLlmsTxt(settings, llmsList));
  zip.file('llms-full.txt', buildLlmsFull(settings, llmsFull));
  zip.file('robots.txt', buildRobots(settings));
  zip.file('README.md', buildReadme(settings, items.length));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, filename: 'knowhow-ai-bundle.zip', count: items.length };
}

function mirrorFile(a) {
  const fm = ['---', `title: ${yaml(a.title || a.slug)}`];
  if (a.url) fm.push(`source_url: ${yaml(a.url)}`);
  if (a.author) fm.push(`author: ${yaml(a.author)}`);
  if (a.category) fm.push(`section: ${yaml(a.category)}`);
  fm.push('---', '');
  const heading = /^\s*#\s+\S/.test(a.text) ? '' : `# ${a.title || a.slug}\n\n`;
  return fm.join('\n') + heading + a.text + '\n';
}

function buildLlmsTxt(settings, items) {
  const out = [`# ${settings.org_name}`, ''];
  if (settings.llms_summary) out.push(`> ${oneLine(settings.llms_summary)}`, '');
  const groups = new Map();
  for (const a of items) { const g = a.category || 'Knowledge'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
  for (const [g, list] of groups) {
    out.push(`## ${g}`, '');
    for (const a of list) {
      const link = a.url || `${(settings.mirror_base || '/').replace(/\/$/, '')}/mirror/${a.slug}.md`;
      out.push(`- [${a.title || a.slug}](${link})${a.summary ? `: ${oneLine(a.summary)}` : ''}`);
    }
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}

function buildLlmsFull(settings, items) {
  const out = [`# ${settings.org_name} — full text`, ''];
  if (settings.llms_summary) out.push(`> ${oneLine(settings.llms_summary)}`, '');
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
| \`mirror/<slug>.md\` | Serve at your mirror base path (\`${settings.mirror_base || '/'}\`). |
| \`jsonld/<slug>.json\` | Inject into each page's \`<head>\` inside \`<script type="application/ld+json">\`. |

Included: ${count} published item(s). Anything set to **exclude**/**local-only**, marked
**sensitive**, or with a publication toggle off is left out. Re-export any time.
`;
}
