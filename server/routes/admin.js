/**
 * routes/admin.js — the Grounded admin command-centre overview.
 *
 * GET /api/admin/overview (admin-only; mounted under the admin router which
 * already enforces requireAuth + requireRole('admin')).
 *
 * Returns a single payload tying together: users (everyone registered, with
 * last-login), a feedback summary, and AI-legal-tracker counts. Node usage
 * lives in /api/nodes/admin/overview, which the page fetches alongside this.
 */

import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// COUNT(*) for a table only if it exists — the tracker has grown table-by-table
// and we don't want the whole overview to 500 if one isn't present here.
async function countIfExists(table, where = '') {
  const { rows: [reg] } = await pool.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  if (!reg.t) return null;
  const { rows: [r] } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} ${where}`);
  return r.n;
}

router.get('/overview', async (req, res) => {
  try {
    // ── Users ──
    const { rows: users } = await pool.query(`
      SELECT id, name, email, role, is_active, tracker_access, created_at, last_login
      FROM team_members
      ORDER BY last_login DESC NULLS LAST, created_at DESC
    `);
    const userStats = {
      total: users.length,
      active: users.filter(u => u.is_active).length,
      admins: users.filter(u => u.role === 'admin').length,
      members: users.filter(u => u.role !== 'admin').length,
    };

    // ── Feedback ──
    let feedbackRecent = [];
    let feedbackStats = { total: 0, pending: 0, in_progress: 0, done: 0, dismissed: 0 };
    if (await countIfExists('feedback') !== null) {
      const { rows } = await pool.query(`
        SELECT f.id, f.content, f.category, f.priority, f.status, f.page, f.created_at,
               t.name AS user_name, t.email AS user_email
        FROM feedback f LEFT JOIN team_members t ON f.user_id = t.id
        ORDER BY f.created_at DESC LIMIT 10
      `);
      feedbackRecent = rows;
      const { rows: byStatus } = await pool.query(`SELECT status, COUNT(*)::int AS n FROM feedback GROUP BY status`);
      feedbackStats.total = byStatus.reduce((a, r) => a + r.n, 0);
      for (const r of byStatus) if (r.status in feedbackStats) feedbackStats[r.status] = r.n;
    }

    // ── AI Legal tracker ──
    const legal = {
      lawsuits: await countIfExists('ai_lawsuits'),
      regulations: await countIfExists('ai_regulations'),
      use_cases: await countIfExists('ai_legal_usecases'),
      sources: await countIfExists('ai_legal_sources'),
      pending_submissions: await countIfExists('ai_legal_user_submissions', "WHERE status = 'pending'"),
    };

    res.json({ users, userStats, feedbackRecent, feedbackStats, legal });
  } catch (err) {
    console.error('[admin/overview]', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
