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
    sectorId: tenant.sectorId, organisationId: null,    // sector-shared, not locked to one client
    sourceType: 'beaiready_training', sourceId: row.id,
    sourceDescription: RAG_SOURCE_DESC[category] || 'BE AI READY',
    confidence: 0.6,
  });
  await pool.query(`UPDATE ${table} SET knowledge_id = $1, rag_synced = true WHERE id = $2`, [knowledgeId, row.id]);
  row.knowledge_id = knowledgeId; row.rag_synced = true;   // reflect post-sync state in the response
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
    const results = await syncFormsForTenant(newsroomId);
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
        WHERE newsroom_id = $1 ORDER BY submitted_at DESC NULLS LAST, imported_at DESC LIMIT 500`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/intake-responses]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Agendas (+ items) ───────────────────────────────────────────────────────────
router.get('/agendas', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const pub = isAdmin(req) ? '' : `AND status = 'published'`;
    const { rows: agendas } = await pool.query(
      `SELECT id, newsroom_id, title, scheduled_for, location, status, notes, created_at, updated_at,
              doc_kind, doc_url, doc_name, doc_file_id, doc_synced_at, (doc_synced_text IS NOT NULL) AS doc_synced
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
      `SELECT m.*, a.title AS agenda_title, a.scheduled_for AS agenda_date
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
    const tenant = await tenantContext(req);
    await syncToRag({ table: 'training_materials', row, tenant, category: 'training_material', shouldIngest: row.rag_shareable && !!row.content });
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
    const tenant = await tenantContext(req);
    await syncToRag({ table: 'training_materials', row, tenant, category: 'training_material', shouldIngest: row.rag_shareable && !!row.content });
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
    const { rows } = await pool.query(
      `SELECT id, kind, title, url, file_id, left(extracted_text, 220) AS snippet,
              (extracted_text IS NOT NULL AND length(extracted_text) > 0) AS has_text, created_at
         FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]);
    res.json(rows);
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
      [newsroom_id, scraped.title || url, url, scraped.text, req.user.id]);
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
      [newsroom_id, req.file.originalname, doc.id, (text || '').slice(0, 20000), req.user.id]);
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
      [newsroom_id, title || 'Note', text.trim(), req.user.id]);
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
    `SELECT response FROM intake_responses WHERE newsroom_id = $1 ORDER BY submitted_at DESC NULLS LAST LIMIT 30`, [newsroomId]).catch(() => ({ rows: [] }));
  if (intake.length) {
    const lines = intake.map((r) => Object.entries(r.response || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')).filter(Boolean);
    parts.push(`Intake / staff survey responses (${intake.length}):\n${lines.join('\n').slice(0, 6000)}`);
  }
  const { rows: srcs } = await pool.query(
    `SELECT kind, title, extracted_text FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC LIMIT 20`, [newsroomId]).catch(() => ({ rows: [] }));
  for (const s of srcs) {
    if (s.extracted_text) parts.push(`[${s.kind}] ${s.title || ''}:\n${s.extracted_text.slice(0, 3000)}`);
  }
  const { rows: existing } = await pool.query(
    `SELECT kind, title FROM training_strategy_items WHERE newsroom_id = $1`, [newsroomId]).catch(() => ({ rows: [] }));
  if (existing.length) parts.push(`Existing strategy items (do not duplicate):\n${existing.map((e) => `- [${e.kind}] ${e.title}`).join('\n')}`);
  return parts.join('\n\n').slice(0, 14000);
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
    const { newsroomId, sectorId } = await tenantContext(req);
    const context = await gatherBusinessContext(newsroomId);
    if (!context.trim()) return res.json({ suggestions: [], note: 'No company knowledge yet — add intake responses, a website or a doc first.' });
    const auto = kind === 'automation';

    // Cross-company RAG: pull what's worked for similar (same-sector) businesses from
    // the shared knowledge base (training outcomes, strategies, industry insights).
    let sectorLessons = '', lessonsUsed = 0;
    try {
      const kb = await getRelevantKnowledge({ sectorId, searchTerms: `AI ${auto ? 'automation workflow' : 'goals strategy'} ${context.slice(0, 400)}`, limit: 6 });
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

export default router;
