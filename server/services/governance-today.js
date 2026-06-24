// governance-today.js — the "Today in AI governance" (AI Law) briefing shown atop
// the tracker AND on the BE AI READY home. Source of truth = OUR OWN Law &
// Regulation tracker (ai_lawsuits + ai_regulations), NOT a live web search. Paul's
// call (2026-06-24): the team curates the tracker, so the briefing must come
// directly from it — full oversight, and no web-sourced fabrication. It summarises
// the most-recently-updated tracked items into a short business-facing read, with
// the tracked items as the cited sources. Cached in app_settings ('governance_today')
// + governance_today_history; regenerated on a schedule or from the admin.
import pool from '../db/pool.js';
import { callClaude } from './claude.js';
import { getBriefingSettings } from './briefing-settings.js';

const KEY = 'governance_today';

// The most-recently-updated tracked lawsuits + regulations — the curated corpus the
// briefing is written from. Newest first across both, capped at `limit`.
async function recentTrackerItems(limit) {
  const { rows: law } = await pool.query(
    `SELECT case_name AS name, jurisdiction, status, summary, source_url, case_url,
            COALESCE(last_update, updated_at::date) AS dt, 'lawsuit' AS kind
       FROM ai_lawsuits
      ORDER BY COALESCE(last_update, updated_at::date) DESC NULLS LAST LIMIT $1`, [limit]
  ).catch(() => ({ rows: [] }));
  const { rows: reg } = await pool.query(
    `SELECT regulation_name AS name, jurisdiction, status, summary, source_url, official_url AS case_url,
            COALESCE(enforcement_date, effective_date, updated_at::date) AS dt, 'regulation' AS kind
       FROM ai_regulations
      ORDER BY updated_at DESC NULLS LAST LIMIT $1`, [limit]
  ).catch(() => ({ rows: [] }));
  return [...law, ...reg]
    .sort((a, b) => (b.dt ? new Date(b.dt).getTime() : 0) - (a.dt ? new Date(a.dt).getTime() : 0))
    .slice(0, limit);
}

function sanitizeSummary(raw) {
  let s = (raw || '').trim();
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
  return s.trim();
}

function buildHeadlines(items) {
  const seen = new Set(); const out = [];
  for (const it of items) {
    const url = it.source_url || it.case_url || null;
    const key = url || it.name;
    if (key && !seen.has(key)) { seen.add(key); out.push({ title: it.name, url }); }
  }
  return out.slice(0, 6);
}

export async function generateGovernanceToday() {
  const settings = await getBriefingSettings();
  const items = await recentTrackerItems(settings.ai_law.item_count || 10);
  if (!items.length) return null;   // nothing tracked yet — honest empty (no invention)

  const sourceList = items.map((it) => {
    const meta = [it.jurisdiction, it.status].filter(Boolean).join(', ');
    const sum = (it.summary || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `- [${it.kind}] ${it.name}${meta ? ` (${meta})` : ''}${sum ? `: ${sum}` : ''}`;
  }).join('\n');

  const writeSystem =
    'You write a daily "Today in AI governance" briefing for South African small and medium businesses on ' +
    'the Be AI Ready platform. Audience: non-technical owners and managers. Tone: plain, calm, concrete — no ' +
    'hype, no jargon. You are given items from OUR OWN curated AI Law & Regulation tracker. Output ONLY the ' +
    'briefing prose and nothing else: 90–110 words, one or two short paragraphs. Pick the few most significant ' +
    'items and say, in everyday terms, what each practically means for a small business. Use ONLY the items ' +
    'provided — do not add, rename, merge or invent any law, case, company, product or model, and do not pull ' +
    'in anything from outside this list. Do NOT restate these instructions, write a preamble or heading, use ' +
    'markdown or bullets, or produce more than one version.';
  const writeUser = `From our Law & Regulation tracker (most recently updated, newest first):\n\n${sourceList}\n\nWrite the briefing now.`;
  const text = await callClaude({ system: writeSystem, userContent: writeUser, maxTokens: 320, temperature: 0.4 });

  const value = {
    summary: sanitizeSummary(text),
    headlines: buildHeadlines(items),
    source: 'tracker',
    generated_at: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(value)]
  );
  if (value.summary) {
    const digestDate = value.generated_at.slice(0, 10);
    await pool.query(
      `INSERT INTO governance_today_history (digest_date, summary, headlines, generated_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (digest_date) DO UPDATE
         SET summary = EXCLUDED.summary, headlines = EXCLUDED.headlines, generated_at = EXCLUDED.generated_at`,
      [digestDate, value.summary, JSON.stringify(value.headlines || []), value.generated_at]
    ).catch((e) => console.error('[governance-today:history]', e.message));
  }
  return value;
}

export async function getGovernanceTodayHistory(limit = 60) {
  const { rows } = await pool.query(
    `SELECT digest_date, summary, headlines, generated_at
       FROM governance_today_history ORDER BY digest_date DESC LIMIT $1`, [limit]);
  return rows;
}

export async function getGovernanceToday({ generateIfEmpty = false } = {}) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  if (rows.length) return rows[0].value;
  if (generateIfEmpty) { try { return await generateGovernanceToday(); } catch { return null; } }
  return null;
}
