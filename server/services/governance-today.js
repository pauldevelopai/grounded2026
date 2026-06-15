// governance-today.js — the "Today" AI-governance briefing shown atop the BE AI
// READY tracker. The tracker itself only holds lawsuits + regulations (items the
// triage promotes); breaking news — a model suspension, an enforcement action —
// never becomes a "lawsuit" or "regulation", so it never appears. This fills that
// gap: it grounds Claude in what we already track, then uses a LIVE web search
// (callClaudeWithWebSearch) to surface the latest developments, and writes a short
// conversational digest for a business audience. Cached in app_settings
// (key 'governance_today'); regenerated on a schedule, never per page-load.
import pool from '../db/pool.js';
import { callClaudeWithWebSearch } from './claude.js';

const KEY = 'governance_today';

async function recentContext() {
  const { rows: law } = await pool.query(
    `SELECT case_name, status FROM ai_lawsuits ORDER BY last_update DESC NULLS LAST LIMIT 6`).catch(() => ({ rows: [] }));
  const { rows: reg } = await pool.query(
    `SELECT regulation_name, jurisdiction, status FROM ai_regulations ORDER BY updated_at DESC NULLS LAST LIMIT 6`).catch(() => ({ rows: [] }));
  const l = law.map((r) => `- ${r.case_name} (${r.status})`).join('\n') || '(none)';
  const g = reg.map((r) => `- ${r.regulation_name} — ${r.jurisdiction} (${r.status})`).join('\n') || '(none)';
  return `Lawsuits we already track:\n${l}\n\nRegulations we already track:\n${g}`;
}

function dedupeCitations(cites) {
  const seen = new Set(); const out = [];
  for (const c of cites || []) {
    if (c.url && !seen.has(c.url)) { seen.add(c.url); out.push({ title: c.title || c.url, url: c.url }); }
  }
  return out;
}

export async function generateGovernanceToday() {
  const context = await recentContext();
  const system =
    'You write a short daily "Today in AI governance" briefing for South African small and medium ' +
    'businesses on the Be AI Ready platform. Audience: non-technical owners and managers. Tone: plain, ' +
    'calm, concrete — no hype, no jargon. You have a web search tool: use it to find the most significant ' +
    'AI data-governance developments worldwide from the LAST ~10 DAYS — regulatory actions and enforcement, ' +
    'major lawsuits or settlements, AI models being suspended/withdrawn/restricted, and big policy shifts. ' +
    'Prefer authoritative, recent sources. Never invent; if unsure, leave it out.';
  const userContent =
    `Here is what our tracker already follows:\n\n${context}\n\n` +
    'Write TWO short paragraphs (about 130 words total): where AI data governance stands right now ' +
    'globally, weaving in the most important very recent developments you find via web search (name them ' +
    'specifically — e.g. a particular model suspension or enforcement action and who it affects), and what ' +
    'it practically means for a small business. Plain prose only — no headings, no preamble, no bullet list.';

  const { text, citations } = await callClaudeWithWebSearch({ system, userContent, maxTokens: 900, maxUses: 5 });
  const value = {
    summary: (text || '').trim(),
    headlines: dedupeCitations(citations).slice(0, 6),
    generated_at: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(value)]
  );
  return value;
}

// Read the cached digest. Does NOT generate on a public hit by default (web search
// costs money and is slow) — the scheduled job / admin refresh keeps it fresh.
export async function getGovernanceToday({ generateIfEmpty = false } = {}) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  if (rows.length) return rows[0].value;
  if (generateIfEmpty) { try { return await generateGovernanceToday(); } catch { return null; } }
  return null;
}
