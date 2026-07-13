// governance-today.js — the "AI Law" briefing shown atop the tracker AND on the BE AI
// READY home. Source of truth = OUR OWN Law tracker (ai_lawsuits ONLY — regulations now
// have their own briefing, see regulation-today.js), NOT a live web search. Paul's call
// (2026-06-24): the team curates the tracker, so the briefing must come directly from it
// — full oversight, and no web-sourced fabrication. It summarises the most-recently-
// updated tracked lawsuits into a short business-facing read, with the tracked items as
// the cited sources. Cached in app_settings ('governance_today') + governance_today_history;
// regenerated on a schedule or from the admin. Audience is global; money in US dollars.
import pool from '../db/pool.js';
import { callClaude } from './claude.js';
import { getBriefingSettings } from './briefing-settings.js';
import { sourceHeroImage } from './briefing-image.js';
import { recentBriefings, coveredKeys, isCovered, recentlyCoveredBlock } from './briefing-history.js';

const KEY = 'governance_today';

// The most-recently-updated tracked LAWSUITS — the curated corpus the briefing is written
// from. Newest first, capped at `limit`. Excludes unvetted auto-added rows (curated by
// hand, or auto-added then explicitly kept) so the briefing/headlines can never surface a
// web-sourced fabrication that an admin hasn't reviewed — matching the public tracker.
// Auto-publish everything (Paul, 2026-07-08): the briefing draws from ALL tracked
// lawsuits, same as the now-auto-publishing public tracker, so the front page reflects
// the freshest cases.
const VETTED = 'TRUE';
async function recentTrackerItems(limit) {
  const { rows: law } = await pool.query(
    `SELECT case_name AS name, jurisdiction, status, summary, source_url, case_url,
            COALESCE(last_update, updated_at::date) AS dt, 'lawsuit' AS kind
       FROM ai_lawsuits
      WHERE ${VETTED}
      ORDER BY COALESCE(last_update, updated_at::date) DESC NULLS LAST LIMIT $1`, [limit]
  ).catch(() => ({ rows: [] }));
  return law;
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
  const want = settings.ai_law.item_count || 10;
  // Pull a wider pool than we'll feature, so that when nothing has updated recently
  // there are still un-repeated items to lead with instead of the same top case.
  const items = await recentTrackerItems(want + 10);
  if (!items.length) return null;   // nothing tracked yet — honest empty (no invention)

  // Close the repeat loop: order items we HAVEN'T recently briefed first, and tell
  // the model what it already led with so it picks something fresh.
  const history = await recentBriefings('governance_today_history').catch(() => []);
  const covered = coveredKeys(history);
  const fresh = [], stale = [];
  for (const it of items) {
    (isCovered(covered, { url: it.source_url || it.case_url, title: it.name }) ? stale : fresh).push(it);
  }
  const ordered = [...fresh, ...stale].slice(0, want);

  const sourceList = ordered.map((it) => {
    const meta = [it.jurisdiction, it.status].filter(Boolean).join(', ');
    const sum = (it.summary || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `- [${it.kind}] ${it.name}${meta ? ` (${meta})` : ''}${sum ? `: ${sum}` : ''}`;
  }).join('\n');

  const writeSystem =
    'You write a daily "AI Law" briefing for small and medium businesses on the Be AI Ready platform. ' +
    'Audience: non-technical owners and managers at organisations of any size, anywhere in the world — do ' +
    'NOT assume a specific country or region, and do not single out any one nationality of business. Give ' +
    'any monetary amounts in US dollars ($). Tone: plain, calm, concrete — no hype, no jargon. You are given ' +
    'items from OUR OWN curated AI lawsuit tracker. Output ONLY the briefing prose and nothing else: 90–110 ' +
    'words, one or two short paragraphs. Pick the few most significant items and say, in everyday terms, what ' +
    'each practically means for a business using AI. Use ONLY the items provided — do not add, rename, merge ' +
    'or invent any law, case, company, product or model, and do not pull in anything from outside this list. ' +
    'Do NOT restate these instructions, write a preamble or heading, use markdown or bullets, or produce more ' +
    'than one version.';
  const writeUser = `From our AI lawsuit tracker (most recently updated, newest first):\n\n${sourceList}${recentlyCoveredBlock(history)}\n\nWrite the briefing now.`;
  const text = await callClaude({ system: writeSystem, userContent: writeUser, maxTokens: 320, temperature: 0.4 });

  const value = {
    summary: sanitizeSummary(text),
    headlines: buildHeadlines(ordered),
    source: 'tracker',
    generated_at: new Date().toISOString(),
  };
  try { value.hero_image = await sourceHeroImage('law', value.headlines); } catch (e) { console.warn('[governance-today:image]', e.message); }
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
