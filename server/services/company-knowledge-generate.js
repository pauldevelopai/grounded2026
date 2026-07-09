// company-knowledge-generate.js — AI summaries + schema.org JSON-LD for KnowHow.
// Claude writes a short factual summary per source (feeds llms.txt + the JSON-LD
// description); the JSON-LD skeleton is deterministic from the row + site settings.
// Ported from node-aiready lib/jsonld.js, adapted to the encrypted company sources.
import pool from '../db/pool.js';
import { decryptFor } from './crypto.js';
import { callClaude } from './claude.js';
import { applyRules, isSearchable } from './company-knowledge-rules.js';

export function buildJsonLd(a, settings = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title || a.slug || 'Untitled',
    ...(a.url ? { url: a.url, mainEntityOfPage: a.url } : {}),
    ...(a.published_at ? { datePublished: new Date(a.published_at).toISOString() } : {}),
    ...(a.author ? { author: { '@type': 'Person', name: a.author } } : {}),
    ...(a.category ? { articleSection: a.category } : {}),
    ...(a.summary ? { description: a.summary } : {}),
    publisher: { '@type': 'Organization', name: settings.org_name || 'Our business', ...(settings.site_url ? { url: settings.site_url } : {}) },
  };
}

export function jsonLdScript(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

// Write a summary for every searchable source that lacks one (or all, if force).
export async function generateSummaries(newsroomId, { force = false } = {}) {
  const { rows: nr } = await pool.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
  const orgName = nr[0]?.name || 'the business';
  const { rows: srow } = await pool.query('SELECT rules FROM beaiready_knowhow_settings WHERE newsroom_id = $1', [newsroomId]);
  const rules = srow[0]?.rules || [];
  const { rows } = await pool.query(
    `SELECT id, title, extracted_text, inclusion, sensitivity, summary, manual_overrides
       FROM beaiready_company_sources WHERE newsroom_id = $1`, [newsroomId]);
  const todo = rows.map((r) => applyRules(r, rules)).filter(isSearchable).filter((r) => force || !r.summary);
  const stats = { total: todo.length, done: 0, failed: 0 };
  for (const r of todo) {
    try {
      const text = (decryptFor(newsroomId, r.extracted_text) || '').slice(0, 6000);
      if (!text) { stats.failed++; continue; }
      const system = `You write one concise, factual sentence summarising a business document for ${orgName}. `
        + 'Return STRICT JSON only: {"summary": string (<=220 chars, neutral, no marketing fluff)}. Ground it in the text; invent nothing.';
      const out = await callClaude({ system, userContent: `Title: ${r.title || 'Untitled'}\n\n${text}\n\nReturn the JSON.`, maxTokens: 300, temperature: 0.2 });
      const parsed = safeJson(out);
      const summary = parsed?.summary ? String(parsed.summary).trim().slice(0, 240) : null;
      if (!summary) { stats.failed++; continue; }
      await pool.query('UPDATE beaiready_company_sources SET summary = $1 WHERE id = $2 AND newsroom_id = $3', [summary, r.id, newsroomId]);
      stats.done++;
    } catch (e) { console.error('[knowhow generate]', r.id, e.message); stats.failed++; }
  }
  return stats;
}

function safeJson(t) {
  if (!t) return null;
  const m = String(t).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
