// LeadFinder API — the L2B-facing surface's backend (build brief Phase 2).
// Mounted at /api/beaiready/leadfinder with requireAuth + resolveTenant, so every
// query is scoped to the caller's own tenant (Wall 1 — L2B sees only L2B).
//
// Surfaces: the morning digest (ranked by conversion likelihood), the amber
// review queue (evidence + accept/reject/reason), retrospective outcome feedback
// (did it convert?), and the two config editors the user owns (sources +
// criteria). Plus a manual run trigger and the reweight proposal (stub).

import { Router } from 'express';
import fs from 'node:fs';
import pool from '../db/pool.js';
import { resolveNewsroomId } from '../lib/tenancy.js';
import { upload } from '../middleware/upload.js';
import { extractText } from '../services/document-processor.js';
import {
  runPipeline, ensureSource, ensureStarterCriteria, getActiveCriteria, ingestTender,
} from '../services/leadfinder/pipeline.js';
import { fetchSource } from '../services/leadfinder/fetch.js';
import { proposeReweight } from '../services/leadfinder/reweight.js';

const router = Router();

// Every tender op must belong to the caller's tenant.
async function tenderInTenant(id, newsroomId) {
  const { rows: [t] } = await pool.query(
    'SELECT id FROM leadfinder.tenders WHERE id = $1 AND newsroom_id = $2', [id, newsroomId]
  );
  return !!t;
}

