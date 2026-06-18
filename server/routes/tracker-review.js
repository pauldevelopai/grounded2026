// tracker-review.js — admin review of auto-added tracker entries. The daily
// governance briefing adds source-cited lawsuits/regulations to the tracker
// (auto_added, review_status='pending'); here an admin confirms ("Keep") or
// removes a wrong one. Mounted admin-only at /api/tracker-review.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const TABLES = {
  lawsuit:    { table: 'ai_lawsuits',    nameCol: 'case_name',       dateCol: 'last_update',  events: 'ai_lawsuit_events',    fk: 'lawsuit_id' },
  regulation: { table: 'ai_regulations', nameCol: 'regulation_name', dateCol: 'updated_at',   events: 'ai_regulation_events', fk: 'regulation_id' },
};

// All auto-added entries, pending first, newest first.
router.get('/', async (req, res) => {
  try {
    const out = {};
    for (const [kind, t] of Object.entries(TABLES)) {
      const { rows } = await pool.query(
        `SELECT id, ${t.nameCol} AS name, jurisdiction, status, summary, source_url, source_origin, review_status,
                ${t.dateCol} AS dated, created_at
           FROM ${t.table} WHERE auto_added = true
          ORDER BY (review_status = 'pending') DESC, created_at DESC LIMIT 200`);
      out[kind] = rows.map((r) => ({ ...r, kind }));
    }
    res.json(out);
  } catch (err) { console.error('[tracker-review:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Keep an auto-added entry (clears it from the pending queue; stays on the tracker).
router.put('/:kind/:id/keep', async (req, res) => {
  const t = TABLES[req.params.kind];
  if (!t) return res.status(400).json({ message: 'Unknown kind' });
  try {
    const { rows } = await pool.query(
      `UPDATE ${t.table} SET review_status = 'kept', updated_at = NOW()
        WHERE id = $1 AND auto_added = true RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true, review_status: 'kept' });
  } catch (err) { console.error('[tracker-review:keep]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Remove an auto-added entry (and its events). Guarded to auto_added rows so a
// curated entry can never be deleted from here by mistake.
router.delete('/:kind/:id', async (req, res) => {
  const t = TABLES[req.params.kind];
  if (!t) return res.status(400).json({ message: 'Unknown kind' });
  try {
    const { rows } = await pool.query(`SELECT id FROM ${t.table} WHERE id = $1 AND auto_added = true`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found (or not an auto-added entry)' });
    await pool.query(`DELETE FROM ${t.events} WHERE ${t.fk} = $1`, [req.params.id]).catch(() => {});
    await pool.query(`DELETE FROM ${t.table} WHERE id = $1 AND auto_added = true`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { console.error('[tracker-review:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
