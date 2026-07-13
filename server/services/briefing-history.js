// briefing-history.js — close the loop on the daily "Today in AI" briefings.
//
// The three generators (ai-news-today / governance-today / regulation-today) each
// WRITE every day's briefing into a *_today_history table but never READ it back,
// so each run pulls the same slowly-changing top slice and re-leads with the same
// story day after day. This helper lets a generator see what it already covered in
// the last few days, so it can lead with something fresh (and, honestly, say when a
// day is genuinely quiet rather than inventing news).
//
// Read-only. Safe to call before every generate; degrades to "no history" on error.
import pool from '../db/pool.js';

// Allow-list — the table name is interpolated into SQL, so it must never come from
// a caller-supplied string. Only these three history tables are permitted.
const HISTORY_TABLES = new Set([
  'ai_news_today_history',
  'governance_today_history',
  'regulation_today_history',
]);

// The briefings from the last `days` days, EXCLUDING today (we want what came
// before, not a same-day re-run of ourselves). Newest first.
export async function recentBriefings(table, days = 6) {
  if (!HISTORY_TABLES.has(table)) throw new Error(`briefing-history: unknown table ${table}`);
  const { rows } = await pool.query(
    `SELECT digest_date, summary, headlines
       FROM ${table}
      WHERE digest_date >= (CURRENT_DATE - ($1 || ' days')::interval)::date
        AND digest_date < CURRENT_DATE
      ORDER BY digest_date DESC`, [String(days)]
  ).catch(() => ({ rows: [] }));
  return rows;
}

function headlinesOf(row) {
  let hs = row?.headlines;
  if (typeof hs === 'string') { try { hs = JSON.parse(hs); } catch { hs = []; } }
  return Array.isArray(hs) ? hs : [];
}

// The set of already-covered source keys (each headline's url AND its lowercased
// title) so a generator can tell whether a candidate item is a repeat.
export function coveredKeys(rows) {
  const set = new Set();
  for (const r of rows || []) {
    for (const h of headlinesOf(r)) {
      if (h?.url) set.add(String(h.url).trim());
      if (h?.title) set.add(String(h.title).trim().toLowerCase());
    }
  }
  return set;
}

// The distinct headline titles covered recently — an avoid-list for a web search.
export function coveredTitles(rows, limit = 12) {
  const out = [];
  const seen = new Set();
  for (const r of rows || []) {
    for (const h of headlinesOf(r)) {
      const t = h?.title && String(h.title).trim();
      if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
    }
  }
  return out.slice(0, limit);
}

// True if this candidate (by url and/or title) was covered in recent history.
export function isCovered(set, { url, title } = {}) {
  if (url && set.has(String(url).trim())) return true;
  if (title && set.has(String(title).trim().toLowerCase())) return true;
  return false;
}

// A compact prompt block naming what was covered recently, instructing the model to
// lead with something different. Empty string when there's no history to avoid.
export function recentlyCoveredBlock(rows) {
  const lines = [];
  for (const r of rows || []) {
    const titles = headlinesOf(r).map((h) => h?.title).filter(Boolean).slice(0, 4);
    if (titles.length) lines.push(`- ${String(r.digest_date).slice(0, 10)}: ${titles.join('; ')}`);
  }
  if (!lines.length) return '';
  return '\n\nAlready covered in the last few days — do NOT lead with these again. Choose different, ' +
    'fresher items from the source list; only return to one of these if there is a genuinely new ' +
    'development on it. If everything material has already been covered, say plainly that there is ' +
    'little new today and note the state of play — never invent a development to seem fresh.\n' +
    lines.join('\n');
}
