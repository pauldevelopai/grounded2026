// beaiready-knowhow.js — the MEMBER-facing KnowHow surface (mounted behind
// requireAuth + resolveTenant). Two things a team member can do for themselves:
//   • see their OWN Tier-1 knowledge & workflows (private to them), and add a workflow;
//   • ask the new-staff coach, grounded only in COMPANY-tier knowledge.
// Everything is scoped to the caller's own newsroom + own KnowHow person. Promotion to
// company tier stays admin-only (Gate 1) and lives in the admin router — never here.
import { Router } from 'express';
import pool from '../db/pool.js';
import { resolveNewsroomId, OFFICE_NEWSROOM_ID } from '../lib/tenancy.js';
import { ensureKnowhowTenantForNewsroom, ensureKnowhowPerson, knowhowTenantIdForNewsroom, knowhowPersonId } from '../knowhow/identity.js';
import { askCompanyCoach } from '../services/company-coach.js';

const router = Router();

async function ctx(req) {
  const newsroomId = await resolveNewsroomId(req);
  const { rows: [n] } = await pool.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
  return { newsroomId, name: n?.name || null };
}

// My own Tier-1 knowledge & workflows — only my rows, only individual tier.
router.get('/mine', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.json({ knowledge: [], workflows: [] });
    const tenantId = await knowhowTenantIdForNewsroom(pool, newsroomId);
    if (!tenantId) return res.json({ knowledge: [], workflows: [] });
    const personId = await knowhowPersonId(pool, { tenantId, teamMemberId: req.user.id });
    if (!personId) return res.json({ knowledge: [], workflows: [] });
    const [{ rows: knowledge }, { rows: workflows }] = await Promise.all([
      pool.query(
        `SELECT id, text, origin, created_at FROM knowhow.corpus_items
          WHERE tenant_id = $1 AND person_id = $2 AND tier = 'individual'
          ORDER BY created_at DESC LIMIT 100`, [tenantId, personId]),
      pool.query(
        `SELECT id, title, steps, created_at FROM knowhow.workflows
          WHERE tenant_id = $1 AND person_id = $2 AND tier = 'individual'
          ORDER BY created_at DESC LIMIT 100`, [tenantId, personId]),
    ]);
    res.json({ knowledge, workflows });
  } catch (err) { console.error('[beaiready-knowhow/mine]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Author one of my own workflows (Tier 1). Steps are ordered [{ step, detail }].
router.post('/workflows', async (req, res) => {
  try {
    const { newsroomId, name } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const { title, steps } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ message: 'A title is required.' });
    const clean = (Array.isArray(steps) ? steps : [])
      .map((s) => ({ step: String(s?.step || '').trim(), detail: String(s?.detail || '').trim() }))
      .filter((s) => s.step);
    if (!clean.length) return res.status(400).json({ message: 'Add at least one step.' });
    const tenantId = await ensureKnowhowTenantForNewsroom(pool, { newsroomId, name });
    const personId = await ensureKnowhowPerson(pool, { tenantId, teamMemberId: req.user.id, name: req.user.name });
    const { rows: [w] } = await pool.query(
      `INSERT INTO knowhow.workflows (tenant_id, person_id, title, steps)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING id, title, steps, created_at`,
      [tenantId, personId, title.trim(), JSON.stringify(clean)]);
    res.status(201).json(w);
  } catch (err) { console.error('[beaiready-knowhow/workflows:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Delete one of my own Tier-1 workflows (never a promoted/company one).
router.delete('/workflows/:id', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const tenantId = await knowhowTenantIdForNewsroom(pool, newsroomId);
    if (!tenantId) return res.status(404).json({ message: 'Not found' });
    const personId = await knowhowPersonId(pool, { tenantId, teamMemberId: req.user.id });
    if (!personId) return res.status(404).json({ message: 'Not found' });
    const { rowCount } = await pool.query(
      `DELETE FROM knowhow.workflows WHERE id = $1 AND tenant_id = $2 AND person_id = $3 AND tier = 'individual'`,
      [req.params.id, tenantId, personId]);
    if (!rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[beaiready-knowhow/workflows:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// The new-staff coach — grounded ONLY in company-tier knowledge.
router.post('/coach', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'The coach is for client businesses.' });
    const { question } = req.body || {};
    if (!question || !question.trim()) return res.status(400).json({ message: 'A question is required.' });
    if (question.length > 2000) return res.status(400).json({ message: 'Question is too long (max 2000 characters).' });
    const result = await askCompanyCoach({ newsroomId, question: question.trim() });
    res.json(result);
  } catch (err) { console.error('[beaiready-knowhow/coach]', err); res.status(500).json({ message: err.message || 'Coach failed' }); }
});

export default router;
