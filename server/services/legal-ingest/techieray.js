// techieray.js — harvest TechieRay's Global AI Regulation Tracker into ai_regulations.
//
// The source (https://www.techieray.com/GlobalAIRegulationTracker) is a JS-rendered
// map/list, so we render it headless, then have Claude extract each regulation into
// structured fields. New regulations are upserted into ai_regulations marked
// auto_added + review_status='pending' + source_origin='techieray', so they appear on
// the tracker but land in /admin/tracker for review (same flow as the daily briefing).
// Existing curated regulations are matched and SKIPPED — we never clobber hand-curated
// rows. Everything is recorded on a tracked ai_legal_sources row for provenance.
//
// Runs on the box (needs internet + Chromium). Trigger manually:
//   node server/db/scripts/ingest-techieray.js
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer';
import pool from '../../db/pool.js';
import { callClaude } from '../claude.js';

const URL = 'https://www.techieray.com/GlobalAIRegulationTracker';
const SOURCE_NAME = 'TechieRay Global AI Regulation Tracker';
const REG_STATUS = ['proposed', 'enacted', 'in_force', 'partial_force', 'amended'];
const REG_TYPES = ['regulation', 'statute', 'directive', 'guidance', 'executive_order', 'standard', 'voluntary_code', 'court_ruling'];
const CHUNK = 12000;        // chars per extraction call
const MAX_CHUNKS = 10;      // safety cap on LLM calls per run

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const extId = (name, juris) => 'techieray:' + createHash('sha1').update(norm(name) + '|' + norm(juris)).digest('hex').slice(0, 24);
const clean = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const validDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);

// ── Render the JS page → plain text we can extract from ──────────────────────────
async function renderPageText() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars', '--mute-audio'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Be AI Ready / developai.co.za (bot; puppeteer)');
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    // Scroll to trigger any lazy-loaded rows.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    });
    await new Promise((r) => setTimeout(r, 1500));
    const text = await page.evaluate(() => document.body.innerText || '');
    return text.replace(/\n{3,}/g, '\n\n').trim();
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseJsonArray(text) {
  if (!text) return [];
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : []; } catch { return []; }
}

// ── Claude extraction, chunked so a long global list isn't truncated ─────────────
async function extractRegulations(pageText) {
  const chunks = [];
  for (let i = 0; i < pageText.length && chunks.length < MAX_CHUNKS; i += CHUNK) chunks.push(pageText.slice(i, i + CHUNK));
  const system =
    'You extract AI-regulation records from the text of a global AI-regulation tracker. Output ONLY a JSON array, ' +
    'no prose. One element per distinct law/regulation/bill/standard/treaty you can identify. Each element: ' +
    '{"name": string, "short_name": string|null, "jurisdiction": string (country/region/body), "status": one of ' +
    `${REG_STATUS.join('/')}, "regulation_type": one of ${REG_TYPES.join('/')}, "summary": string (1–2 sentences), ` +
    '"enacted_date": "YYYY-MM-DD"|null, "effective_date": "YYYY-MM-DD"|null, "source_url": string|null}. ' +
    'Only include real, named instruments. If a field is unknown use null. Do not invent dates.';
  const all = [];
  for (let i = 0; i < chunks.length; i++) {
    const raw = await callClaude({ system, userContent: `Tracker text (part ${i + 1}/${chunks.length}):\n\n${chunks[i]}\n\nExtract the regulations as a JSON array.`, maxTokens: 4000, temperature: 0 });
    for (const r of parseJsonArray(raw)) if (r && r.name) all.push(r);
  }
  // Dedup across chunks by normalised name + jurisdiction.
  const seen = new Set(); const out = [];
  for (const r of all) { const k = norm(r.name) + '|' + norm(r.jurisdiction); if (!seen.has(k)) { seen.add(k); out.push(r); } }
  return out;
}

// Does a regulation already exist in the tracker (curated or previously harvested)?
async function alreadyTracked(name, juris) {
  const { rows } = await pool.query(
    `SELECT 1 FROM ai_regulations
      WHERE external_id = $1
         OR lower(regulation_name) = lower($2)
         OR lower(short_name) = lower($2)
         OR regulation_name ILIKE $3
      LIMIT 1`,
    [extId(name, juris), name, `%${name}%`]);
  return rows.length > 0;
}

async function ensureSource() {
  const { rows } = await pool.query('SELECT id FROM ai_legal_sources WHERE url = $1', [URL]);
  if (rows.length) return rows[0].id;
  const { rows: ins } = await pool.query(
    `INSERT INTO ai_legal_sources (name, kind, url, jurisdiction, active, run_frequency_hours, config)
     VALUES ($1,'puppeteer',$2,'Global',true,168,'{}'::jsonb) RETURNING id`, [SOURCE_NAME, URL]);
  return ins[0].id;
}

export async function harvestTechieray() {
  const sourceId = await ensureSource();
  let pageText, considered = 0, added = 0, skipped = 0;
  try {
    pageText = await renderPageText();
    if (!pageText || pageText.length < 200) throw new Error('rendered page had no usable text');
    const regs = await extractRegulations(pageText);
    considered = regs.length;
    for (const d of regs) {
      try {
        if (await alreadyTracked(d.name, d.jurisdiction)) { skipped++; continue; }
        const status = clean(d.status, REG_STATUS, 'enacted');
        const type = clean(d.regulation_type, REG_TYPES, 'regulation');
        const enacted = validDate(d.enacted_date);
        const eventDate = validDate(d.effective_date) || enacted || new Date().toISOString().slice(0, 10);
        const { rows } = await pool.query(
          `INSERT INTO ai_regulations (regulation_name, short_name, jurisdiction, status, regulation_type, summary,
              enacted_date, effective_date, source_url, external_id, auto_added, review_status, source_origin, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'pending','techieray',NOW(),NOW()) RETURNING id`,
          [d.name, d.short_name || null, d.jurisdiction || null, status, type, d.summary || null,
           enacted, validDate(d.effective_date), d.source_url || URL, extId(d.name, d.jurisdiction)]);
        await pool.query(
          `INSERT INTO ai_regulation_events (regulation_id, event_date, event_type, title, description, source_url, source_verified_at)
           VALUES ($1,$2,'harvested',$3,$4,$5,NOW())`,
          [rows[0].id, eventDate, d.name, d.summary || null, d.source_url || URL]).catch(() => {});
        added++;
      } catch (e) { console.error('[techieray] upsert failed for', d.name, e.message); skipped++; }
    }
    await pool.query(
      `UPDATE ai_legal_sources SET last_run_at = NOW(), last_success_at = NOW(), last_error = NULL,
         items_seen = COALESCE(items_seen,0) + $2, items_new = COALESCE(items_new,0) + $3,
         config = config || $4::jsonb, updated_at = NOW() WHERE id = $1`,
      [sourceId, considered, added, JSON.stringify({ last_harvest_at: new Date().toISOString(), last_harvest_count: considered, last_harvest_added: added })]);
    return { considered, added, skipped };
  } catch (err) {
    await pool.query('UPDATE ai_legal_sources SET last_run_at = NOW(), last_error = $2, updated_at = NOW() WHERE id = $1', [sourceId, err.message]).catch(() => {});
    throw err;
  }
}
