// beaiready-training.js — BE AI READY Training & Strategy data.
// Mounted at /api/beaiready/training behind requireAuth. Writes are admin-only
// (requireRole('admin')); reads are role-aware — an admin (with X-Newsroom-Id)
// sees everything for the selected client, a business member sees only their own
// tenant's PUBLISHED agendas / materials / FINAL outcomes.
//
// RAG: when a material (or a FINAL outcome) is saved with rag_shareable, its body
// is ingested into the shared, sector-scoped knowledge base via createKnowledgeEntry
// so future same-sector client work learns from it. rag_synced/knowledge_id track it.
import { Router } from 'express';
import fs from 'node:fs';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { resolveNewsroomId } from '../lib/tenancy.js';
import { createKnowledgeEntry, getRelevantKnowledge } from '../services/knowledge.js';
import { syncOneForm, syncFormsForTenant, toCsvUrl } from '../services/forms-sync.js';
import { upload } from '../middleware/upload.js';
import { scrapeArticle } from '../services/web-scraper.js';
import { extractText } from '../services/document-processor.js';
import { encryptFor, decryptFor } from '../services/crypto.js';
import { callClaude } from '../services/claude.js';
import { indexSource } from '../services/company-knowledge-index.js';

const router = Router();

// Pull a Google Doc's current text. "Publish to web" or "anyone with the link"
// docs export plain text at /document/d/<ID>/export?format=txt. Returns the text,
// or throws an actionable error if the link isn't a shareable Google Doc.
async function fetchGoogleDocText(rawUrl) {
  const m = (rawUrl || '').match(/\/document\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error('that doesn\'t look like a Google Doc link (…/document/d/…)');
  const res = await fetch(`https://docs.google.com/document/d/${m[1]}/export?format=txt`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`couldn't read that doc (HTTP ${res.status}) — share it "anyone with the link can view"`);
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html') || /^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('that link returned a sign-in page — set the doc to "anyone with the link can view"');
  }
  return text.trim();
}

async function tenantContext(req) {
  const newsroomId = await resolveNewsroomId(req);
  const { rows } = await pool.query(
    `SELECT n.organisation_id, o.sector_id FROM newsrooms n
       LEFT JOIN organisations o ON o.id = n.organisation_id WHERE n.id = $1`, [newsroomId]);
  return { newsroomId, organisationId: rows[0]?.organisation_id || null, sectorId: rows[0]?.sector_id || null };
}
const isAdmin = (req) => req.user?.role === 'admin';

// Ingest (or re-ingest) a training/strategy row into the shared knowledge base so
// FUTURE engagements — this client AND other companies of similar size/activity —
// can learn from it. Stored SECTOR-scoped (organisation_id NULL) so it informs the
// whole sector, matching the "sector-scoped" promise in the UI. Deletes any prior
// entry first so an edit doesn't duplicate. Works for any row carrying
// knowledge_id + rag_synced columns (materials, outcomes, strategy items).
const RAG_SOURCE_DESC = {
  training_outcome: 'BE AI READY training outcome',
  training_material: 'BE AI READY training material',
  training_strategy: 'BE AI READY AI-strategy item (what a similar business is doing with AI)',
};
async function syncToRag({ table, row, tenant, category, shouldIngest }) {
  if (row.knowledge_id) {
    await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [row.knowledge_id]).catch(() => {});
  }
  if (!shouldIngest) {
    await pool.query(`UPDATE ${table} SET knowledge_id = NULL, rag_synced = false WHERE id = $1`, [row.id]);
    row.knowledge_id = null; row.rag_synced = false;   // keep the returned object in sync
    return;
  }
  const knowledgeId = await createKnowledgeEntry({
    category, subcategory: row.kind || null,
    title: row.title, content: row.content || row.detail || row.title,
    // PRIVATE to this client's organisation. Raw client content never crosses the
    // tenant boundary — cross-business value comes only via anonymised patterns.
    sectorId: tenant.sectorId, organisationId: tenant.organisationId, visibility: 'private',
    sourceType: 'beaiready_training', sourceId: row.id,
    sourceDescription: RAG_SOURCE_DESC[category] || 'BE AI READY',
    confidence: 0.6,
  });
  await pool.query(`UPDATE ${table} SET knowledge_id = $1, rag_synced = true WHERE id = $2`, [knowledgeId, row.id]);
  row.knowledge_id = knowledgeId; row.rag_synced = true;   // reflect post-sync state in the response
}

// Harvest: pull the text out of an uploaded training file (agenda PDF, report,
// material handout) and store it on the row so the system can REASON over it —
// it can't just sit on disk as an opaque PDF. Best-effort: a stubborn or
// unsupported file is marked 'failed' but never breaks the upload. Returns the
// extracted text (or null) so callers can chain a RAG re-sync.
async function harvestFileText(docId) {
  try {
    const { rows: [doc] } = await pool.query('SELECT file_path, mime_type FROM uploaded_documents WHERE id = $1', [docId]);
    if (!doc || !doc.file_path) return null;
    await pool.query("UPDATE uploaded_documents SET extraction_status = 'extracting' WHERE id = $1", [docId]);
    const text = await extractText(doc.file_path, doc.mime_type);
    await pool.query(
      "UPDATE uploaded_documents SET extracted_text = $1, extraction_status = 'extracted', updated_at = NOW() WHERE id = $2",
      [text || '', docId]);
    return text || '';
  } catch (e) {
    console.error('[bair-train/harvest]', docId, e.message);
    await pool.query(
      "UPDATE uploaded_documents SET extraction_status = 'failed', extraction_error = $1 WHERE id = $2",
      [e.message, docId]).catch(() => {});
    return null;
  }
}

// Ingest a material into the SECTOR knowledge base using its typed content AND the
// harvested text of its attached files — so what was actually taught (the slides /
// handouts), not just the summary, informs future same-sector engagements. Replaces
// the plain syncToRag call for materials.
async function syncMaterialToRag(materialId, tenant) {
  const { rows: [m] } = await pool.query('SELECT * FROM training_materials WHERE id = $1', [materialId]);
  if (!m) return;
  const { rows: files } = await pool.query(
    `SELECT original_name, extracted_text FROM uploaded_documents
       WHERE entity_type = 'training_material_file' AND entity_id = $1
         AND extracted_text IS NOT NULL AND length(extracted_text) > 0
       ORDER BY created_at`, [materialId]);
  const fileText = files.map((f) => `— ${f.original_name}:\n${f.extracted_text}`).join('\n\n');
  const combined = [m.content, fileText].filter(Boolean).join('\n\n').slice(0, 24000);
  await syncToRag({
    table: 'training_materials', row: { ...m, content: combined }, tenant,
    category: 'training_material', shouldIngest: m.rag_shareable && !!combined,
  });
}

// ── Intake (Google form) — reuse intake_forms/responses + the hourly sync ───────
router.post('/intake-forms', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, form_name, csv_url, agenda_id } = req.body || {};
    if (!newsroom_id || !form_name || !csv_url) return res.status(400).json({ message: 'newsroom_id, form_name, csv_url required' });
    // Store the link as-is (toCsvUrl normalises at fetch time, keeping the original visible).
    // agenda_id (optional) ties this "before" survey to one training.
    const { rows } = await pool.query(
      `INSERT INTO intake_forms (newsroom_id, form_name, csv_url, agenda_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [newsroom_id, form_name, csv_url, agenda_id || null]);
    // Pull responses immediately so "0 responses" never lingers when the sheet is fine.
    let sync = null;
    try { sync = await syncOneForm(rows[0].id); }
    catch (e) { sync = { form: form_name, total: 0, inserted: 0, error: e.message }; }
    res.status(201).json({ ...rows[0], sync });
  } catch (err) { console.error('[bair-train/intake-forms:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/intake-forms/:id', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const { form_name, csv_url, is_enabled, agenda_id } = b;
    // agenda_id is presence-aware: sending it (incl. "" → null) links or unlinks the
    // form from a training; omitting it leaves the link untouched. Used for both the
    // "before" (intake) and "after" (feedback) surveys.
    const hasAgenda = Object.prototype.hasOwnProperty.call(b, 'agenda_id');
    const { rows } = await pool.query(
      `UPDATE intake_forms SET form_name = COALESCE($1, form_name), csv_url = COALESCE($2, csv_url),
         is_enabled = COALESCE($3, is_enabled),
         agenda_id = CASE WHEN $4 THEN $5 ELSE agenda_id END WHERE id = $6 RETURNING *`,
      [form_name || null, csv_url || null, typeof is_enabled === 'boolean' ? is_enabled : null,
       hasAgenda, agenda_id || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Form not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[bair-train/intake-forms:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Pull fresh responses now for the SELECTED client only, returning per-form
// results (incl. failures) so the admin sees exactly what happened.
router.post('/intake-forms/sync', requireRole('admin'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const results = await syncFormsForTenant(newsroomId, 'intake');
    res.json({ ok: true, results });
  }
  catch (err) { console.error('[bair-train/intake-sync]', err); res.status(500).json({ message: 'Sync failed' }); }
});

// The actual form answers for a tenant ("what they want"). Admin → X-Newsroom-Id; member → own.
router.get('/intake-responses', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT id, form_name, response, submitted_at, imported_at FROM intake_responses
        WHERE newsroom_id = $1 AND form_type = 'intake' ORDER BY submitted_at DESC NULLS LAST, imported_at DESC LIMIT 500`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/intake-responses]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Training feedback (Google form) — the SAME pipeline as Intake, form_type='feedback'.
// Attendees fill in a post-training feedback form; the admin connects its response
// Sheet, we sync it hourly and show the responses. Kept separate from Intake so the
// pre-training survey and the post-training feedback never mix.
router.get('/feedback-forms', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT f.id, f.form_name, f.agenda_id, f.last_synced_at,
              (SELECT COUNT(*)::int FROM intake_responses r
                WHERE r.newsroom_id = f.newsroom_id AND r.form_name = f.form_name AND r.form_type = 'feedback') AS response_count
         FROM intake_forms f WHERE f.newsroom_id = $1 AND f.form_type = 'feedback' AND f.is_enabled = true
        ORDER BY f.form_name`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/feedback-forms:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/feedback-forms', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, form_name, csv_url, agenda_id } = req.body || {};
    if (!newsroom_id || !form_name || !csv_url) return res.status(400).json({ message: 'newsroom_id, form_name, csv_url required' });
    const { rows } = await pool.query(
      `INSERT INTO intake_forms (newsroom_id, form_name, csv_url, form_type, agenda_id) VALUES ($1,$2,$3,'feedback',$4) RETURNING *`,
      [newsroom_id, form_name, csv_url, agenda_id || null]);
    // Pull responses immediately so "0 responses" never lingers when the sheet is fine.
    let sync = null;
    try { sync = await syncOneForm(rows[0].id); }
    catch (e) { sync = { form: form_name, total: 0, inserted: 0, error: e.message }; }
    res.status(201).json({ ...rows[0], sync });
  } catch (err) { console.error('[bair-train/feedback-forms:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/feedback-forms/sync', requireRole('admin'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const results = await syncFormsForTenant(newsroomId, 'feedback');
    res.json({ ok: true, results });
  }
  catch (err) { console.error('[bair-train/feedback-sync]', err); res.status(500).json({ message: 'Sync failed' }); }
});

router.get('/feedback-responses', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT id, form_name, response, submitted_at, imported_at FROM intake_responses
        WHERE newsroom_id = $1 AND form_type = 'feedback' ORDER BY submitted_at DESC NULLS LAST, imported_at DESC LIMIT 500`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/feedback-responses]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Forms + participants, grouped by training ────────────────────────────────────
