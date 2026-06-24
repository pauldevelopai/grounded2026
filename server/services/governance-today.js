// governance-today.js — the "Today" AI-governance briefing shown atop the BE AI
// READY tracker. The tracker itself only holds lawsuits + regulations (items the
// triage promotes); breaking news — a model suspension, an enforcement action —
// never becomes a "lawsuit" or "regulation", so it never appears. This fills that
// gap: it grounds Claude in what we already track, then uses a LIVE web search
// (callClaudeWithWebSearch) to surface the latest developments, and writes a short
// conversational digest for a business audience. Cached in app_settings
// (key 'governance_today'); regenerated on a schedule, never per page-load.
import pool from '../db/pool.js';
import { callClaude, callClaudeWithWebSearch } from './claude.js';
import { addDevelopmentsToTracker } from './governance-tracker-sync.js';

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

// Models sometimes ignore "no preamble" and pad length. Strip a leading
// "Here is today's briefing:" style intro, stray markdown rules/headings, and
// collapse the odd mid-paragraph line breaks web-search responses produce.
const META_LEADIN = /\b(let me|i'?ll (?:now )?write|here'?s? (?:is )?(?:the|today'?s)|as requested|well[- ]sourced|biggest stories|i (?:have |')?found|based on (?:my|the) (?:search|research)|deserve a briefing)\b/i;
function sanitizeSummary(raw) {
  let s = (raw || '').trim();
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, '');     // horizontal rules on their own line
  s = s.replace(/^#{1,6}\s+/gm, '');            // stray headings
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
  // Drop any leading meta-commentary sentences ("Let me now write the briefing.",
  // "The two biggest stories ... are well-sourced.") until real content begins.
  let guard = 0;
  while (guard++ < 4) {
    const m = s.match(/^\s*([^.!?]*[.!?]+)\s*/);
    if (m && META_LEADIN.test(m[1])) { s = s.slice(m[0].length); } else break;
  }
  return s.trim();
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

  // Step 1 — research (web search). Gather the facts + sources; don't write prose here.
  // Models pad and double-draft when asked to search AND write in one shot, so we split it.
  const researchSystem =
    'You are a research assistant for an AI-governance tracker. Use web search to find the most significant ' +
    'AI data-governance developments worldwide from the LAST ~7 DAYS — regulatory actions and enforcement, ' +
    'major lawsuits/settlements/court rulings, AI models being suspended/withdrawn/restricted, and big policy ' +
    'shifts. Each item must be a SPECIFIC, recently DATED event from an authoritative news source — NOT a ' +
    'generic explainer, an undated overview, or a "where are they now / 2025 update" roundup page. Prefer the ' +
    'newest sources. Never invent; if unsure, leave it out.';
  const researchUser =
    `Our tracker already follows:\n\n${context}\n\n` +
    'List the 3–5 most important developments from the LAST ~7 DAYS, newest first. For each: one factual line ' +
    '(what, who, when — include the date) and the source. Skip anything you cannot date to the last week. ' +
    'Bullet list, facts only — no analysis.';
  const { text: findings, citations } = await callClaudeWithWebSearch({
    system: researchSystem, userContent: researchUser, maxTokens: 1200, maxUses: 5,
  });

  // Step 2 — write the briefing (no tools → tight length, no search narration).
  const writeSystem =
    'You write a daily "Today in AI governance" briefing for South African small and medium businesses on ' +
    'the Be AI Ready platform. Audience: non-technical owners and managers. Tone: plain, calm, concrete — no ' +
    'hype, no jargon. Output ONLY the briefing prose and nothing else: 90–110 words, one or two short ' +
    'paragraphs. Name the most important developments specifically and say what each practically means for a ' +
    'small business. Use ONLY the developments in the verified findings — do not add, rename, merge or invent ' +
    'any law, case, company, product or model name. Do NOT restate these instructions, do NOT write a preamble ' +
    'or heading, do NOT use markdown or bullets, and do NOT produce more than one version.';
  const writeUser = `Today's verified developments:\n\n${findings}\n\nWrite the briefing now.`;
  const text = await callClaude({ system: writeSystem, userContent: writeUser, maxTokens: 320, temperature: 0.4 });

  const value = {
    summary: sanitizeSummary(text),
    headlines: dedupeCitations(citations).slice(0, 6),
    generated_at: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(value)]
  );
  // Add the legal developments behind this briefing to the tracker (auto_added,
  // pending review). Best-effort: a failure here must not lose the briefing.
  try {
    const sync = await addDevelopmentsToTracker(findings, citations);
    value.tracker_added = sync.added.length;
    if (sync.added.length) console.log('[governance-today] tracker auto-add:', sync.added.map((a) => `${a.kind}:${a.name}`).join('; '));
  } catch (e) { console.error('[governance-today:tracker-sync]', e.message); }

  // Persist this briefing to history (one row per calendar day; a same-day re-run
  // overwrites it) so past briefings live on under the tracker's third tab.
  if (value.summary) {
    const digestDate = value.generated_at.slice(0, 10);   // YYYY-MM-DD (UTC; 05:00 SAST = same day)
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

// Past daily briefings, newest first (powers the tracker's "Daily briefings" tab).
export async function getGovernanceTodayHistory(limit = 60) {
  const { rows } = await pool.query(
    `SELECT digest_date, summary, headlines, generated_at
       FROM governance_today_history ORDER BY digest_date DESC LIMIT $1`, [limit]);
  return rows;
}

// Read the cached digest. Does NOT generate on a public hit by default (web search
// costs money and is slow) — the scheduled job / admin refresh keeps it fresh.
export async function getGovernanceToday({ generateIfEmpty = false } = {}) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  if (rows.length) return rows[0].value;
  if (generateIfEmpty) { try { return await generateGovernanceToday(); } catch { return null; } }
  return null;
}