// ── Morning digest: latest run + today's leads ranked by conversion likelihood ─
router.get('/digest', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows: [run] } = await pool.query(
      `SELECT id, started_at, finished_at, items_seen, items_new, tenders_green, tenders_amber, tenders_red, status
         FROM leadfinder.runs WHERE newsroom_id = $1 ORDER BY started_at DESC LIMIT 1`, [newsroomId]);
    // Ranked open leads: green + amber, highest score first (the "leads to follow today").
    const { rows: leads } = await pool.query(
      `SELECT t.id, t.reference_no, t.issuing_body, t.title, t.closing_date, t.estimated_value,
              t.total_score, t.band, t.status, t.routing_reason,
              (SELECT COUNT(*) FROM leadfinder.tender_flags f WHERE f.tender_id = t.id) AS flags
         FROM leadfinder.tenders t
        WHERE t.newsroom_id = $1 AND t.band IN ('green','amber') AND t.status IN ('qualified','needs_review')
        ORDER BY t.total_score DESC NULLS LAST, t.closing_date ASC NULLS LAST LIMIT 100`, [newsroomId]);
    res.json({ run: run || null, leads });
  } catch (err) { console.error('[lf/digest]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Tenders list (filterable) ───────────────────────────────────────────────
router.get('/tenders', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { band, status } = req.query;
    const clauses = ['newsroom_id = $1']; const params = [newsroomId];
    if (band)   { params.push(band);   clauses.push(`band = $${params.length}`); }
    if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT id, reference_no, issuing_body, title, closing_date, estimated_value, total_score, band, status, ingested_at
         FROM leadfinder.tenders WHERE ${clauses.join(' AND ')}
        ORDER BY total_score DESC NULLS LAST LIMIT 200`, params);
    res.json(rows);
  } catch (err) { console.error('[lf/tenders]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── One tender: full record + evidence flags + any decision/outcome ─────────
router.get('/tenders/:id', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows: [t] } = await pool.query(
      'SELECT * FROM leadfinder.tenders WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    if (!t) return res.status(404).json({ message: 'Not found' });
    const { rows: flags } = await pool.query(
      'SELECT flag_type, severity, confidence, evidence_note FROM leadfinder.tender_flags WHERE tender_id = $1 ORDER BY severity DESC', [t.id]);
    const { rows: [decision] } = await pool.query(
      'SELECT decision, reason, decided_at FROM leadfinder.review_decisions WHERE tender_id = $1 ORDER BY decided_at DESC LIMIT 1', [t.id]);
    const { rows: [outcome] } = await pool.query(
      'SELECT outcome, converted, rating, note, recorded_at FROM leadfinder.lead_outcomes WHERE tender_id = $1 ORDER BY recorded_at DESC LIMIT 1', [t.id]);
    res.json({ ...t, flags, decision: decision || null, outcome: outcome || null });
  } catch (err) { console.error('[lf/tender]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Upload a tender doc → extract + score + route immediately (always-on source) ─
router.post('/tenders/upload', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const newsroomId = await resolveNewsroomId(req);
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const text = await extractText(filePath, req.file.mimetype);
    if (!text || !text.trim()) return res.status(422).json({ message: 'Could not read any text from that file.' });
    const sourceId = await ensureSource(newsroomId, { name: 'Manual uploads', kind: 'upload', origin: 'human' });
    const criteria = await ensureStarterCriteria(newsroomId, req.user?.id || null);
    const result = await ingestTender({
      newsroomId, sourceId, criteria, text,
      externalId: `upload:${req.file.originalname}:${Date.now()}`, url: null,
    });
    res.status(201).json(result);
  } catch (err) {
    console.error('[lf/upload]', err);
    res.status(500).json({ message: err.message || 'Could not process the document.' });
  } finally {
    if (filePath) fs.unlink(filePath, () => {});
  }
});

// ── Amber-queue decision: accept/reject + reason (learning signal) ──────────
router.post('/tenders/:id/review', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    if (!(await tenderInTenant(req.params.id, newsroomId))) return res.status(404).json({ message: 'Not found' });
    const { decision, reason } = req.body || {};
    if (!['accept', 'reject'].includes(decision)) return res.status(400).json({ message: 'decision must be accept or reject' });
    await pool.query(
      `INSERT INTO leadfinder.review_decisions (tender_id, newsroom_id, decision, reason, decided_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, newsroomId, decision, reason || null, req.user?.id || null]);
    // Resolve the tender out of the review queue; accept keeps it qualified-equivalent.
    await pool.query(
      `UPDATE leadfinder.tenders SET status = $2, updated_at = NOW() WHERE id = $1`,
      [req.params.id, decision === 'accept' ? 'qualified' : 'rejected']);
    res.json({ ok: true });
  } catch (err) { console.error('[lf/review]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Retrospective outcome feedback: did this lead convert? (learning ground truth) ─
router.post('/tenders/:id/outcome', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    if (!(await tenderInTenant(req.params.id, newsroomId))) return res.status(404).json({ message: 'Not found' });
    const { outcome, converted, rating, note } = req.body || {};
    if (!outcome) return res.status(400).json({ message: 'outcome is required' });
    await pool.query(
      `INSERT INTO leadfinder.lead_outcomes (tender_id, newsroom_id, outcome, converted, rating, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.id, newsroomId, String(outcome).slice(0, 16),
       typeof converted === 'boolean' ? converted : null,
       Number.isInteger(rating) ? rating : null, note || null, req.user?.id || null]);
    res.json({ ok: true });
  } catch (err) { console.error('[lf/outcome]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Config A: sources (user-owned, editable in-app) ─────────────────────────
router.get('/sources', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows } = await pool.query(
      `SELECT id, name, kind, location, active, run_frequency_hours, origin, approved, rationale,
              last_run_at, last_success_at, last_error, items_new
         FROM leadfinder.sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[lf/sources]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/sources', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { name, kind, location, run_frequency_hours, config } = req.body || {};
    if (!name || !kind) return res.status(400).json({ message: 'name and kind are required' });
    const { rows: [row] } = await pool.query(
      `INSERT INTO leadfinder.sources (newsroom_id, name, kind, location, run_frequency_hours, config, origin, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,'human',$7) RETURNING id`,
      [newsroomId, String(name).slice(0, 300), String(kind).slice(0, 20), location || null,
       parseInt(run_frequency_hours, 10) || 24, JSON.stringify(config || {}), req.user?.id || null]);
    res.status(201).json(row);
  } catch (err) { console.error('[lf/sources/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/sources/:id', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { name, location, active, run_frequency_hours, approved, config } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE leadfinder.sources SET
         name = COALESCE($3, name), location = COALESCE($4, location),
         active = COALESCE($5, active), run_frequency_hours = COALESCE($6, run_frequency_hours),
         approved = COALESCE($7, approved), config = COALESCE($8::jsonb, config), updated_at = NOW()
       WHERE id = $1 AND newsroom_id = $2 RETURNING id`,
      [req.params.id, newsroomId, name ?? null, location ?? null,
       typeof active === 'boolean' ? active : null,
       Number.isInteger(run_frequency_hours) ? run_frequency_hours : null,
       typeof approved === 'boolean' ? approved : null,
       config ? JSON.stringify(config) : null]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) { console.error('[lf/sources/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/sources/:id', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rowCount } = await pool.query(
      'DELETE FROM leadfinder.sources WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    if (!rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) { console.error('[lf/sources/del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Config B: criteria (versioned; a tune creates a new active version) ─────
router.get('/criteria', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const criteria = await ensureStarterCriteria(newsroomId, req.user?.id || null);
    res.json(criteria);
  } catch (err) { console.error('[lf/criteria]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Tune criteria = save a new version (never overwrite — auditable, brief §5).
router.post('/criteria', async (req, res) => {
  const client = await pool.connect();
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { thresholds, weights } = req.body || {};
    if (!Array.isArray(weights) || !weights.length) return res.status(400).json({ message: 'weights are required' });
    await client.query('BEGIN');
    const { rows: [mx] } = await client.query(
      'SELECT COALESCE(MAX(version),0) AS v FROM leadfinder.criteria_versions WHERE newsroom_id = $1', [newsroomId]);
    await client.query(
      `UPDATE leadfinder.criteria_versions SET status = 'archived' WHERE newsroom_id = $1 AND status = 'active'`, [newsroomId]);
    const { rows: [ver] } = await client.query(
      `INSERT INTO leadfinder.criteria_versions (newsroom_id, version, status, thresholds, notes, created_by, activated_at)
       VALUES ($1,$2,'active',$3::jsonb,$4,$5,NOW()) RETURNING id, version`,
      [newsroomId, mx.v + 1, JSON.stringify(thresholds || {}), req.body.notes || 'Tuned in LeadFinder', req.user?.id || null]);
    for (const w of weights) {
      await client.query(
        `INSERT INTO leadfinder.criteria_weights (criteria_version_id, component, weight, source, rule)
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [ver.id, String(w.component).slice(0, 60), Number(w.weight) || 1.0, w.source === 'learned' ? 'learned' : 'prior', JSON.stringify(w.rule || {})]);
    }
    await client.query('COMMIT');
    res.status(201).json(await getActiveCriteria(newsroomId));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[lf/criteria/post]', err); res.status(500).json({ message: 'Internal server error' });
  } finally { client.release(); }
});

// ── Reweight proposal (stub — propose-only, human-gated) ────────────────────
router.get('/reweight/proposal', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    res.json(await proposeReweight(newsroomId));
  } catch (err) { console.error('[lf/reweight]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Manual run: fetch the tenant's active sources now + process ─────────────
router.post('/run', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows: sources } = await pool.query(
      `SELECT * FROM leadfinder.sources WHERE newsroom_id = $1 AND active = true AND approved = true`, [newsroomId]);
    const items = []; const notes = [];
    for (const s of sources) {
      const { items: got, note } = await fetchSource(s);
      items.push(...got);
      if (note) notes.push(`${s.name}: ${note}`);
    }
    if (!items.length) return res.json({ ran: false, notes, message: 'No new items from active sources. Upload a tender to see it scored.' });
    const out = await runPipeline({ newsroomId, sourceId: null, items, createdBy: req.user?.id || null });
    res.json({ ran: true, ...out, notes });
  } catch (err) { console.error('[lf/run]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