// Every connected form (the "before" intake survey and the "after" feedback survey),
// with which training (agenda_id) it belongs to. The admin uses this to link a form
// to a training so its responses/participants group under that session — and so one
// training's feedback never bleeds into another (a training with no linked form shows
// none). Returns id, form_type, agenda_id + a response count.
router.get('/forms', requireRole('admin'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT f.id, f.form_name, f.form_type, f.agenda_id, f.last_synced_at,
              (SELECT COUNT(*)::int FROM intake_responses r
                 WHERE r.newsroom_id = f.newsroom_id AND r.form_name = f.form_name AND r.form_type = f.form_type) AS response_count
         FROM intake_forms f WHERE f.newsroom_id = $1 AND f.is_enabled = true
        ORDER BY f.form_type, f.form_name`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/forms:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// The name column of a survey response ("Name", "What is your name?", "Full name"…);
// falls back to email so a nameless row still counts as one distinct person.
const NAME_KEY = /(^|[^a-z])name([^a-z]|$)/i;
function participantName(resp) {
  const keys = Object.keys(resp || {});
  const nameKey = keys.find((k) => NAME_KEY.test(k) && !/form/i.test(k));
  let name = nameKey ? String(resp[nameKey] ?? '').trim() : '';
  if (!name) { const ek = keys.find((k) => /email/i.test(k)); name = ek ? String(resp[ek] ?? '').trim() : ''; }
  return name;
}

// Merge the participant rows of one training into distinct people, reconciling the
// common case where a person wrote their full name on one form and just their first
// name on the other ("Antonette Claassens" before, "Antonette" after). Rule: a bare
// first name collapses into a full name ONLY when exactly one full name shares that
// first name (unambiguous). We never merge on surname alone — that would wrongly fuse
// two different people who share a last name (e.g. Devika Suresh vs Shanelle Suresh).
// raw = [{ name, formType }]. Returns [{ name, before, after }] sorted by name.
const normName = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
function mergeParticipants(raw) {
  // Per first name, the distinct full (multi-word) names seen.
  const fullsByFirst = new Map();
  for (const { name } of raw) {
    const n = normName(name), toks = n.split(' ');
    if (toks.length < 2) continue;
    if (!fullsByFirst.has(toks[0])) fullsByFirst.set(toks[0], new Set());
    fullsByFirst.get(toks[0]).add(n);
  }
  const canonical = (name) => {
    const n = normName(name), toks = n.split(' ');
    if (toks.length >= 2) return n;                 // a full name is its own identity
    const fulls = fullsByFirst.get(toks[0]);        // a bare first name…
    return (fulls && fulls.size === 1) ? [...fulls][0] : toks[0]; // …collapses only if unambiguous
  };
  const byId = new Map();
  for (const { name, formType } of raw) {
    const id = canonical(name);
    const e = byId.get(id) || { display: name, before: false, after: false };
    if (name.length > e.display.length) e.display = name;   // prefer the fuller spelling
    if (formType === 'feedback') e.after = true; else e.before = true;
    byId.set(id, e);
  }
  return [...byId.values()]
    .map((e) => ({ name: e.display, before: e.before, after: e.after }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Participants per training — the people on each training, derived from the forms
// linked to it: who filled the "before" survey and who filled the "after" survey.
// Keyed by agenda_id (only trainings with a linked form appear). Scoped to the
// caller's tenant, so a member sees only their own team's names.
router.get('/participants', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: forms } = await pool.query(
      `SELECT form_name, form_type, agenda_id FROM intake_forms
        WHERE newsroom_id = $1 AND agenda_id IS NOT NULL AND is_enabled = true`, [newsroomId]);
    const rawByTraining = {};   // agenda_id -> [{ name, formType }]
    for (const f of forms) {
      const { rows } = await pool.query(
        `SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_name = $2 AND form_type = $3`,
        [newsroomId, f.form_name, f.form_type]);
      const arr = rawByTraining[f.agenda_id] || (rawByTraining[f.agenda_id] = []);
      for (const r of rows) {
        const name = participantName(r.response);
        if (name) arr.push({ name, formType: f.form_type });
      }
    }
    const out = {};
    for (const [aid, raw] of Object.entries(rawByTraining)) out[aid] = mergeParticipants(raw);
    res.json(out);
  } catch (err) { console.error('[bair-train/participants]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Form insights (member-safe AGGREGATES only) ──────────────────────────────────
// Summary a client sees on their own /training page WITHOUT exposing any individual
// response: per form — the response count, the average of the detected 0–10 rating
// column, and the top values of the "list-like" (multi-select) columns. Individual
// rows never leave the server, so this is safe for the tenant's own members to read.
// Identity/PII columns that are never a stat. Kept minimal for rating detection —
// which already requires all-integer values, so free-text prose is excluded anyway.
const SKIP_ID = /name|email|timestamp|^when$|^age$|address|phone|location/i;
// Free-text prose columns: they can contain commas (so they'd pass the multi-select
// test) but tallying sentence fragments is noise — exclude from BREAKDOWNS only.
const SKIP_PROSE = /elaborate|describe|feelings|change|negative or positive|briefly|what type|important/i;
// Turn a survey question header into a short, human label. Feedback questions are
// long sentences ("How would you rate the overall quality of the training session?")
// and Likert rows carry the real item in brackets ("…content: [My questions were
// covered]"); pull that out and strip the boilerplate rather than truncate mid-word.
function cleanLabel(q) {
  const bracket = String(q).match(/\[([^\]]+)\]/);
  if (bracket) return bracket[1].trim();
  let s = String(q).replace(/\?+\s*$/, '').trim();
  s = s.replace(/^how would you rate (the )?/i, '')
    .replace(/^please rate[^:]*:\s*/i, '')
    .replace(/^which /i, '').replace(/^what /i, '')
    .replace(/ of the training( session)?$/i, '')
    .replace(/ in explaining the content$/i, '')
    .replace(/ regarding the (session )?content$/i, '')
    .replace(/ did you find/i, '').replace(/ with regards to the training$/i, '')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(q);
}

const AGREEMENT = { 'strongly agree': 2, agree: 1, neutral: 0, disagree: -1, 'strongly disagree': -2 };
function aggregateResponses(rows) {
  const responses = rows.map((r) => r.response || {});
  const n = responses.length;
  const cols = [];
  for (const r of responses) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const vals = (k) => responses.map((r) => (r[k] ?? '').toString().trim()).filter(Boolean);

  const ratings = [];      // every 0–10 numeric column (a feedback form has several)
  const agreement = [];    // Likert columns (Strongly Agree … Disagree)
  const breakdowns = [];   // multi-select columns (comma-separated)

  for (const k of cols) {
    if (SKIP_ID.test(k)) continue;
    const vs = vals(k);
    if (vs.length < Math.max(3, n * 0.4)) continue;

    // 0–10 rating scale.
    if (vs.every((v) => /^\d{1,2}$/.test(v) && +v <= 10)) {
      ratings.push({ label: cleanLabel(k), avg: Math.round((vs.reduce((s, v) => s + +v, 0) / vs.length) * 10) / 10, count: vs.length });
      continue;
    }
    // Likert agreement — most values are agreement words.
    const agr = vs.filter((v) => AGREEMENT[v.toLowerCase()] !== undefined);
    if (agr.length >= vs.length * 0.6) {
      const pos = agr.filter((v) => AGREEMENT[v.toLowerCase()] > 0).length;
      const neu = agr.filter((v) => AGREEMENT[v.toLowerCase()] === 0).length;
      agreement.push({ label: cleanLabel(k), positive_pct: Math.round((pos / agr.length) * 100), agree: pos, neutral: neu, disagree: agr.length - pos - neu, count: agr.length });
      continue;
    }
    // Multi-select — a fair share of values contain a comma.
    if (SKIP_PROSE.test(k)) continue;
    if (vs.filter((v) => v.includes(',')).length / vs.length < 0.3) continue;
    const tally = new Map();
    for (const v of vs) for (const tok of v.split(',').map((t) => t.trim()).filter(Boolean)) {
      const key = tok.slice(0, 40);
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));
    if (top.length) breakdowns.push({ question: cleanLabel(k), top });
  }
  // Prefer a "rating"-worded scale as the headline (backward-compat with the cockpit).
  const primary = ratings.find((r) => /quality|overall|rating|familiar/i.test(r.label)) || ratings[0] || null;
  return { responses: n, rating: primary, ratings, agreement, breakdowns: breakdowns.slice(0, 3) };
}

router.get('/form-insights', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: forms } = await pool.query(
      `SELECT form_name, form_type, agenda_id, last_synced_at FROM intake_forms
        WHERE newsroom_id = $1 AND is_enabled = true ORDER BY form_type, form_name`, [newsroomId]);
    const out = [];
    for (const f of forms) {
      const { rows } = await pool.query(
        `SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_name = $2 AND form_type = $3`,
        [newsroomId, f.form_name, f.form_type]);
      if (!rows.length) continue;
      // agenda_id lets the client place each survey under its training — and keeps one
      // training's feedback from ever showing under another (no cross-training fallback).
      out.push({ form_name: f.form_name, form_type: f.form_type, agenda_id: f.agenda_id, last_synced_at: f.last_synced_at, ...aggregateResponses(rows) });
    }
    // The client sees a POSITIVE cut of their feedback (this is the consultant's work
    // and it went well): only ratings ≥8/10 and agreement ≥80%, and the multi-select
    // drops single-mention noise. The admin (isAdmin) sees everything, honestly.
    if (!isAdmin(req)) {
      const POS_PCT = 80, POS_RATING = 8;
      for (const f of out) {
        if (Array.isArray(f.ratings)) f.ratings = f.ratings.filter((r) => r.avg >= POS_RATING);
        if (Array.isArray(f.agreement)) f.agreement = f.agreement.filter((a) => a.positive_pct >= POS_PCT);
        if (Array.isArray(f.breakdowns)) {
          f.breakdowns = f.breakdowns.map((b) => ({ ...b, top: b.top.filter((t) => t.count >= 2) })).filter((b) => b.top.length);
        }
      }
    }
    res.json(out);
  } catch (err) { console.error('[bair-train/form-insights]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Post-training feedback: free-text comments → aggregate AI themes (cached) ──────
// The numeric/Likert/multi-select columns are handled by aggregateResponses. The
// OPEN-TEXT answers ("what would you change?", "any other comments?") are the most
// valuable and were previously dropped. Here we group them into aggregate themes
// with counts — never verbatim, never names — reusing the team-analysis cache
// (kind='feedback_comments'), so Claude runs only when the responses change.
const COMMENTS_VERSION = 'v1';

// Detect the free-text/prose columns: not a rating, not Likert, not a short
// multi-select token — reasonably sentence-like, OR a header that reads like prose.
function commentColumns(responses) {
  const cols = [];
  for (const r of responses) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const out = [];
  for (const k of cols) {
    if (SKIP_ID.test(k)) continue;
    const vs = responses.map((r) => (r[k] ?? '').toString().trim()).filter(Boolean);
    if (vs.length < 3) continue;
    const numericish = vs.filter((v) => /^\d{1,2}$/.test(v)).length / vs.length;
    const agreementish = vs.filter((v) => AGREEMENT[v.toLowerCase()] !== undefined).length / vs.length;
    const avgLen = vs.reduce((s, v) => s + v.length, 0) / vs.length;
    const isProse = SKIP_PROSE.test(k) || (numericish < 0.2 && agreementish < 0.3 && avgLen >= 25);
    if (isProse) out.push({ question: cleanLabel(k), values: vs });
  }
  return out;
}

async function generateCommentsSummary(cols, n) {
  const body = cols.map((c) =>
    `## ${c.question}\n` + c.values.map((v) => `- ${v.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
  ).join('\n\n').slice(0, 14000);
  const system =
    'You are analysing ANONYMOUS free-text answers from a post-training feedback survey for ONE business. ' +
    'Produce an AGGREGATE summary only — NEVER quote a person verbatim, NEVER include names or identifying detail, ' +
    'NEVER invent. Group similar answers into a few clear themes, each with how many of the ' + n + ' respondents ' +
    'fit it. Output ONLY JSON (no markdown): {"narrative": string (2-4 plain sentences on overall sentiment and ' +
    'what stood out), "praise": [{"label": string, "count": number}], "improvements": [{"label": string, "count": ' +
    'number}]}. praise = what people valued; improvements = what they suggested changing. 3-6 items per list, ' +
    'ordered by count desc. If there is nothing for a list, return it empty.';
  const userContent = `The anonymous free-text answers:\n\n${body}\n\nReturn the JSON now.`;
  const raw = await callClaude({ system, userContent, maxTokens: 1200, temperature: 0.3 });
  const j = parseJsonObject(raw);
  const list = (x) => (Array.isArray(x) ? x.filter((i) => i && i.label).map((i) => ({ label: String(i.label).slice(0, 90), count: Number(i.count) || 0 })).slice(0, 6) : []);
  return {
    narrative: typeof j.narrative === 'string' ? j.narrative.slice(0, 900) : null,
    praise: list(j.praise),
    improvements: list(j.improvements),
  };
}

