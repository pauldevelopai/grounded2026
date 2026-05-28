// Monetisation AI triage — reads pending content_raw_items (domain
// 'monetisation'), asks Claude to judge relevance + classify each into one of
// the four monetisation topics, write a short summary, and emit a compiled
// monetisation_items row (status 'review') for admin to publish. Irrelevant
// items are marked 'rejected'. Mirrors the legal triage shape (batched, cached
// system block, Haiku, low temperature).

import pool from '../../db/pool.js';
import { callClaudeClassifier } from '../claude.js';

const BATCH = 20;
const TEMP = 0.1;

const SYSTEM = `You are a precise triage agent building a high-quality knowledge base on
"AI and money in newsrooms" — how news organisations earn revenue (and protect their
rights) in the age of AI. Your job is to surface the BEST RESEARCH, CONCRETE SOLUTIONS,
and REAL USE CASES — not commentary or hype.

For each item decide relevance, then classify into ONE topic:
- "archive"     — extracting value from a news archive / back catalogue (licensing it to AI firms, data products, paid access)
- "crawlers"    — charging or controlling AI crawlers/bots (pay-per-crawl, blocking, licensing bot access, robots/CDN signals)
- "aeo"         — Answer Engine Optimization: being cited by ChatGPT/Perplexity/Google AI Overviews; referral/attribution value
- "bargaining"  — collective bargaining / licensing consortia / newsrooms negotiating with AI companies as a bloc
- "general"     — AI-era newsroom revenue broadly (AI licensing deals, paid AI products, new revenue models) not fitting one topic above

Rate relevance STRICTLY (0–1). Reserve 0.8+ for substantive material a media-business
leader would act on: original research/reports, named case studies with outcomes/numbers,
concrete how-to solutions, or significant AI-licensing deals. Score generic opinion,
press releases, unrelated tech/AI news, and pure marketing BELOW 0.4 and mark relevant:false.

Set item_type to reflect WHAT it is:
  "report" (research/study), "case_study" (a named newsroom's real example, ideally with results),
  "guide" (an actionable how-to/solution), "tool" (a product/service), "news" (a deal/announcement), "article" (analysis).

Return ONLY a JSON array, one object per input item IN ORDER:
[{"i":0,"relevant":true,"topic":"crawlers","item_type":"case_study","summary":"<=240 chars, factual, lead with the concrete finding/outcome","relevance":0.0-1.0},
 {"i":1,"relevant":false}]`;

export async function triageMonetisationPending({ limit = BATCH } = {}) {
  const { rows: items } = await pool.query(
    `SELECT id, title, content, url, author, published_at, source_id
       FROM content_raw_items
      WHERE domain = 'monetisation' AND triage_status = 'pending'
      ORDER BY fetched_at ASC
      LIMIT $1`,
    [limit]
  );
  if (items.length === 0) return { triaged: 0, promoted: 0, rejected: 0 };

  const userContent = '# Items\n' + items.map((it, i) =>
    `## ${i}\nTitle: ${it.title || '(none)'}\nText: ${(it.content || '').slice(0, 1200)}`
  ).join('\n\n');

  let results = [];
  try {
    const raw = await callClaudeClassifier({
      cachedSystem: SYSTEM,
      userContent,
      maxTokens: Math.min(4000, 180 * items.length + 200),
      temperature: TEMP,
    });
    results = parseJsonArray(raw);
  } catch (err) {
    console.error('[monetisation-triage] classifier failed:', err.message);
    return { triaged: 0, promoted: 0, rejected: 0, error: err.message };
  }

  let promoted = 0, rejected = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = results.find(x => x && x.i === i) || results[i] || { relevant: false };
    const validTopic = ['archive', 'crawlers', 'aeo', 'bargaining', 'general'].includes(r.topic);
    if (r.relevant && validTopic) {
      const src = await pool.query('SELECT name FROM content_sources WHERE id = $1', [it.source_id]);
      const sourceName = src.rows[0]?.name || null;
      const ins = await pool.query(
        `INSERT INTO monetisation_items
           (raw_item_id, topic, item_type, title, summary, url, source_name, author, published_at, relevance, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'review') RETURNING id`,
        [it.id, r.topic, (r.item_type || 'article').slice(0, 30), (it.title || 'Untitled').slice(0, 500),
         (r.summary || '').slice(0, 1000), it.url, sourceName, it.author, it.published_at,
         Number.isFinite(r.relevance) ? r.relevance : 0.5]
      );
      await pool.query(
        `UPDATE content_raw_items SET triage_status='promoted', triage_result=$1::jsonb, triaged_at=NOW(), promoted_id=$2 WHERE id=$3`,
        [JSON.stringify(r), ins.rows[0].id, it.id]
      );
      promoted++;
    } else {
      await pool.query(
        `UPDATE content_raw_items SET triage_status='rejected', triage_result=$1::jsonb, triaged_at=NOW() WHERE id=$2`,
        [JSON.stringify(r), it.id]
      );
      rejected++;
    }
  }
  return { triaged: items.length, promoted, rejected };
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  const s = String(raw);
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return []; }
}
