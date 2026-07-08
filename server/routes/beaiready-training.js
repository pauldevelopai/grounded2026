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
    const { newsroom_id, form_name, csv_url } = req.body || {};
    if (!newsroom_id || !form_name || !csv_url) return res.status(400).json({ message: 'newsroom_id, form_name, csv_url required' });
    // Store the link as-is (toCsvUrl normalises at fetch time, keeping the original visible).
    const { rows } = await pool.query(
      `INSERT INTO intake_forms (newsroom_id, form_name, csv_url) VALUES ($1,$2,$3) RETURNING *`,
      [newsroom_id, form_name, csv_url]);
    // Pull responses immediately so "0 responses" never lingers when the sheet is fine.
    let sync = null;
    try { sync = await syncOneForm(rows[0].id); }
    catch (e) { sync = { form: form_name, total: 0, inserted: 0, error: e.message }; }
    res.status(201).json({ ...rows[0], sync });
  } catch (err) { console.error('[bair-train/intake-forms:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/intake-forms/:id', requireRole('admin'), async (req, res) => {
  try {
    const { form_name, csv_url, is_enabled } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE intake_forms SET form_name = COALESCE($1, form_name), csv_url = COALESCE($2, csv_url),
         is_enabled = COALESCE($3, is_enabled) WHERE id = $4 RETURNING *`,
      [form_name || null, csv_url || null, typeof is_enabled === 'boolean' ? is_enabled : null, req.params.id]);
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
      `SELECT f.form_name, f.last_synced_at,
              (SELECT COUNT(*)::int FROM intake_responses r
                WHERE r.newsroom_id = f.newsroom_id AND r.form_name = f.form_name AND r.form_type = 'feedback') AS response_count
         FROM intake_forms f WHERE f.newsroom_id = $1 AND f.form_type = 'feedback' AND f.is_enabled = true
        ORDER BY f.form_name`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/feedback-forms:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/feedback-forms', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, form_name, csv_url } = req.body || {};
    if (!newsroom_id || !form_name || !csv_url) return res.status(400).json({ message: 'newsroom_id, form_name, csv_url required' });
    const { rows } = await pool.query(
      `INSERT INTO intake_forms (newsroom_id, form_name, csv_url, form_type) VALUES ($1,$2,$3,'feedback') RETURNING *`,
      [newsroom_id, form_name, csv_url]);
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
function aggregateResponses(rows) {
  const responses = rows.map((r) => r.response || {});
  const n = responses.length;
  const cols = [];
  for (const r of responses) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const vals = (k) => responses.map((r) => (r[k] ?? '').toString().trim()).filter(Boolean);
  // Rating columns: (almost) every non-empty value is an int 0–10. A form can have
  // several (familiarity, sentiment…), so prefer a familiarity/rating-worded header,
  // else fall back to the first such column — and always show the label so it's honest.
  const ratingCols = cols.filter((k) => {
    if (SKIP_ID.test(k)) return false;
    const vs = vals(k);
    return vs.length >= Math.max(3, n * 0.5) && vs.every((v) => /^\d{1,2}$/.test(v) && +v <= 10);
  });
  const ratingKey = ratingCols.find((k) => /familiar|rating|rate|confiden|comfort|score/i.test(k)) || ratingCols[0] || null;
  let rating = null;
  if (ratingKey) {
    const vs = vals(ratingKey);
    rating = { label: ratingKey, avg: Math.round((vs.reduce((s, v) => s + +v, 0) / vs.length) * 10) / 10 };
  }
  // List-like columns: a fair share of values contain a comma → multi-select. Tally tokens.
  const breakdowns = [];
  for (const k of cols) {
    if (SKIP_ID.test(k) || SKIP_PROSE.test(k) || (rating && k === rating.label)) continue;
    const vs = vals(k);
    if (vs.length < 3) continue;
    if (vs.filter((v) => v.includes(',')).length / vs.length < 0.3) continue;
    const tally = new Map();
    for (const v of vs) for (const tok of v.split(',').map((t) => t.trim()).filter(Boolean)) {
      const key = tok.slice(0, 40);
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count }));
    if (top.length) breakdowns.push({ question: k, top });
  }
  return { responses: n, rating, breakdowns: breakdowns.slice(0, 3) };
}

router.get('/form-insights', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: forms } = await pool.query(
      `SELECT form_name, form_type, last_synced_at FROM intake_forms
        WHERE newsroom_id = $1 AND is_enabled = true ORDER BY form_type, form_name`, [newsroomId]);
    const out = [];
    for (const f of forms) {
      const { rows } = await pool.query(
        `SELECT response FROM intake_responses WHERE newsroom_id = $1 AND form_name = $2 AND form_type = $3`,
        [newsroomId, f.form_name, f.form_type]);
      if (!rows.length) continue;
      out.push({ form_name: f.form_name, form_type: f.form_type, last_synced_at: f.last_synced_at, ...aggregateResponses(rows) });
    }
    res.json(out);
  } catch (err) { console.error('[bair-train/form-insights]', err); res.status(500).json({ message: 'Internal server error' }); }
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