router.get('/feedback-comments', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: responses } = await pool.query(
      `SELECT response, imported_at FROM intake_responses
        WHERE newsroom_id = $1 AND form_type = 'feedback' ORDER BY imported_at DESC`, [newsroomId]);
    if (!responses.length) return res.json(null);   // no feedback form connected yet
    const objs = responses.map((r) => r.response || {});
    const cols = commentColumns(objs);
    if (!cols.length) return res.json({ responses: responses.length, has_comments: false, narrative: null, praise: [], improvements: [] });

    const maxImported = responses[0].imported_at ? new Date(responses[0].imported_at).getTime() : 0;
    const fingerprint = `${COMMENTS_VERSION}:${responses.length}:${maxImported}`;
    const { rows: [cached] } = await pool.query(
      `SELECT analysis FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = 'feedback_comments' AND fingerprint = $2`,
      [newsroomId, fingerprint]);
    let ai = cached?.analysis;
    if (!ai) {
      ai = await generateCommentsSummary(cols, responses.length).catch((e) => { console.error('[feedback-comments gen]', e.message); return null; });
      if (ai) await pool.query(
        `INSERT INTO beaiready_team_analysis (newsroom_id, kind, fingerprint, analysis, generated_at)
         VALUES ($1,'feedback_comments',$2,$3::jsonb,NOW())
         ON CONFLICT (newsroom_id, kind) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, analysis = EXCLUDED.analysis, generated_at = NOW()`,
        [newsroomId, fingerprint, JSON.stringify(ai)]);
    }
    if (!ai) return res.json({ responses: responses.length, has_comments: true, unavailable: true, narrative: null, praise: [], improvements: [] });
    res.json({ responses: responses.length, has_comments: true, narrative: ai.narrative || null, praise: ai.praise || [], improvements: ai.improvements || [] });
  } catch (err) { console.error('[bair-train/feedback-comments]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Team AI-readiness analysis (aggregate, AI-themed, cached) ─────────────────────
// A deeper read of the intake survey for the client's dashboard: a familiarity
// distribution + top tools (deterministic), plus AI-grouped role/learning/automation
// themes and a short readiness narrative (Claude). AGGREGATE only — no names ever
// reach the model or the response. Cached per tenant; regenerated only when the
// survey changes (fingerprint). Bump TEAM_ANALYSIS_VERSION to invalidate all caches.
const TEAM_ANALYSIS_VERSION = 'v1';

function familiarityDistribution(objs, cols) {
  const col = cols.find((k) => /familiar/i.test(k) && objs.some((o) => /^\d{1,2}$/.test(String(o[k] ?? '').trim())));
  if (!col) return null;
  const nums = objs.map((o) => +String(o[col] ?? '').trim()).filter((x) => !isNaN(x) && x >= 0 && x <= 10);
  if (!nums.length) return null;
  const b = { beginner: 0, intermediate: 0, advanced: 0 };
  for (const x of nums) { if (x <= 3) b.beginner++; else if (x <= 6) b.intermediate++; else b.advanced++; }
  return { avg: Math.round((nums.reduce((s, x) => s + x, 0) / nums.length) * 10) / 10, counted: nums.length, ...b };
}

function topTools(objs, cols) {
  const col = cols.find((k) => /tool/i.test(k));
  if (!col) return [];
  const tally = new Map();
  for (const o of objs) {
    const v = String(o[col] ?? '').trim(); if (!v) continue;
    for (const t of v.split(',').map((s) => s.trim()).filter(Boolean)) { const k = t.slice(0, 40); tally.set(k, (tally.get(k) || 0) + 1); }
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
}

function parseJsonObject(raw) {
  if (!raw) return {};
  let s = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return {}; }
}

async function generateTeamAnalysis(objs) {
  const n = objs.length;
  const skip = /name|email|timestamp/i;   // never send identifying columns to the model
  const rows = objs.map((o, i) =>
    `#${i + 1}: ${Object.entries(o).filter(([k]) => !skip.test(k)).map(([k, v]) => `${k}: ${v}`).join(' | ')}`
  ).join('\n').slice(0, 12000);
  const system =
    'You are an AI-readiness analyst for the Be AI Ready platform. You are given ANONYMISED staff survey ' +
    'responses from ONE business (names removed). Produce an AGGREGATE team analysis — NEVER refer to or invent ' +
    'individuals. Group similar free-text answers into a few clear themes, each with a count of how many of the ' +
    `${n} respondents fit it. Output ONLY JSON (no prose, no markdown), shape: {"narrative": string (2-4 plain, ` +
    'specific sentences on where this team stands and what they most need — no filler, no clichés), ' +
    '"role_groups": [{"label": string, "count": number}], "learning_priorities": [{"label": string, "count": number}], ' +
    '"automation_opportunities": [{"label": string, "count": number}]}. 3-6 items per list, ordered by count desc.';
  const userContent = `The ${n} anonymised responses:\n\n${rows}\n\nReturn the JSON analysis now.`;
  const raw = await callClaude({ system, userContent, maxTokens: 1500, temperature: 0.3 });
  const j = parseJsonObject(raw);
  const list = (x) => (Array.isArray(x) ? x.filter((i) => i && i.label).map((i) => ({ label: String(i.label).slice(0, 80), count: Number(i.count) || 0 })).slice(0, 6) : []);
  return {
    narrative: typeof j.narrative === 'string' ? j.narrative.slice(0, 900) : null,
    role_groups: list(j.role_groups),
    learning_priorities: list(j.learning_priorities),
    automation_opportunities: list(j.automation_opportunities),
  };
}

router.get('/team-analysis', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: responses } = await pool.query(
      `SELECT response, imported_at FROM intake_responses
        WHERE newsroom_id = $1 AND form_type = 'intake' ORDER BY imported_at DESC`, [newsroomId]);
    if (!responses.length) return res.json(null);
    const objs = responses.map((r) => r.response || {});
    const cols = []; for (const o of objs) for (const k of Object.keys(o)) if (!cols.includes(k)) cols.push(k);

    const maxImported = responses[0].imported_at ? new Date(responses[0].imported_at).getTime() : 0;
    const fingerprint = `${TEAM_ANALYSIS_VERSION}:${responses.length}:${maxImported}`;

    // AI parts are cached by fingerprint; deterministic parts are cheap and always fresh.
    const { rows: [cached] } = await pool.query(
      `SELECT analysis FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = 'intake' AND fingerprint = $2`,
      [newsroomId, fingerprint]);
    let ai = cached?.analysis;
    if (!ai) {
      ai = await generateTeamAnalysis(objs).catch((e) => { console.error('[team-analysis gen]', e.message); return {}; });
      await pool.query(
        `INSERT INTO beaiready_team_analysis (newsroom_id, kind, fingerprint, analysis, generated_at)
         VALUES ($1,'intake',$2,$3::jsonb,NOW())
         ON CONFLICT (newsroom_id, kind) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, analysis = EXCLUDED.analysis, generated_at = NOW()`,
        [newsroomId, fingerprint, JSON.stringify(ai)]);
    }
    res.json({
      team_size: responses.length,
      familiarity: familiarityDistribution(objs, cols),
      tools: topTools(objs, cols),
      narrative: ai.narrative || null,
      role_groups: Array.isArray(ai.role_groups) ? ai.role_groups : [],
      learning_priorities: Array.isArray(ai.learning_priorities) ? ai.learning_priorities : [],
      automation_opportunities: Array.isArray(ai.automation_opportunities) ? ai.automation_opportunities : [],
    });
  } catch (err) { console.error('[bair-train/team-analysis]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── "What your training covered" — AI curriculum from the harvested slide decks ───
// Reads the extracted text of the client's training material PDFs (the session
// decks) and turns each into a short title + key-topic bullets, so the dashboard
// shows what was actually taught — not just a list of PDFs. Cached in the same
// table under kind='curriculum'. Needs the decks harvested first (Harvest now).
const CURRICULUM_VERSION = 'v2';   // bumped: training reports now feed the summary too

// The documents the "what was covered" summary reads: the session slide-decks AND the
// post-training reports (the write-up of what actually happened + recommendations),
// so the client's summary reflects the report, not just the decks. Tenant-scoped.
const CURRICULUM_DOCS_SQL = `
  SELECT ud.id, ud.original_name AS name, ud.extracted_text AS text, 0 AS ord
    FROM uploaded_documents ud
   WHERE ud.entity_type = 'training_material_file'
     AND ud.entity_id IN (SELECT id FROM training_materials WHERE newsroom_id = $1)
     AND ud.extracted_text IS NOT NULL AND length(ud.extracted_text) > 60
  UNION ALL
  SELECT ud.id, ud.original_name AS name, ud.extracted_text AS text, 1 AS ord
    FROM uploaded_documents ud
   WHERE ud.entity_type = 'training_report_file'
     AND ud.entity_id IN (SELECT id FROM training_agendas WHERE newsroom_id = $1)
     AND ud.extracted_text IS NOT NULL AND length(ud.extracted_text) > 60
  ORDER BY ord, name`;

async function generateCurriculum(docs) {
  const body = docs.map((d) => `=== ${d.name} ===\n${(d.text || '').slice(0, 4500)}`).join('\n\n').slice(0, 42000);
  const system =
    'You are summarising the slide decks from a COMPLETED AI training programme for a business, so its staff can ' +
    'revisit what was covered. For EACH deck, produce a short session title and 3-5 concise bullet points of the ' +
    'key topics and practical takeaways ACTUALLY taught — ground every point in the slide text, invent nothing. ' +
    'Output ONLY JSON (no markdown): {"sessions":[{"title": string, "points": [string, ...]}]}, in the given order.';
  const userContent = `The training decks:\n\n${body}\n\nReturn the JSON now.`;
  const raw = await callClaude({ system, userContent, maxTokens: 2200, temperature: 0.2 });
  const j = parseJsonObject(raw);
  return (Array.isArray(j.sessions) ? j.sessions : [])
    .filter((s) => s && s.title)
    .map((s) => ({
      title: String(s.title).slice(0, 120),
      points: (Array.isArray(s.points) ? s.points : []).filter(Boolean).map((p) => String(p).slice(0, 240)).slice(0, 6),
    }))
    .slice(0, 20);
}

router.get('/curriculum', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: docs } = await pool.query(CURRICULUM_DOCS_SQL, [newsroomId]);
    if (!docs.length) return res.json(null);
    const totalLen = docs.reduce((s, d) => s + (d.text ? d.text.length : 0), 0);
    const fingerprint = `${CURRICULUM_VERSION}:${docs.length}:${totalLen}`;
    const { rows: [cached] } = await pool.query(
      `SELECT analysis FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = 'curriculum' AND fingerprint = $2`,
      [newsroomId, fingerprint]);
    let sessions = cached?.analysis?.sessions;
    if (!sessions || !sessions.length) {
      // Regenerate when missing OR empty. NEVER persist an empty result — an empty
      // usually means a transient AI failure (e.g. no API credit), and caching it would
      // lock the section blank forever; leaving it unsaved lets it self-heal on the next
      // load once the AI is available again.
      const gen = await generateCurriculum(docs).catch((e) => { console.error('[curriculum gen]', e.message); return []; });
      if (gen.length) {
        sessions = gen;
        await pool.query(
          `INSERT INTO beaiready_team_analysis (newsroom_id, kind, fingerprint, analysis, generated_at)
           VALUES ($1,'curriculum',$2,$3::jsonb,NOW())
           ON CONFLICT (newsroom_id, kind) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, analysis = EXCLUDED.analysis, generated_at = NOW()`,
          [newsroomId, fingerprint, JSON.stringify({ sessions })]);
      } else {
        sessions = sessions || [];
      }
    }
    res.json({ sessions });
  } catch (err) { console.error('[bair-train/curriculum]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── "Did the training match what the team wanted?" — expectations vs delivery ──────
// Matches what the team said they wanted (pre-training intake) against what the
// training actually covered (curriculum) and, WHEN a post-training feedback form is
// connected, how they rated it. Cached under kind='match'; the fingerprint includes
// the feedback count, so connecting/syncing feedback automatically regenerates it.
const MATCH_VERSION = 'v2';   // bumped: dual client/admin summaries
const NEGATIVE_ANSWER = /^(none|nothing|not sure|n\/?a|no|nope|unsure|nothing yet|not really)\.?$/i;
// A match analysis counts as "empty" (a failed generation) if it has no matches and no
// summary — used so we regenerate rather than serve/persist a blank.
const isEmptyMatch = (x) => !x || (!(Array.isArray(x.matches) && x.matches.length) && !x.client_summary && !x.admin_summary);

async function generateExpectationsMatch({ wants, automates, curriculum, feedback }) {
  const hasFeedback = feedback && feedback.length > 0;
  const parts = [
    `WHAT THE TEAM SAID THEY WANTED TO LEARN (pre-training survey):\n${wants.length ? wants.map((w) => `- ${w}`).join('\n') : '(most left this blank or unsure)'}`,
    `\nWHAT THEY WANTED TO AUTOMATE:\n${automates.length ? automates.map((w) => `- ${w}`).join('\n') : '(none stated)'}`,
    `\nWHAT THE TRAINING ACTUALLY COVERED:\n${curriculum.length ? curriculum.map((s) => `- ${s.title}: ${(s.points || []).join('; ')}`).join('\n') : '(curriculum not indexed yet)'}`,
  ];
  if (hasFeedback) {
    parts.push(`\nPOST-TRAINING FEEDBACK FROM ATTENDEES:\n${feedback.map((f, i) =>
      `#${i + 1}: ${Object.entries(f).filter(([k]) => !/name|email|timestamp/i.test(k)).map(([k, v]) => `${k}: ${v}`).join(' | ')}`
    ).join('\n').slice(0, 6000)}`);
  }
  const system =
    'You analyse whether an AI training programme delivered what a business\'s staff wanted. You are given what the ' +
    'team wanted to learn/automate (pre-training), what the training covered, ' +
    (hasFeedback ? 'and their post-training feedback. ' : 'but NO post-training feedback yet. ') +
    'Match each real expectation to what was covered — ground everything in the data, invent nothing. Produce TWO ' +
    'summaries: a CLIENT summary (encouraging, written for the client\'s own staff to read — celebrate what they ' +
    'gained and can now do, warm and positive, do NOT dwell on what was missed) and an ADMIN summary (candid, for ' +
    'the training consultant\'s eyes only — honestly note what was only partly covered or missed and what to do next). ' +
    'Output ONLY JSON (no markdown): {"client_summary": string (2-3 sentences), "admin_summary": string (2-3 sentences' +
    (hasFeedback ? ', reflecting the feedback' : '') + '), "matches": [{"expectation": string, "wanted_by": number, ' +
    '"covered_in": string (the session that covered it, or ""), "status": "delivered"|"partial"|"gap"' +
    (hasFeedback ? ', "feedback": string (what attendees said about it, or "")' : '') + '}], "gaps": [string] (things ' +
    'they wanted that were not covered — admin-only)}. 3-7 matches, ordered most-wanted first.';
  const raw = await callClaude({ system, userContent: parts.join('\n') + '\n\nReturn the JSON now.', maxTokens: 1900, temperature: 0.2 });
  const j = parseJsonObject(raw);
  const okStatus = (s) => (['delivered', 'partial', 'gap'].includes(s) ? s : 'partial');
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : null);
  return {
    client_summary: str(j.client_summary, 700) || str(j.summary, 700),
    admin_summary: str(j.admin_summary, 700) || str(j.summary, 700),
    matches: (Array.isArray(j.matches) ? j.matches : []).filter((x) => x && x.expectation).map((x) => ({
      expectation: String(x.expectation).slice(0, 120),
      wanted_by: Number(x.wanted_by) || null,
      covered_in: x.covered_in ? String(x.covered_in).slice(0, 90) : '',
      status: okStatus(x.status),
      feedback: x.feedback ? String(x.feedback).slice(0, 220) : null,
    })).slice(0, 10),
    gaps: (Array.isArray(j.gaps) ? j.gaps : []).filter(Boolean).map((g) => String(g).slice(0, 140)).slice(0, 6),
  };
}

router.get('/expectations-match', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: intake } = await pool.query(
      `SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_type = 'intake'`, [newsroomId]);
    if (!intake.length) return res.json(null);
    const objs = intake.map((r) => r.response || {});
    const cols = []; for (const o of objs) for (const k of Object.keys(o)) if (!cols.includes(k)) cols.push(k);
    const learnCol = cols.find((k) => /would like to learn|want to learn|heard about ai/i.test(k));
    const autoCol = cols.find((k) => /automate/i.test(k));
    const collect = (col) => col ? [...new Set(objs.map((o) => String(o[col] ?? '').trim())
      .filter((v) => v && !NEGATIVE_ANSWER.test(v)))].slice(0, 40) : [];
    const wants = collect(learnCol), automates = collect(autoCol);

    const { rows: [cur] } = await pool.query(
      `SELECT analysis FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = 'curriculum'`, [newsroomId]);
    const curriculum = (cur && cur.analysis && Array.isArray(cur.analysis.sessions)) ? cur.analysis.sessions : [];
    const { rows: fb } = await pool.query(
      `SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_type = 'feedback'`, [newsroomId]);
    const feedback = fb.map((r) => r.response || {});

    const fingerprint = `${MATCH_VERSION}:${intake.length}:${feedback.length}:${curriculum.length}`;
    const { rows: [cached] } = await pool.query(
      `SELECT analysis FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = 'match' AND fingerprint = $2`,
      [newsroomId, fingerprint]);
    let m = cached?.analysis;
    // Empty = no matches AND no summary (a failed generation). Regenerate on empty,
    // and never persist an empty result, so a transient AI failure doesn't cache-lock
    // the section blank — it self-heals on the next load.
    if (isEmptyMatch(m)) {
      const gen = await generateExpectationsMatch({ wants, automates, curriculum, feedback }).catch((e) => { console.error('[match gen]', e.message); return {}; });
      if (!isEmptyMatch(gen)) {
        m = gen;
        await pool.query(
          `INSERT INTO beaiready_team_analysis (newsroom_id, kind, fingerprint, analysis, generated_at)
           VALUES ($1,'match',$2,$3::jsonb,NOW())
           ON CONFLICT (newsroom_id, kind) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, analysis = EXCLUDED.analysis, generated_at = NOW()`,
          [newsroomId, fingerprint, JSON.stringify(m)]);
      } else {
        m = m || {};
      }
    }
    // The client sees a positive view (no "gaps", no gap-status rows, encouraging
    // summary). The admin sees the candid version — gaps + the honest summary.
    const admin = isAdmin(req);
    const matches = m.matches || [];
    res.json({
      has_feedback: feedback.length > 0,
      is_admin_view: admin,
      summary: admin ? (m.admin_summary || m.client_summary) : (m.client_summary || m.admin_summary),
      matches: admin ? matches : matches.filter((x) => x.status !== 'gap'),
      gaps: admin ? (m.gaps || []) : [],
    });
  } catch (err) { console.error('[bair-train/expectations-match]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Refresh the client's dashboard analyses on demand (admin "process" button) ────
// The GET endpoints above lazily regenerate when their fingerprint changes (new
// survey/feedback/materials), but that first regeneration is slow. This lets the
// admin push all of it live at once after adding data. The fingerprints below MUST
// match the GET handlers so the warmed cache is a hit on the next client view.
async function upsertAnalysis(newsroomId, kind, fingerprint, analysis) {
  await pool.query(
    `INSERT INTO beaiready_team_analysis (newsroom_id, kind, fingerprint, analysis, generated_at)
     VALUES ($1,$2,$3,$4::jsonb,NOW())
     ON CONFLICT (newsroom_id, kind) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, analysis = EXCLUDED.analysis, generated_at = NOW()`,
    [newsroomId, kind, fingerprint, JSON.stringify(analysis)]);
}
// Each refresh* regenerates ONLY if its cache fingerprint is stale (inputs changed),
// so a click after adding just feedback re-runs only the match, not the whole set.
async function isFresh(newsroomId, kind, fingerprint) {
  const { rows: [c] } = await pool.query(
    `SELECT 1 FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = $2 AND fingerprint = $3`, [newsroomId, kind, fingerprint]);
  return !!c;
}
async function refreshTeamAnalysis(newsroomId) {
  const { rows: resp } = await pool.query(
    `SELECT response, imported_at FROM intake_responses WHERE newsroom_id = $1 AND form_type = 'intake' ORDER BY imported_at DESC`, [newsroomId]);
  if (!resp.length) return false;
  const maxImported = resp[0].imported_at ? new Date(resp[0].imported_at).getTime() : 0;
  const fp = `${TEAM_ANALYSIS_VERSION}:${resp.length}:${maxImported}`;
  if (await isFresh(newsroomId, 'intake', fp)) return true;
  const ai = await generateTeamAnalysis(resp.map((r) => r.response || {})).catch((e) => { console.error('[refresh ta]', e.message); return {}; });
  await upsertAnalysis(newsroomId, 'intake', fp, ai);
  return true;
}
async function refreshCurriculum(newsroomId) {
  const { rows: docs } = await pool.query(CURRICULUM_DOCS_SQL, [newsroomId]);
  const cached = async () => {
    const { rows: [c] } = await pool.query(`SELECT analysis FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = 'curriculum'`, [newsroomId]);
    return (c && c.analysis && Array.isArray(c.analysis.sessions)) ? c.analysis.sessions : [];
  };
  if (!docs.length) return cached();
  const totalLen = docs.reduce((s, d) => s + (d.text ? d.text.length : 0), 0);
  const fp = `${CURRICULUM_VERSION}:${docs.length}:${totalLen}`;
  const existing = await cached();
  if (existing.length && await isFresh(newsroomId, 'curriculum', fp)) return existing;   // fresh AND non-empty
  const sessions = await generateCurriculum(docs).catch((e) => { console.error('[refresh cur]', e.message); return []; });
  if (sessions.length) { await upsertAnalysis(newsroomId, 'curriculum', fp, { sessions }); return sessions; }
  return existing;   // generation failed — keep whatever we had, don't cache a blank
}
async function refreshMatch(newsroomId, curriculum) {
  const { rows: resp } = await pool.query(`SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_type = 'intake'`, [newsroomId]);
  if (!resp.length) return { ok: false, has_feedback: false };
  const { rows: fb } = await pool.query(`SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_type = 'feedback'`, [newsroomId]);
  const feedback = fb.map((r) => r.response || {});
  const fp = `${MATCH_VERSION}:${resp.length}:${feedback.length}:${curriculum.length}`;
  const { rows: [c] } = await pool.query(`SELECT analysis FROM beaiready_team_analysis WHERE newsroom_id = $1 AND kind = 'match'`, [newsroomId]);
  if (!isEmptyMatch(c?.analysis) && await isFresh(newsroomId, 'match', fp)) return { ok: true, has_feedback: feedback.length > 0 };
  const objs = resp.map((r) => r.response || {});
  const cols = []; for (const o of objs) for (const k of Object.keys(o)) if (!cols.includes(k)) cols.push(k);
  const learnCol = cols.find((k) => /would like to learn|want to learn|heard about ai/i.test(k));
  const autoCol = cols.find((k) => /automate/i.test(k));
  const collect = (col) => col ? [...new Set(objs.map((o) => String(o[col] ?? '').trim()).filter((v) => v && !NEGATIVE_ANSWER.test(v)))].slice(0, 40) : [];
  const m = await generateExpectationsMatch({ wants: collect(learnCol), automates: collect(autoCol), curriculum, feedback })
    .catch((e) => { console.error('[refresh match]', e.message); return {}; });
  if (!isEmptyMatch(m)) await upsertAnalysis(newsroomId, 'match', fp, m);   // don't cache a failed (blank) match
  return { ok: !isEmptyMatch(m), has_feedback: feedback.length > 0 };
}

router.post('/refresh-analysis', requireRole('admin'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    // Team analysis runs in parallel with the curriculum→match chain (match needs the curriculum).
    const taP = refreshTeamAnalysis(newsroomId);
    const cmP = (async () => { const sessions = await refreshCurriculum(newsroomId); const mt = await refreshMatch(newsroomId, sessions); return { sessions, mt }; })();
    const [ta, cm] = await Promise.all([taP, cmP]);
    res.json({ ok: true, team_analysis: ta, curriculum: (cm.sessions || []).length, match: cm.mt.ok, has_feedback: cm.mt.has_feedback });
  } catch (err) { console.error('[bair-train/refresh-analysis]', err); res.status(500).json({ message: err.message || 'Refresh failed' }); }
});

// ── Agendas (+ items) ───────────────────────────────────────────────────────────
router.get('/agendas', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const pub = isAdmin(req) ? '' : `AND status = 'published'`;
    const { rows: agendas } = await pool.query(
      `SELECT id, newsroom_id, title, scheduled_for, location, status, notes, created_at, updated_at,
              doc_kind, doc_url, doc_name, doc_file_id, doc_synced_at, (doc_synced_text IS NOT NULL) AS doc_synced,
              (SELECT COALESCE(json_agg(json_build_object('id', ud.id, 'name', ud.original_name, 'size', ud.file_size) ORDER BY ud.created_at), '[]'::json)
                 FROM uploaded_documents ud WHERE ud.entity_type = 'training_agenda_file' AND ud.entity_id = training_agendas.id) AS files,
              (SELECT COALESCE(json_agg(json_build_object('id', ud.id, 'name', ud.original_name, 'size', ud.file_size) ORDER BY ud.created_at), '[]'::json)
                 FROM uploaded_documents ud WHERE ud.entity_type = 'training_report_file' AND ud.entity_id = training_agendas.id) AS reports
         FROM training_agendas WHERE newsroom_id = $1 ${pub} ORDER BY scheduled_for DESC NULLS LAST, created_at DESC`, [newsroomId]);
    for (const a of agendas) {
      const { rows: items } = await pool.query(
        `SELECT id, order_index, time_label, topic, detail FROM training_agenda_items WHERE agenda_id = $1 ORDER BY order_index`, [a.id]);
      a.items = items;
    }
    res.json(agendas);
  } catch (err) { console.error('[bair-train/agendas:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

async function replaceAgendaItems(agendaId, items) {
  await pool.query('DELETE FROM training_agenda_items WHERE agenda_id = $1', [agendaId]);
  let i = 0;
  for (const it of items || []) {
    if (!it.topic) continue;
    await pool.query(
      `INSERT INTO training_agenda_items (agenda_id, order_index, time_label, topic, detail) VALUES ($1,$2,$3,$4,$5)`,
      [agendaId, i++, it.time_label || null, it.topic, it.detail || null]);
  }
}

router.post('/agendas', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, title, scheduled_for, location, status, notes, items } = req.body || {};
    if (!newsroom_id || !title) return res.status(400).json({ message: 'newsroom_id, title required' });
    const { rows } = await pool.query(
      `INSERT INTO training_agendas (newsroom_id, title, scheduled_for, location, status, notes, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5,'draft'),$6,$7) RETURNING *`,
      [newsroom_id, title, scheduled_for || null, location || null, status || null, notes || null, req.user.id]);
    await replaceAgendaItems(rows[0].id, items);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[bair-train/agendas:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/agendas/:id', requireRole('admin'), async (req, res) => {
  try {
    const { title, scheduled_for, location, status, notes, items } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE training_agendas SET title = COALESCE($1,title), scheduled_for = COALESCE($2,scheduled_for),
         location = COALESCE($3,location), status = COALESCE($4,status), notes = COALESCE($5,notes), updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [title || null, scheduled_for || null, location || null, status || null, notes ?? null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Agenda not found' });
    if (Array.isArray(items)) await replaceAgendaItems(req.params.id, items);
    res.json(rows[0]);
  } catch (err) { console.error('[bair-train/agendas:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/agendas/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM training_agendas WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Agenda not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[bair-train/agendas:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Agenda document (Google Doc — re-syncable — or an uploaded PDF) ───────────────
// Attach/replace a Google Doc link and immediately pull its current text.
router.post('/agendas/:id/doc/google', requireRole('admin'), async (req, res) => {
  try {
    const { doc_url } = req.body || {};
    if (!doc_url) return res.status(400).json({ message: 'doc_url required' });
    let text;
    try { text = await fetchGoogleDocText(doc_url); }
    catch (e) { return res.status(400).json({ message: e.message }); }
    const { rows } = await pool.query(
      `UPDATE training_agendas SET doc_kind='gdoc', doc_url=$1, doc_name=$2, doc_file_id=NULL,
         doc_synced_text=$3, doc_synced_at=NOW(), updated_at=NOW() WHERE id=$4 RETURNING *`,
      [doc_url, 'Google Doc', text, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Agenda not found' });
    res.json({ ...rows[0], doc_chars: text.length });
  } catch (err) { console.error('[bair-train/agenda-doc:google]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Re-pull the latest text of an already-attached Google Doc.
router.post('/agendas/:id/doc/sync', requireRole('admin'), async (req, res) => {
  try {
    const { rows: [a] } = await pool.query('SELECT doc_kind, doc_url FROM training_agendas WHERE id=$1', [req.params.id]);
    if (!a) return res.status(404).json({ message: 'Agenda not found' });
    if (a.doc_kind !== 'gdoc' || !a.doc_url) return res.status(400).json({ message: 'No Google Doc attached to sync' });
    let text;
    try { text = await fetchGoogleDocText(a.doc_url); }
    catch (e) { return res.status(400).json({ message: e.message }); }
    const { rows } = await pool.query(
      `UPDATE training_agendas SET doc_synced_text=$1, doc_synced_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`,
      [text, req.params.id]);
    res.json({ ...rows[0], doc_chars: text.length });
  } catch (err) { console.error('[bair-train/agenda-doc:sync]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Upload a PDF agenda. Reuses the shared uploads pipeline + uploaded_documents.
router.post('/agendas/:id/doc/upload', requireRole('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { rows: [a] } = await pool.query('SELECT id FROM training_agendas WHERE id=$1', [req.params.id]);
    if (!a) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ message: 'Agenda not found' }); }
    const { rows: [doc] } = await pool.query(
      `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,'training_agenda',$6,$7) RETURNING id`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, req.params.id, req.user.id]);
    // Harvest the agenda's text immediately so the strategy AI can read what was
    // planned/delivered rather than treating the PDF as opaque.
    await harvestFileText(doc.id);
    const { rows } = await pool.query(
      `UPDATE training_agendas SET doc_kind='pdf', doc_file_id=$1, doc_name=$2, doc_url=NULL,
         doc_synced_text=NULL, doc_synced_at=NULL, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [doc.id, req.file.originalname, req.params.id]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[bair-train/agenda-doc:upload]', err); res.status(500).json({ message: err.message || 'Upload failed' }); }
});

// Remove whatever document is attached.
router.delete('/agendas/:id/doc', requireRole('admin'), async (req, res) => {
  try {
    const { rows: [a] } = await pool.query('SELECT doc_file_id FROM training_agendas WHERE id=$1', [req.params.id]);
    if (!a) return res.status(404).json({ message: 'Agenda not found' });
    if (a.doc_file_id) await pool.query('DELETE FROM uploaded_documents WHERE id=$1', [a.doc_file_id]).catch(() => {});
    await pool.query(
      `UPDATE training_agendas SET doc_kind=NULL, doc_url=NULL, doc_name=NULL, doc_file_id=NULL,
         doc_synced_text=NULL, doc_synced_at=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { console.error('[bair-train/agenda-doc:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Download / open the attached doc. Member-reachable but tenant-scoped (members
// only get a PUBLISHED agenda's doc); a Google Doc 302s to its link.
router.get('/agendas/:id/doc/download', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const pub = isAdmin(req) ? '' : `AND status = 'published'`;
    const { rows: [a] } = await pool.query(
      `SELECT doc_kind, doc_url, doc_file_id FROM training_agendas WHERE id=$1 AND newsroom_id=$2 ${pub}`,
      [req.params.id, newsroomId]);
    if (!a || !a.doc_kind) return res.status(404).json({ message: 'No document' });
    if (a.doc_kind === 'gdoc') return res.redirect(a.doc_url);
    const { rows: [doc] } = await pool.query('SELECT * FROM uploaded_documents WHERE id=$1', [a.doc_file_id]);
    if (!doc || !doc.file_path || !fs.existsSync(doc.file_path)) return res.status(404).json({ message: 'File not found' });
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) { console.error('[bair-train/agenda-doc:download]', err); res.status(500).json({ message: 'Download failed' }); }
});

// ── Materials (RAG-ingested) ─────────────────────────────────────────────────────
const KINDS = ['doc', 'slide', 'video', 'link', 'exercise'];

router.get('/materials', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const pub = isAdmin(req) ? '' : 'AND m.published = true';
    const { rows } = await pool.query(
      `SELECT m.*, a.title AS agenda_title, a.scheduled_for AS agenda_date,
              (SELECT COALESCE(json_agg(json_build_object('id', ud.id, 'name', ud.original_name, 'size', ud.file_size) ORDER BY ud.created_at), '[]'::json)
                 FROM uploaded_documents ud WHERE ud.entity_type = 'training_material_file' AND ud.entity_id = m.id) AS files
         FROM training_materials m LEFT JOIN training_agendas a ON a.id = m.agenda_id
        WHERE m.newsroom_id = $1 ${pub} ORDER BY m.order_index, m.created_at`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/materials:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/materials', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, title, description, content, url, kind, order_index, published, rag_shareable, agenda_id } = req.body || {};
    if (!newsroom_id || !title) return res.status(400).json({ message: 'newsroom_id, title required' });
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ message: `kind must be one of: ${KINDS.join(', ')}` });
    const { rows } = await pool.query(
      `INSERT INTO training_materials (newsroom_id, title, description, content, url, kind, order_index, published, rag_shareable, agenda_id, created_by)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'doc'),COALESCE($7,0),COALESCE($8,true),COALESCE($9,true),$10,$11) RETURNING *`,
      [newsroom_id, title, description || null, content || null, url || null, kind || null,
       order_index ?? null, typeof published === 'boolean' ? published : null,
       typeof rag_shareable === 'boolean' ? rag_shareable : null, agenda_id || null, req.user.id]);
    const row = rows[0];
    await syncMaterialToRag(row.id, await tenantContext(req));
    res.status(201).json(row);
  } catch (err) { console.error('[bair-train/materials:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/materials/:id', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const { title, description, content, url, kind, order_index, published, rag_shareable, agenda_id } = b;
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ message: `kind must be one of: ${KINDS.join(', ')}` });
    const hasAgenda = Object.prototype.hasOwnProperty.call(b, 'agenda_id');   // presence-aware so it can be set or cleared
    const { rows } = await pool.query(
      `UPDATE training_materials SET title = COALESCE($1,title), description = COALESCE($2,description),
         content = COALESCE($3,content), url = COALESCE($4,url), kind = COALESCE($5,kind),
         order_index = COALESCE($6,order_index), published = COALESCE($7,published),
         rag_shareable = COALESCE($8,rag_shareable),
         agenda_id = CASE WHEN $9 THEN $10 ELSE agenda_id END,
         updated_at = NOW() WHERE id = $11 RETURNING *`,
      [title || null, description ?? null, content ?? null, url ?? null, kind || null,
       order_index ?? null, typeof published === 'boolean' ? published : null,
       typeof rag_shareable === 'boolean' ? rag_shareable : null, hasAgenda, agenda_id || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Material not found' });
    const row = rows[0];
    await syncMaterialToRag(row.id, await tenantContext(req));
    res.json(row);
  } catch (err) { console.error('[bair-train/materials:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/materials/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM training_materials WHERE id = $1 RETURNING knowledge_id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Material not found' });
    if (rows[0].knowledge_id) await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [rows[0].knowledge_id]).catch(() => {});
    res.json({ deleted: true });
  } catch (err) { console.error('[bair-train/materials:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Attachments (multiple files per agenda or material) ──────────────────────────
// Agendas can carry several documents (the agenda PDF, a second PDF, a training
// report); materials can carry many PDFs (slides/handouts per session). Stored in
// uploaded_documents under a *_file entity_type so they don't collide with the
// agenda's single primary doc. Tenant-scoped; members can download only when the
// parent (agenda/material) is published.
const FILE_SCOPES = {
  training_agenda_file:   { table: 'training_agendas',   pub: "status = 'published'" },
  training_report_file:   { table: 'training_agendas',   pub: "status = 'published'" },
  training_material_file: { table: 'training_materials', pub: 'published = true' },
};

router.post('/files', requireRole('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { entity_type, entity_id } = req.body || {};
    const scope = FILE_SCOPES[entity_type];
    if (!scope || !entity_id) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ message: 'entity_type + entity_id required' }); }
    const { newsroomId } = await tenantContext(req);
    const { rows: [ent] } = await pool.query(`SELECT id FROM ${scope.table} WHERE id = $1 AND newsroom_id = $2`, [entity_id, newsroomId]);
    if (!ent) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ message: 'Not found for this client' }); }
    const { rows: [doc] } = await pool.query(
      `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, original_name AS name, file_size AS size`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, entity_type, entity_id, req.user.id]);
    // Harvest the file's text so reports/handouts feed the AI; for shareable
    // material files, fold that text into the sector knowledge base too.
    const text = await harvestFileText(doc.id);
    if (entity_type === 'training_material_file' && text) {
      try { await syncMaterialToRag(entity_id, await tenantContext(req)); }
      catch (e) { console.error('[bair-train/files:post rag]', e.message); }
    }
    res.status(201).json({ ...doc, harvested: text != null });
  } catch (err) { console.error('[bair-train/files:post]', err); res.status(500).json({ message: err.message || 'Upload failed' }); }
});

router.delete('/files/:docId', requireRole('admin'), async (req, res) => {
  try {
    const { rows: [doc] } = await pool.query('SELECT * FROM uploaded_documents WHERE id = $1', [req.params.docId]);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    const scope = FILE_SCOPES[doc.entity_type];
    if (scope) {
      const { newsroomId } = await tenantContext(req);
      const { rows: [ent] } = await pool.query(`SELECT id FROM ${scope.table} WHERE id = $1 AND newsroom_id = $2`, [doc.entity_id, newsroomId]);
      if (!ent) return res.status(404).json({ message: 'Not found for this client' });
    }
    await pool.query('DELETE FROM uploaded_documents WHERE id = $1', [req.params.docId]);
    if (doc.file_path) fs.unlink(doc.file_path, () => {});
    // Re-index the material so the knowledge base drops the removed file's text.
    if (doc.entity_type === 'training_material_file') {
      try { await syncMaterialToRag(doc.entity_id, await tenantContext(req)); }
      catch (e) { console.error('[bair-train/files:del rag]', e.message); }
    }
    res.json({ deleted: true });
  } catch (err) { console.error('[bair-train/files:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Download an attachment. Member-reachable but tenant-scoped — members only get a
// file whose parent agenda/material is published.
router.get('/files/:docId/download', async (req, res) => {
  try {
    const { rows: [doc] } = await pool.query('SELECT * FROM uploaded_documents WHERE id = $1', [req.params.docId]);
    const scope = doc && FILE_SCOPES[doc.entity_type];
    if (!doc || !scope || !doc.file_path || !fs.existsSync(doc.file_path)) return res.status(404).json({ message: 'Not found' });
    // Admins (who manage every client) reach any training attachment — an <a> GET
    // can't carry the X-Newsroom-Id header. Members get only their own tenant's
    // PUBLISHED parent agenda/material.
    if (!isAdmin(req)) {
      const { newsroomId } = await tenantContext(req);
      const { rows: [ent] } = await pool.query(`SELECT id FROM ${scope.table} WHERE id = $1 AND newsroom_id = $2 AND ${scope.pub}`, [doc.entity_id, newsroomId]);
      if (!ent) return res.status(404).json({ message: 'Not found' });
    }
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) { console.error('[bair-train/files:download]', err); res.status(500).json({ message: 'Download failed' }); }
});

// ── Outcome documents (linked to strategy; RAG-ingested when FINAL) ──────────────
router.get('/outcomes', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const pub = isAdmin(req) ? '' : `AND status = 'final'`;
    const { rows } = await pool.query(
      `SELECT * FROM training_outcomes WHERE newsroom_id = $1 ${pub} ORDER BY updated_at DESC`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/outcomes:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/outcomes', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, title, content, file_url, status, linked_to_strategy, rag_shareable } = req.body || {};
    if (!newsroom_id || !title) return res.status(400).json({ message: 'newsroom_id, title required' });
    const { rows } = await pool.query(
      `INSERT INTO training_outcomes (newsroom_id, title, content, file_url, status, linked_to_strategy, rag_shareable, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5,'draft'),COALESCE($6,true),COALESCE($7,true),$8) RETURNING *`,
      [newsroom_id, title, content || null, file_url || null, status || null,
       typeof linked_to_strategy === 'boolean' ? linked_to_strategy : null,
       typeof rag_shareable === 'boolean' ? rag_shareable : null, req.user.id]);
    const row = rows[0];
    const tenant = await tenantContext(req);
    await syncToRag({ table: 'training_outcomes', row, tenant, category: 'training_outcome', shouldIngest: row.status === 'final' && row.rag_shareable && !!row.content });
    res.status(201).json(row);
  } catch (err) { console.error('[bair-train/outcomes:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/outcomes/:id', requireRole('admin'), async (req, res) => {
  try {
    const { title, content, file_url, status, linked_to_strategy, rag_shareable } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE training_outcomes SET title = COALESCE($1,title), content = COALESCE($2,content),
         file_url = COALESCE($3,file_url), status = COALESCE($4,status),
         linked_to_strategy = COALESCE($5,linked_to_strategy), rag_shareable = COALESCE($6,rag_shareable),
         updated_at = NOW() WHERE id = $7 RETURNING *`,
      [title || null, content ?? null, file_url ?? null, status || null,
       typeof linked_to_strategy === 'boolean' ? linked_to_strategy : null,
       typeof rag_shareable === 'boolean' ? rag_shareable : null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Outcome not found' });
    const row = rows[0];
    const tenant = await tenantContext(req);
    await syncToRag({ table: 'training_outcomes', row, tenant, category: 'training_outcome', shouldIngest: row.status === 'final' && row.rag_shareable && !!row.content });
    res.json(row);
  } catch (err) { console.error('[bair-train/outcomes:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/outcomes/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM training_outcomes WHERE id = $1 RETURNING knowledge_id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Outcome not found' });
    if (rows[0].knowledge_id) await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [rows[0].knowledge_id]).catch(() => {});
    res.json({ deleted: true });
  } catch (err) { console.error('[bair-train/outcomes:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Strategy items (goals + automation roadmap) ──────────────────────────────────
// Replaces the free-form outcome document with structured items. Clients see
// 'published' items; admins (with X-Newsroom-Id) see all for the selected client.
const STRAT_KINDS = ['goal', 'automation'];
const SIZE = ['low', 'medium', 'high'];
const cleanSize = (v) => (SIZE.includes(v) ? v : null);

router.get('/strategy', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const pub = isAdmin(req) ? '' : `AND s.status = 'published'`;
    const { rows } = await pool.query(
      `SELECT s.*, a.title AS agenda_title, a.scheduled_for AS agenda_date
         FROM training_strategy_items s LEFT JOIN training_agendas a ON a.id = s.agenda_id
        WHERE s.newsroom_id = $1 ${pub}
        ORDER BY s.kind, s.target_date NULLS LAST, s.order_index, s.created_at`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/strategy:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/strategy', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, kind, title, detail, effort, payoff, order_index, status, agenda_id, target_date } = req.body || {};
    if (!newsroom_id || !title) return res.status(400).json({ message: 'newsroom_id, title required' });
    if (kind && !STRAT_KINDS.includes(kind)) return res.status(400).json({ message: `kind must be one of: ${STRAT_KINDS.join(', ')}` });
    const { rows } = await pool.query(
      `INSERT INTO training_strategy_items (newsroom_id, kind, title, detail, effort, payoff, order_index, status, agenda_id, target_date, created_by)
       VALUES ($1,COALESCE($2,'goal'),$3,$4,$5,$6,COALESCE($7,0),COALESCE($8,'draft'),$9,$10,$11) RETURNING *`,
      [newsroom_id, kind || null, title, detail || null, cleanSize(effort), cleanSize(payoff),
       order_index ?? null, status || null, agenda_id || null, target_date || null, req.user.id]);
    const row = rows[0];
    const tenant = await tenantContext(req);
    await syncToRag({ table: 'training_strategy_items', row, tenant, category: 'training_strategy', shouldIngest: row.status === 'published' });
    res.status(201).json(row);
  } catch (err) { console.error('[bair-train/strategy:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/strategy/:id', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const { kind, title, detail, effort, payoff, order_index, status } = b;
    if (kind && !STRAT_KINDS.includes(kind)) return res.status(400).json({ message: `kind must be one of: ${STRAT_KINDS.join(', ')}` });
    // effort/payoff are presence-aware: a status-only toggle leaves them intact,
    // but sending the field (incl. empty → null) updates or clears it.
    const hasEffort = Object.prototype.hasOwnProperty.call(b, 'effort');
    const hasPayoff = Object.prototype.hasOwnProperty.call(b, 'payoff');
    const hasAgenda = Object.prototype.hasOwnProperty.call(b, 'agenda_id');
    const hasTarget = Object.prototype.hasOwnProperty.call(b, 'target_date');
    const { agenda_id, target_date } = b;
    const { rows } = await pool.query(
      `UPDATE training_strategy_items SET kind = COALESCE($1,kind), title = COALESCE($2,title),
         detail = COALESCE($3,detail),
         effort = CASE WHEN $4 THEN $5 ELSE effort END,
         payoff = CASE WHEN $6 THEN $7 ELSE payoff END,
         agenda_id = CASE WHEN $8 THEN $9 ELSE agenda_id END,
         target_date = CASE WHEN $10 THEN $11 ELSE target_date END,
         order_index = COALESCE($12,order_index), status = COALESCE($13,status), updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [kind || null, title || null, detail ?? null, hasEffort, cleanSize(effort), hasPayoff, cleanSize(payoff),
       hasAgenda, agenda_id || null, hasTarget, target_date || null,
       order_index ?? null, status || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Strategy item not found' });
    const row = rows[0];
    const tenant = await tenantContext(req);
    await syncToRag({ table: 'training_strategy_items', row, tenant, category: 'training_strategy', shouldIngest: row.status === 'published' });
    res.json(row);
  } catch (err) { console.error('[bair-train/strategy:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/strategy/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM training_strategy_items WHERE id = $1 RETURNING knowledge_id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Strategy item not found' });
    if (rows[0].knowledge_id) await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [rows[0].knowledge_id]).catch(() => {});
    res.json({ deleted: true });
  } catch (err) { console.error('[bair-train/strategy:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Company knowledge (per-client context the AI reasons over) ───────────────────
// Uploaded docs, a scraped website, or a typed note. Admin-only; never shown to a
// client. The extracted text is what the strategy suggestions are grounded in.
router.get('/company-knowledge', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.json([]);   // internal context only
    const { newsroomId } = await tenantContext(req);
    // Fetch the full (possibly encrypted) text and decrypt in memory — we can't
    // SQL-truncate ciphertext, so the snippet is built after decryption.
    const { rows } = await pool.query(
      `SELECT id, kind, title, url, file_id, extracted_text, created_at
         FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]);
    res.json(rows.map((r) => {
      const text = decryptFor(newsroomId, r.extracted_text) || '';
      return { id: r.id, kind: r.kind, title: r.title, url: r.url, file_id: r.file_id, created_at: r.created_at, snippet: text.slice(0, 220), has_text: text.length > 0 };
    }));
  } catch (err) { console.error('[bair-train/company-knowledge:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/company-knowledge/website', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, url } = req.body || {};
    if (!newsroom_id || !url) return res.status(400).json({ message: 'newsroom_id, url required' });
    const scraped = await scrapeArticle(url);
    if (!scraped.success || !scraped.text) return res.status(400).json({ message: `Couldn't read that page${scraped.error ? `: ${scraped.error}` : ''}` });
    const { rows } = await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, url, extracted_text, created_by)
       VALUES ($1,'website',$2,$3,$4,$5) RETURNING id, kind, title, url, created_at`,
      [newsroom_id, scraped.title || url, url, encryptFor(newsroom_id, scraped.text), req.user.id]);
    try { await indexSource(rows[0].id, newsroom_id, scraped.text); } catch (e) { console.error('[company-knowledge index website]', e.message); }
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[bair-train/company-knowledge:website]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/company-knowledge/upload', requireRole('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { newsroom_id } = req.body || {};
    if (!newsroom_id) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ message: 'newsroom_id required' }); }
    const { rows: [doc] } = await pool.query(
      `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,'company_knowledge',$6,$7) RETURNING id`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, newsroom_id, req.user.id]);
    let text = '';
    try { text = await extractText(req.file.path, req.file.mimetype); } catch (e) { console.error('[company-knowledge extract]', e.message); }
    const { rows } = await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, file_id, extracted_text, created_by)
       VALUES ($1,'doc',$2,$3,$4,$5) RETURNING id, kind, title, file_id, created_at`,
      [newsroom_id, req.file.originalname, doc.id, encryptFor(newsroom_id, (text || '').slice(0, 20000)), req.user.id]);
    try { await indexSource(rows[0].id, newsroom_id, text); } catch (e) { console.error('[company-knowledge index upload]', e.message); }
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[bair-train/company-knowledge:upload]', err); res.status(500).json({ message: err.message || 'Upload failed' }); }
});

