// toolkit-social.js — the logged-in member side of the toolbox: write/edit your
// review of a tool, vote a review helpful, flag a review, and suggest a new tool.
// Mounted at /api/toolkit behind requireAuth. Public READS (review lists, stats,
// published playbooks) live in routes/public.js so visitors see them without a
// login. Reviews are global (shared across all client businesses) — the value is
// collective, like the AIKit toolbox they replace.
import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();
const uid = (req) => req.user?.id;

// ── Reviews ──────────────────────────────────────────────────────────────────
// Upsert the caller's review of a tool (one per user per tool; editing replaces).
router.post('/:slug/reviews', async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be 1–5' });
    const tool = await pool.query('SELECT 1 FROM tools WHERE slug = $1', [req.params.slug]);
    if (!tool.rowCount) return res.status(404).json({ message: 'Tool not found' });
    const comment = req.body.comment ? String(req.body.comment).slice(0, 4000) : null;
    const useCase = req.body.use_case ? String(req.body.use_case).slice(0, 200) : null;
    const { rows } = await pool.query(
      `INSERT INTO tool_reviews (tool_slug, user_id, rating, comment, use_case)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tool_slug, user_id) DO UPDATE SET
         rating = EXCLUDED.rating, comment = EXCLUDED.comment, use_case = EXCLUDED.use_case,
         is_hidden = FALSE, hidden_reason = NULL, updated_at = NOW()
       RETURNING id`,
      [req.params.slug, uid(req), rating, comment, useCase]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { console.error('[toolkit/review.upsert]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// The caller's own review of a tool (so the form can prefill).
router.get('/:slug/reviews/mine', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, rating, comment, use_case FROM tool_reviews WHERE tool_slug=$1 AND user_id=$2', [req.params.slug, uid(req)]);
    res.json(rows[0] || null);
  } catch (err) { console.error('[toolkit/review.mine]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/:slug/reviews', async (req, res) => {
  try {
    await pool.query('DELETE FROM tool_reviews WHERE tool_slug=$1 AND user_id=$2', [req.params.slug, uid(req)]);
    res.json({ ok: true });
  } catch (err) { console.error('[toolkit/review.delete]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Vote a review helpful / not helpful (one vote per user; re-voting updates).
router.post('/reviews/:id/vote', async (req, res) => {
  try {
    const helpful = req.body.is_helpful === true || req.body.is_helpful === 'true';
    const own = await pool.query('SELECT user_id FROM tool_reviews WHERE id=$1', [req.params.id]);
    if (!own.rowCount) return res.status(404).json({ message: 'Review not found' });
    if (own.rows[0].user_id === uid(req)) return res.status(400).json({ message: "You can't vote on your own review" });
    await pool.query(
      `INSERT INTO review_votes (review_id, user_id, is_helpful) VALUES ($1,$2,$3)
       ON CONFLICT (review_id, user_id) DO UPDATE SET is_helpful = EXCLUDED.is_helpful`,
      [req.params.id, uid(req), helpful]
    );
    res.json({ ok: true });
  } catch (err) { console.error('[toolkit/review.vote]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Flag a review for admin moderation.
router.post('/reviews/:id/flag', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO review_flags (review_id, user_id, reason) VALUES ($1,$2,$3)
       ON CONFLICT (review_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, is_resolved = FALSE`,
      [req.params.id, uid(req), req.body.reason ? String(req.body.reason).slice(0, 500) : null]
    );
    res.json({ ok: true });
  } catch (err) { console.error('[toolkit/review.flag]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Suggestions ──────────────────────────────────────────────────────────────
router.post('/suggestions', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Tool name is required' });
    const me = await pool.query('SELECT name FROM team_members WHERE id=$1', [uid(req)]);
    const { rows } = await pool.query(
      `INSERT INTO tool_suggestions (name, url, description, why_valuable, submitted_by, submitter_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, req.body.url || null, req.body.description || null, req.body.why_valuable || null, uid(req), me.rows[0]?.name || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { console.error('[toolkit/suggest]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.get('/suggestions/mine', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, url, status, review_notes, created_tool_slug, created_at FROM tool_suggestions WHERE submitted_by=$1 ORDER BY created_at DESC',
      [uid(req)]
    );
    res.json(rows);
  } catch (err) { console.error('[toolkit/suggest.mine]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
