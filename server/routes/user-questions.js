import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

// Outbound profiling questions WE ask logged-in users (the third floating bubble
// on the public site). Mounted behind requireAuth in index.js; the authoring +
// results endpoints add requireRole('admin') per-handler. Answers land in Postgres
// keyed to team_members.id, so they join cleanly with feedback and node telemetry.

const router = Router();

// ── Any logged-in user ────────────────────────────────────────────────────────

// The next active question this user hasn't answered yet (lowest sort_order first),
// plus how many are still pending — the bubble shows that count as a badge.
router.get('/next', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, prompt, options, category,
              COUNT(*) OVER ()::int AS pending
         FROM user_questions q
        WHERE q.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM user_question_responses r
             WHERE r.question_id = q.id AND r.user_id = $1
          )
        ORDER BY q.sort_order ASC, q.created_at ASC
        LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.json({ question: null, pending: 0 });
    const { pending, ...question } = rows[0];
    res.json({ question, pending });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Record this user's answer. One answer per user per question (UNIQUE handles repeats).
router.post('/:id/answer', async (req, res) => {
  try {
    const { choice } = req.body;
    if (!choice) return res.status(400).json({ message: 'choice required' });

    const { rows } = await pool.query(
      'SELECT options, is_active FROM user_questions WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Question not found' });
    if (!rows[0].is_active) return res.status(400).json({ message: 'Question is not active' });
    if (!rows[0].options.includes(choice)) {
      return res.status(400).json({ message: 'choice is not one of the options' });
    }

    await pool.query(
      `INSERT INTO user_question_responses (question_id, user_id, choice)
       VALUES ($1, $2, $3)
       ON CONFLICT (question_id, user_id) DO NOTHING`,
      [req.params.id, req.user.id, choice]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Admin-only: author + read ─────────────────────────────────────────────────

// All questions, newest first, with a response count each.
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT q.*, COUNT(r.id)::int AS response_count
         FROM user_questions q
         LEFT JOIN user_question_responses r ON r.question_id = q.id
        GROUP BY q.id
        ORDER BY q.sort_order ASC, q.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { prompt, options, category, sort_order } = req.body;
    if (!prompt || !Array.isArray(options) || options.filter(o => o && o.trim()).length < 2) {
      return res.status(400).json({ message: 'prompt and at least two options required' });
    }
    const clean = options.map(o => o.trim()).filter(Boolean);
    const { rows } = await pool.query(
      `INSERT INTO user_questions (prompt, options, category, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [prompt, clean, category || null, Number.isInteger(sort_order) ? sort_order : 0, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { prompt, options, category, is_active, sort_order } = req.body;
    const clean = Array.isArray(options) ? options.map(o => o.trim()).filter(Boolean) : null;
    if (clean && clean.length < 2) {
      return res.status(400).json({ message: 'at least two options required' });
    }
    const { rows } = await pool.query(
      `UPDATE user_questions SET
         prompt = COALESCE($1, prompt),
         options = COALESCE($2, options),
         category = COALESCE($3, category),
         is_active = COALESCE($4, is_active),
         sort_order = COALESCE($5, sort_order),
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [prompt ?? null, clean, category ?? null,
       typeof is_active === 'boolean' ? is_active : null,
       Number.isInteger(sort_order) ? sort_order : null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Question not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM user_questions WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Question not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Per-option tallies + total + recent named respondents.
router.get('/:id/results', requireRole('admin'), async (req, res) => {
  try {
    const q = await pool.query('SELECT * FROM user_questions WHERE id = $1', [req.params.id]);
    if (q.rows.length === 0) return res.status(404).json({ message: 'Question not found' });
    const question = q.rows[0];

    const tallyRows = await pool.query(
      `SELECT choice, COUNT(*)::int AS count
         FROM user_question_responses
        WHERE question_id = $1
        GROUP BY choice`,
      [req.params.id]
    );
    const counts = Object.fromEntries(tallyRows.rows.map(r => [r.choice, r.count]));
    const total = tallyRows.rows.reduce((sum, r) => sum + r.count, 0);

    // One row per option (including zero-count ones), in display order.
    const tally = question.options.map(opt => {
      const count = counts[opt] || 0;
      return { choice: opt, count, pct: total ? Math.round((count / total) * 100) : 0 };
    });

    const recent = await pool.query(
      `SELECT r.choice, r.created_at, t.name AS user_name
         FROM user_question_responses r
         LEFT JOIN team_members t ON r.user_id = t.id
        WHERE r.question_id = $1
        ORDER BY r.created_at DESC
        LIMIT 20`,
      [req.params.id]
    );

    res.json({ question, total, tally, recent: recent.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
