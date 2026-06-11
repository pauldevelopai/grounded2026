// Newsroom Profile — one row PER NEWSROOM (Phase 2c), read by every tool +
// agent prompt to ground output in that newsroom. Members read/write their own
// newsroom's profile; admins can act in a selected newsroom (X-Newsroom-Id).
import { Router } from 'express';
import pool from '../db/pool.js';
import { resolveNewsroomId } from '../lib/tenancy.js';

const router = Router();
const FIELDS = ['about', 'beats', 'audience', 'strengths', 'style_notes', 'trusted_sources'];

router.get('/', async (req, res) => {
  try {
    const nid = await resolveNewsroomId(req);
    const { rows } = await pool.query(
      'SELECT * FROM newsroom_profile WHERE newsroom_id = $1 ORDER BY created_at LIMIT 1',
      [nid]
    );
    res.json(rows[0] || {});
  } catch { res.json({}); }
});

router.put('/', async (req, res) => {
  try {
    const nid = await resolveNewsroomId(req);
    const vals = FIELDS.map((k) => (req.body?.[k] ?? null));
    const { rows: existing } = await pool.query(
      'SELECT id FROM newsroom_profile WHERE newsroom_id = $1 ORDER BY created_at LIMIT 1',
      [nid]
    );
    if (existing.length) {
      const { rows } = await pool.query(
        `UPDATE newsroom_profile SET about=$1, beats=$2, audience=$3, strengths=$4, style_notes=$5, trusted_sources=$6, updated_by=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
        [...vals, req.user?.id || null, existing[0].id]
      );
      return res.json(rows[0]);
    }
    const { rows } = await pool.query(
      `INSERT INTO newsroom_profile (about, beats, audience, strengths, style_notes, trusted_sources, updated_by, newsroom_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [...vals, req.user?.id || null, nid]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: err.message }); }
});

export default router;