router.post('/company-knowledge/note', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, title, text } = req.body || {};
    if (!newsroom_id || !text?.trim()) return res.status(400).json({ message: 'newsroom_id and text required' });
    const { rows } = await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, extracted_text, created_by)
       VALUES ($1,'note',$2,$3,$4) RETURNING id, kind, title, created_at`,
      [newsroom_id, title || 'Note', encryptFor(newsroom_id, text.trim()), req.user.id]);
    try { await indexSource(rows[0].id, newsroom_id, text.trim()); } catch (e) { console.error('[company-knowledge index note]', e.message); }
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[bair-train/company-knowledge:note]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/company-knowledge/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rows: [s] } = await pool.query('SELECT file_id FROM beaiready_company_sources WHERE id = $1', [req.params.id]);
    if (!s) return res.status(404).json({ message: 'Not found' });
    if (s.file_id) await pool.query('DELETE FROM uploaded_documents WHERE id = $1', [s.file_id]).catch(() => {});
    await pool.query('DELETE FROM beaiready_company_sources WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { console.error('[bair-train/company-knowledge:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Everything the AI knows about this client, as one text blob for prompting.
async function gatherBusinessContext(newsroomId) {
  const parts = [];
  const { rows: [t] } = await pool.query(
    `SELECT o.name AS org, s.name AS sector FROM newsrooms n
       LEFT JOIN organisations o ON o.id = n.organisation_id
       LEFT JOIN sectors s ON s.id = o.sector_id WHERE n.id = $1`, [newsroomId]).catch(() => ({ rows: [{}] }));
  if (t?.org) parts.push(`Business: ${t.org}${t.sector ? ` (sector: ${t.sector})` : ''}`);
  const { rows: intake } = await pool.query(
    `SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_type = 'intake' ORDER BY submitted_at DESC NULLS LAST LIMIT 30`, [newsroomId]).catch(() => ({ rows: [] }));
  if (intake.length) {
    const lines = intake.map((r) => Object.entries(r.response || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')).filter(Boolean);
    parts.push(`Intake / staff survey responses (${intake.length}):\n${lines.join('\n').slice(0, 6000)}`);
  }
  // Post-training feedback (a separate Google form) — how attendees rated the
  // sessions, labelled distinctly from the pre-training intake survey.
  const { rows: feedback } = await pool.query(
    `SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_type = 'feedback' ORDER BY submitted_at DESC NULLS LAST LIMIT 30`, [newsroomId]).catch(() => ({ rows: [] }));
  if (feedback.length) {
    const lines = feedback.map((r) => Object.entries(r.response || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')).filter(Boolean);
    parts.push(`Post-training feedback responses (${feedback.length}):\n${lines.join('\n').slice(0, 6000)}`);
  }
  const { rows: srcs } = await pool.query(
    `SELECT kind, title, extracted_text FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC LIMIT 20`, [newsroomId]).catch(() => ({ rows: [] }));
  for (const s of srcs) {
    const text = decryptFor(newsroomId, s.extracted_text);
    if (text) parts.push(`[${s.kind}] ${s.title || ''}:\n${text.slice(0, 3000)}`);
  }

  // What we've actually delivered to this client — the harvested training record.
  // Agendas (what was planned/run, incl. the PDF/Google-Doc text), training reports
  // (what happened + recommendations), and the materials themselves (incl. the text
  // pulled from their handouts). This is the difference between deciding from a real
  // engagement history and guessing from a survey.
  const { rows: agendas } = await pool.query(
    `SELECT a.title, a.scheduled_for, a.doc_synced_text,
            (SELECT string_agg(
                      CASE WHEN i.time_label IS NOT NULL THEN i.time_label || ' — ' ELSE '' END || i.topic ||
                      CASE WHEN i.detail IS NOT NULL THEN ': ' || i.detail ELSE '' END, E'\n' ORDER BY i.order_index)
               FROM training_agenda_items i WHERE i.agenda_id = a.id) AS items,
            (SELECT ud.extracted_text FROM uploaded_documents ud WHERE ud.id = a.doc_file_id) AS doc_text
       FROM training_agendas a WHERE a.newsroom_id = $1
      ORDER BY a.scheduled_for DESC NULLS LAST LIMIT 12`, [newsroomId]).catch(() => ({ rows: [] }));
  for (const a of agendas) {
    const body = [a.items, a.doc_synced_text || a.doc_text].filter(Boolean).join('\n');
    if (a.title || body) parts.push(`Training session — ${a.title || 'session'}${a.scheduled_for ? ` (${new Date(a.scheduled_for).toISOString().slice(0, 10)})` : ''}:\n${body.slice(0, 2500)}`);
  }
  const { rows: reports } = await pool.query(
    `SELECT a.title, ud.original_name, ud.extracted_text
       FROM uploaded_documents ud JOIN training_agendas a ON a.id = ud.entity_id
      WHERE ud.entity_type = 'training_report_file' AND a.newsroom_id = $1
        AND ud.extracted_text IS NOT NULL AND length(ud.extracted_text) > 0
      ORDER BY ud.created_at DESC LIMIT 10`, [newsroomId]).catch(() => ({ rows: [] }));
  for (const r of reports) parts.push(`Training report (${r.original_name}) for "${r.title}":\n${r.extracted_text.slice(0, 3000)}`);
  const { rows: mats } = await pool.query(
    `SELECT m.title, m.content,
            (SELECT string_agg(ud.extracted_text, E'\n\n' ORDER BY ud.created_at)
               FROM uploaded_documents ud
              WHERE ud.entity_type = 'training_material_file' AND ud.entity_id = m.id
                AND ud.extracted_text IS NOT NULL AND length(ud.extracted_text) > 0) AS file_text
       FROM training_materials m WHERE m.newsroom_id = $1 ORDER BY m.order_index, m.created_at LIMIT 30`, [newsroomId]).catch(() => ({ rows: [] }));
  for (const m of mats) {
    const body = [m.content, m.file_text].filter(Boolean).join('\n');
    if (body) parts.push(`Training material — ${m.title}:\n${body.slice(0, 2500)}`);
  }

  const { rows: existing } = await pool.query(
    `SELECT kind, title FROM training_strategy_items WHERE newsroom_id = $1`, [newsroomId]).catch(() => ({ rows: [] }));
  if (existing.length) parts.push(`Existing strategy items (do not duplicate):\n${existing.map((e) => `- [${e.kind}] ${e.title}`).join('\n')}`);
  return parts.join('\n\n').slice(0, 24000);
}

function parseSuggestions(text) {
  if (!text) return [];
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Suggest Goals or Automation items from everything we know about the business.
// Returns suggestions only (not saved) — the consultant adds the ones they want.
router.post('/strategy/suggest', requireRole('admin'), async (req, res) => {
  try {
    const { kind } = req.body || {};
    if (!STRAT_KINDS.includes(kind)) return res.status(400).json({ message: `kind must be one of: ${STRAT_KINDS.join(', ')}` });
    const { newsroomId, organisationId, sectorId } = await tenantContext(req);
    const context = await gatherBusinessContext(newsroomId);
    if (!context.trim()) return res.json({ suggestions: [], note: 'No company knowledge yet — add intake responses, a website or a doc first.' });
    const auto = kind === 'automation';

    // Cross-company learning: pull platform-curated guidance + ANONYMISED patterns from
    // similar (same-sector) businesses. Passing orgId enforces tenant isolation — this
    // never returns another client's private content, only 'global' + 'pattern' entries.
    let sectorLessons = '', lessonsUsed = 0;
    try {
      const kb = await getRelevantKnowledge({ orgId: organisationId, sectorId, searchTerms: `AI ${auto ? 'automation workflow' : 'goals strategy'} ${context.slice(0, 400)}`, limit: 6 });
      if (kb && kb.length) {
        lessonsUsed = kb.length;
        sectorLessons = '\n\nWhat has worked for similar businesses in this sector (draw on these patterns — adapt, do not copy blindly):\n' +
          kb.map((k) => `- ${k.title}: ${(k.content || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
      }
    } catch (e) { console.error('[strategy:suggest rag]', e.message); }

    const system =
      'You are an AI strategy consultant for South African SMEs on the Be AI Ready platform. From what is known ' +
      'about ONE specific business — and the patterns that worked for similar businesses — propose concrete, realistic ' +
      (auto ? 'automation-roadmap items (specific workflows/tasks to automate with AI).' : 'AI goals (outcomes the business wants from AI).') +
      ' Ground every suggestion in the provided context — no generic filler. Output ONLY a JSON array, no prose. Each element: ' +
      (auto ? '{"title": string, "detail": string, "effort": "low"|"medium"|"high", "payoff": "low"|"medium"|"high"}.'
            : '{"title": string, "detail": string}.') +
      ' 4–6 items. Do not duplicate the existing items listed.';
    const userContent = `What we know about this business:\n\n${context}${sectorLessons}\n\nSuggest the ${auto ? 'automation items' : 'goals'} now as a JSON array.`;
    const raw = await callClaude({ system, userContent, maxTokens: 1400, temperature: 0.5 });
    const suggestions = parseSuggestions(raw).filter((s) => s && s.title).slice(0, 8);
    res.json({ suggestions, sector_lessons_used: lessonsUsed });
  } catch (err) { console.error('[bair-train/strategy:suggest]', err); res.status(500).json({ message: err.message || 'Suggestion failed' }); }
});

