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
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { resolveNewsroomId } from '../lib/tenancy.js';
import { createKnowledgeEntry } from '../services/knowledge.js';
import { runFormsSheetSync } from '../services/forms-sync.js';

const router = Router();

async function tenantContext(req) {
  const newsroomId = await resolveNewsroomId(req);
  const { rows } = await pool.query(
    `SELECT n.organisation_id, o.sector_id FROM newsrooms n
       LEFT JOIN organisations o ON o.id = n.organisation_id WHERE n.id = $1`, [newsroomId]);
  return { newsroomId, organisationId: rows[0]?.organisation_id || null, sectorId: rows[0]?.sector_id || null };
}
const isAdmin = (req) => req.user?.role === 'admin';

// Ingest (or re-ingest) a training row's body into the shared sector knowledge base.
// Deletes any prior entry first so an edit doesn't duplicate. category = 'training_material'|'training_outcome'.
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
    title: row.title, content: row.content,
    sectorId: tenant.sectorId, organisationId: tenant.organisationId,
    sourceType: 'beaiready_training', sourceId: row.id,
    sourceDescription: category === 'training_outcome' ? 'BE AI READY training outcome' : 'BE AI READY training material',
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
    const { rows } = await pool.query(
      `INSERT INTO intake_forms (newsroom_id, form_name, csv_url) VALUES ($1,$2,$3) RETURNING *`,
      [newsroom_id, form_name, csv_url]);
    res.status(201).json(rows[0]);
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

// Pull fresh responses now (reuses the existing all-tenant sync; idempotent).
router.post('/intake-forms/sync', requireRole('admin'), async (req, res) => {
  try { const r = await runFormsSheetSync(); res.json({ ok: true, ...r }); }
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
      `SELECT * FROM training_agendas WHERE newsroom_id = $1 ${pub} ORDER BY scheduled_for DESC NULLS LAST, created_at DESC`, [newsroomId]);
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

// ── Materials (RAG-ingested) ─────────────────────────────────────────────────────
const KINDS = ['doc', 'slide', 'video', 'link', 'exercise'];

router.get('/materials', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const pub = isAdmin(req) ? '' : 'AND published = true';
    const { rows } = await pool.query(
      `SELECT * FROM training_materials WHERE newsroom_id = $1 ${pub} ORDER BY order_index, created_at`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[bair-train/materials:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/materials', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, title, description, content, url, kind, order_index, published, rag_shareable } = req.body || {};
    if (!newsroom_id || !title) return res.status(400).json({ message: 'newsroom_id, title required' });
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ message: `kind must be one of: ${KINDS.join(', ')}` });
    const { rows } = await pool.query(
      `INSERT INTO training_materials (newsroom_id, title, description, content, url, kind, order_index, published, rag_shareable, created_by)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'doc'),COALESCE($7,0),COALESCE($8,true),COALESCE($9,true),$10) RETURNING *`,
      [newsroom_id, title, description || null, content || null, url || null, kind || null,
       order_index ?? null, typeof published === 'boolean' ? published : null,
       typeof rag_shareable === 'boolean' ? rag_shareable : null, req.user.id]);
    const row = rows[0];
    const tenant = await tenantContext(req);
    await syncToRag({ table: 'training_materials', row, tenant, category: 'training_material', shouldIngest: row.rag_shareable && !!row.content });
    res.status(201).json(row);
  } catch (err) { console.error('[bair-train/materials:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/materials/:id', requireRole('admin'), async (req, res) => {
  try {
    const { title, description, content, url, kind, order_index, published, rag_shareable } = req.body || {};
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ message: `kind must be one of: ${KINDS.join(', ')}` });
    const { rows } = await pool.query(
      `UPDATE training_materials SET title = COALESCE($1,title), description = COALESCE($2,description),
         content = COALESCE($3,content), url = COALESCE($4,url), kind = COALESCE($5,kind),
         order_index = COALESCE($6,order_index), published = COALESCE($7,published),
         rag_shareable = COALESCE($8,rag_shareable), updated_at = NOW() WHERE id = $9 RETURNING *`,
      [title || null, description ?? null, content ?? null, url ?? null, kind || null,
       order_index ?? null, typeof published === 'boolean' ? published : null,
       typeof rag_shareable === 'boolean' ? rag_shareable : null, req.params.id]);
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

export default router;
