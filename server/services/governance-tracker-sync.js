// governance-tracker-sync.js — turn the daily briefing's web-search findings into
// tracker entries. Developments that are a lawsuit/court ruling or a regulation/
// government action are extracted into structured records and added to ai_lawsuits
// / ai_regulations, marked auto_added + review_status='pending' so an admin can
// verify and remove them (post-moderation). Strictly source-grounded: an item with
// no source URL is skipped. Deduped by external_id (source_url+name) and by name.
import { createHash } from 'node:crypto';
import pool from '../db/pool.js';
import { callClaude } from './claude.js';

const LAWSUIT_STATUS = ['active', 'appealing', 'settled', 'dismissed', 'decided'];
const REG_STATUS = ['proposed', 'enacted', 'in_force', 'partial_force'];
const extId = (name, url) => 'gt:' + createHash('sha1').update(`${(url || '').trim()}|${(name || '').trim().toLowerCase()}`).digest('hex').slice(0, 24);
const validDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);

function parseJsonArray(text) {
  if (!text) return [];
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Has an entry for this development already (by external_id, source_url, or name)?
async function exists(table, nameCol, extid, sourceUrl, name) {
  const { rows } = await pool.query(
    `SELECT 1 FROM ${table}
      WHERE external_id = $1
         OR ($2 <> '' AND source_url = $2)
         OR ${nameCol} ILIKE $3
      LIMIT 1`,
    [extid, sourceUrl || '', name]);
  return rows.length > 0;
}

async function addLawsuit(d, today) {
  const status = LAWSUIT_STATUS.includes(d.status) ? d.status : 'active';
  const date = validDate(d.date) || today;
  const { rows } = await pool.query(
    `INSERT INTO ai_lawsuits (case_name, jurisdiction, status, summary, source_url, external_id,
        filing_date, last_update, auto_added, review_status, source_origin, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'pending','governance_today',NOW(),NOW()) RETURNING id`,
    [d.name, d.jurisdiction || null, status, d.summary || null, d.source_url, extId(d.name, d.source_url),
     validDate(d.date), date]);
  await pool.query(
    `INSERT INTO ai_lawsuit_events (lawsuit_id, event_date, event_type, title, description, source_url, source_verified_at)
     VALUES ($1,$2,'auto_added',$3,$4,$5,NOW())`,
    [rows[0].id, date, d.name, d.summary || null, d.source_url]).catch(() => {});
  return { kind: 'lawsuit', id: rows[0].id, name: d.name };
}

async function addRegulation(d, today) {
  const status = REG_STATUS.includes(d.status) ? d.status : 'proposed';
  const date = validDate(d.date) || today;
  const enacted = ['enacted', 'in_force', 'partial_force'].includes(status) ? validDate(d.date) : null;
  const { rows } = await pool.query(
    `INSERT INTO ai_regulations (regulation_name, jurisdiction, status, summary, source_url, external_id,
        enacted_date, auto_added, review_status, source_origin, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,'pending','governance_today',NOW(),NOW()) RETURNING id`,
    [d.name, d.jurisdiction || null, status, d.summary || null, d.source_url, extId(d.name, d.source_url), enacted]);
  await pool.query(
    `INSERT INTO ai_regulation_events (regulation_id, event_date, event_type, title, description, source_url, source_verified_at)
     VALUES ($1,$2,'auto_added',$3,$4,$5,NOW())`,
    [rows[0].id, date, d.name, d.summary || null, d.source_url]).catch(() => {});
  return { kind: 'regulation', id: rows[0].id, name: d.name };
}

// Extract structured developments from the briefing's research findings and add the
// legal ones to the tracker. Returns { added: [...], skipped, considered }.
export async function addDevelopmentsToTracker(findings, _citations) {
  if (!findings || !findings.trim()) return { added: [], skipped: 0, considered: 0 };
  const system =
    'You extract structured records from a research brief about recent AI developments. Output ONLY a JSON ' +
    'array, no prose. Each element: {"kind": "lawsuit" | "regulation" | "other", "name": string, ' +
    '"jurisdiction": string, "status": string, "summary": string (1–2 sentences), "source_url": string, ' +
    '"date": "YYYY-MM-DD" | null}. Use "lawsuit" for a court case/ruling/settlement; "regulation" for a law, ' +
    'rule, regulatory/enforcement action, executive order or government directive; "other" for anything else ' +
    `(product news, research, opinion). For lawsuits, status must be one of ${LAWSUIT_STATUS.join('/')}. For ` +
    `regulations, one of ${REG_STATUS.join('/')}. Only include an item if it has a real source URL. Never invent.`;
  const raw = await callClaude({ system, userContent: findings, maxTokens: 1500, temperature: 0 });
  const items = parseJsonArray(raw);

  const today = new Date().toISOString().slice(0, 10);
  const added = [];
  let considered = 0, skipped = 0;
  for (const d of items) {
    if (!d || !d.name || !d.source_url || !/^https?:\/\//i.test(d.source_url)) { skipped++; continue; }
    if (d.kind !== 'lawsuit' && d.kind !== 'regulation') { skipped++; continue; }
    considered++;
    const table = d.kind === 'lawsuit' ? 'ai_lawsuits' : 'ai_regulations';
    const nameCol = d.kind === 'lawsuit' ? 'case_name' : 'regulation_name';
    try {
      if (await exists(table, nameCol, extId(d.name, d.source_url), d.source_url, d.name)) { skipped++; continue; }
      added.push(d.kind === 'lawsuit' ? await addLawsuit(d, today) : await addRegulation(d, today));
    } catch (e) { console.error('[gov-tracker-sync]', d.kind, e.message); skipped++; }
  }
  return { added, skipped, considered };
}