// ── Training-data harvest: extract & index everything, backfill old uploads ───────
// Resolves every training file (agenda PDF, second doc, report, material handout)
// to the client that owns it, so status/backfill are tenant-scoped like the rest.
const HARVEST_FILE_TYPES = ['training_agenda', 'training_agenda_file', 'training_report_file', 'training_material_file'];
const HARVEST_CTE = `
  WITH training_files AS (
    SELECT ud.id, ud.entity_type, ud.entity_id, ud.original_name, ud.mime_type,
           ud.extracted_text, ud.extraction_status,
           COALESCE(ta.newsroom_id, tm.newsroom_id) AS newsroom_id
      FROM uploaded_documents ud
      LEFT JOIN training_agendas   ta ON ta.id = ud.entity_id
             AND ud.entity_type IN ('training_agenda','training_agenda_file','training_report_file')
      LEFT JOIN training_materials tm ON tm.id = ud.entity_id
             AND ud.entity_type = 'training_material_file'
     WHERE ud.entity_type = ANY($1)
  )`;

// How much of this client's training corpus has been harvested into text the AI uses.
router.get('/harvest/status', requireRole('admin'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: [c] } = await pool.query(
      `${HARVEST_CTE}
       SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE extracted_text IS NOT NULL AND length(extracted_text) > 0)::int AS harvested,
              COUNT(*) FILTER (WHERE extraction_status = 'failed')::int AS failed,
              COUNT(*) FILTER (WHERE (extracted_text IS NULL OR length(extracted_text) = 0) AND COALESCE(extraction_status,'pending') <> 'failed')::int AS pending
         FROM training_files WHERE newsroom_id = $2`,
      [HARVEST_FILE_TYPES, newsroomId]);
    res.json(c || { total: 0, harvested: 0, failed: 0, pending: 0 });
  } catch (err) { console.error('[bair-train/harvest:status]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Backfill: extract text for this client's training files that were uploaded before
// harvesting existed (or that previously failed), then re-index affected materials.
router.post('/harvest/backfill', requireRole('admin'), async (req, res) => {
  try {
    const tenant = await tenantContext(req);
    const { rows: pending } = await pool.query(
      `${HARVEST_CTE}
       SELECT id, entity_type, entity_id FROM training_files
        WHERE newsroom_id = $2
          AND (extracted_text IS NULL OR length(extracted_text) = 0)
        ORDER BY id LIMIT 100`,
      [HARVEST_FILE_TYPES, tenant.newsroomId]);
    let harvested = 0, failed = 0;
    const materialsToResync = new Set();
    for (const f of pending) {
      const text = await harvestFileText(f.id);
      if (text != null) { harvested++; if (f.entity_type === 'training_material_file') materialsToResync.add(f.entity_id); }
      else failed++;
    }
    for (const mid of materialsToResync) {
      try { await syncMaterialToRag(mid, tenant); } catch (e) { console.error('[bair-train/harvest:backfill rag]', e.message); }
    }
    res.json({ processed: pending.length, harvested, failed, reindexed_materials: materialsToResync.size });
  } catch (err) { console.error('[bair-train/harvest:backfill]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
