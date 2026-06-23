// ai-news-today.js — the "Today in AI" news briefing shown atop the BE AI READY
// home page, the sister of governance-today.js. Where the governance briefing
// covers AI *law*, this covers AI *news*: it synthesises the items already
// ingested from Paul's curated newsletters (newsletter_items, fed from Gmail by
// the newsletter_digest job) into one short, plain-language briefing for a small-
// business audience. No web search — the source is the newsletters themselves, so
// it's cheap. Cached in app_settings (key 'ai_news_today'); regenerated on a
// schedule (or from the admin Briefings page), never per page-load. Honest empty
// state: if there are no recent items, it returns null rather than inventing news.
import pool from '../db/pool.js';
import { callClaude } from './claude.js';

const KEY = 'ai_news_today';

// The recent newsletter items to brief from: last few days, not rejected,
// curriculum-relevant first (those are the items the triage flagged as material).
async function recentItems() {
  const { rows } = await pool.query(
    `SELECT subject, summary, source_url, sender
       FROM newsletter_items
      WHERE is_rejected = false
        AND received_at >= NOW() - INTERVAL '4 days'
      ORDER BY is_curriculum_relevant DESC, received_at DESC
      LIMIT 16`).catch(() => ({ rows: [] }));
  return rows;
}

// Same cleanup as governance-today: strip a leading "Here's today's briefing:"
// style intro, stray markdown rules/headings, and collapse mid-paragraph breaks.
const META_LEADIN = /\b(let me|i'?ll (?:now )?write|here'?s? (?:is )?(?:the|today'?s)|as requested|biggest stories|based on (?:my|the) (?:items|sources|newsletters))\b/i;
function sanitizeSummary(raw) {
  let s = (raw || '').trim();
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n');
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

export async function generateAINewsToday() {
  const items = await recentItems();
  if (!items.length) return null;   // honest empty — never invent news

  const sourceList = items.map((it) => {
    const line = (it.summary || it.subject || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    return `- ${line}${it.source_url ? ` (${it.source_url})` : ''}`;
  }).join('\n');

  const writeSystem =
    'You write a daily "Today in AI" news briefing for South African small and medium businesses on the ' +
    'Be AI Ready platform. Audience: non-technical owners and managers. Tone: plain, calm, concrete — no ' +
    'hype, no jargon. Output ONLY the briefing prose and nothing else: 90–110 words, one or two short ' +
    'paragraphs. Pick out the few most important AI developments from the source items and say, in ' +
    'everyday terms, what each practically means for a small business. Do NOT restate these instructions, ' +
    'do NOT write a preamble or heading, do NOT use markdown or bullets, and do NOT produce more than one version.';
  const writeUser = `Today's AI-news items (from curated newsletters):\n\n${sourceList}\n\nWrite the briefing now.`;
  const text = await callClaude({ system: writeSystem, userContent: writeUser, maxTokens: 320, temperature: 0.4 });

  const value = {
    summary: sanitizeSummary(text),
    headlines: dedupeCitations(items.map((it) => ({ title: it.subject || it.sender, url: it.source_url }))).slice(0, 6),
    generated_at: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(value)]
  );

  // One row per calendar day (a same-day re-run upserts), so past briefings persist.
  if (value.summary) {
    const digestDate = value.generated_at.slice(0, 10);
    await pool.query(
      `INSERT INTO ai_news_today_history (digest_date, summary, headlines, generated_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (digest_date) DO UPDATE
         SET summary = EXCLUDED.summary, headlines = EXCLUDED.headlines, generated_at = EXCLUDED.generated_at`,
      [digestDate, value.summary, JSON.stringify(value.headlines || []), value.generated_at]
    ).catch((e) => console.error('[ai-news-today:history]', e.message));
  }
  return value;
}

// Past daily briefings, newest first.
export async function getAINewsTodayHistory(limit = 60) {
  const { rows } = await pool.query(
    `SELECT digest_date, summary, headlines, generated_at
       FROM ai_news_today_history ORDER BY digest_date DESC LIMIT $1`, [limit]).catch(() => ({ rows: [] }));
  return rows;
}

// Read the cached briefing. Does NOT generate on a public hit (the scheduled job /
// admin refresh keeps it fresh) — so the home page stays fast and free.
export async function getAINewsToday({ generateIfEmpty = false } = {}) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  if (rows.length) return rows[0].value;
  if (generateIfEmpty) { try { return await generateAINewsToday(); } catch { return null; } }
  return null;
}
