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
import { callClaude, callClaudeWithWebSearch } from './claude.js';
import { getBriefingSettings } from './briefing-settings.js';

const KEY = 'ai_news_today';

// The recent newsletter items to brief from: last `days` days, not rejected,
// curriculum-relevant first (those are the items the triage flagged as material).
async function recentItems(days = 4) {
  const { rows } = await pool.query(
    `SELECT subject, summary, source_url, sender
       FROM newsletter_items
      WHERE is_rejected = false
        AND received_at >= NOW() - ($1 || ' days')::interval
      ORDER BY is_curriculum_relevant DESC, received_at DESC
      LIMIT 16`, [String(days)]).catch(() => ({ rows: [] }));
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

// Fallback when no newsletters have been ingested: a LIVE web search for the day's
// top AI-industry news (products, model releases, company moves, adoption — NOT law,
// which the governance briefing covers). Returns { findings, headlines } or nulls.
// Reputable outlets + official company blogs that allow Anthropic's search crawler
// (many big news sites — Reuters, AP, FT, the Verge, Wired — BLOCK it, and including
// a blocked domain 400s the whole call, so they're left out). Restricting to these
// is what stops AI-generated / speculative "news" sites producing fabricated stories
// (e.g. the invented "Claude Fable 5 export-control / double pricing" item).
const RELIABLE_AI_DOMAINS = [
  'techcrunch.com', 'technologyreview.com', 'venturebeat.com', 'axios.com', 'theinformation.com',
  'engadget.com', 'bloomberg.com', 'cnbc.com', 'semafor.com', 'theregister.com',
  'anthropic.com', 'openai.com', 'blog.google', 'deepmind.google', 'microsoft.com', 'ai.meta.com', 'mistral.ai', 'nvidia.com', 'huggingface.co',
];

async function researchTopAINews(focus) {
  const what = focus || 'major model/product releases, big company moves, funding, notable launches, and real-world adoption';
  const researchSystem =
    'You are a careful research assistant for an "AI news" briefing. Use web search to find the most significant ' +
    `AI-INDUSTRY developments worldwide from the LAST ~5 DAYS — ${what}. Do NOT focus on law/regulation (a separate ` +
    'briefing). STRICT SOURCING: report ONLY developments you can confirm from a reputable outlet in the search ' +
    'results, each tied to a specific cited source URL. Do NOT include rumours, speculation, or any pricing/' +
    'shutdown/launch claim you cannot directly attribute to a cited reputable article. If you cannot confirm an ' +
    'item, leave it out. Never invent, embellish or guess.';
  const researchUser =
    'List the 3–6 most important, CONFIRMED AI-industry developments from the last ~5 days. For each: one factual ' +
    'line (what, who, when) and the source URL. Bullet list, facts only — nothing you cannot cite.';
  const call = (allowedDomains) => callClaudeWithWebSearch({ system: researchSystem, userContent: researchUser, maxTokens: 1200, maxUses: 6, allowedDomains });
  let r;
  try { r = await call(RELIABLE_AI_DOMAINS); }
  catch (e) {
    // A domain that blocks the crawler 400s the whole request — fall back to an
    // open search (still bound by the strict prompt) so the briefing never dies.
    console.warn('[ai-news:research] allowlist search failed, retrying open:', e.message);
    r = await call(null);
  }
  return { findings: (r.text || '').trim(), citations: r.citations || [] };
}

export async function generateAINewsToday() {
  const { ai_news: cfg } = await getBriefingSettings();
  // 'auto' uses newsletters and only web-searches if none are ingested; 'newsletters'
  // never web-searches; 'websearch' skips newsletters entirely.
  const items = cfg.source === 'websearch' ? [] : await recentItems(cfg.days);

  let sourceList, headlines, sourceNote, source;
  if (items.length) {
    sourceList = items.map((it) => {
      const line = (it.summary || it.subject || '').replace(/\s+/g, ' ').trim().slice(0, 280);
      return `- ${line}${it.source_url ? ` (${it.source_url})` : ''}`;
    }).join('\n');
    headlines = dedupeCitations(items.map((it) => ({ title: it.subject || it.sender, url: it.source_url }))).slice(0, 6);
    sourceNote = 'from your curated newsletters';
    source = 'newsletters';
  } else if (cfg.source === 'newsletters') {
    return null;   // newsletters-only and none ingested — honest empty (no web fallback)
  } else {
    const research = await researchTopAINews(cfg.web_focus);
    if (!research.findings) return null;   // truly nothing to report — honest empty
    sourceList = research.findings;
    headlines = dedupeCitations(research.citations).slice(0, 6);
    sourceNote = 'from a live web search of the last few days';
    source = 'websearch';
  }

  const writeSystem =
    'You write a daily "Today in AI" news briefing for South African small and medium businesses on the ' +
    'Be AI Ready platform. Audience: non-technical owners and managers. Tone: plain, calm, concrete — no ' +
    'hype, no jargon. Output ONLY the briefing prose and nothing else: 90–110 words, one or two short ' +
    'paragraphs. Pick out the few most important AI developments from the source items and say, in ' +
    'everyday terms, what each practically means for a small business. Use ONLY the developments named in ' +
    'the source — do not add, rename or invent any product, company or model. Do NOT restate these ' +
    'instructions, do NOT write a preamble or heading, do NOT use markdown or bullets, and do NOT produce more than one version.';
  const writeUser = `Today's AI-news items (${sourceNote}):\n\n${sourceList}\n\nWrite the briefing now.`;
  const text = await callClaude({ system: writeSystem, userContent: writeUser, maxTokens: 320, temperature: 0.4 });

  const value = {
    summary: sanitizeSummary(text),
    headlines,
    source,
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
