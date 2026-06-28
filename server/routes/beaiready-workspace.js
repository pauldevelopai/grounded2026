// beaiready-workspace.js — the pooled company AI workspace API.
//
// /ask runs the company AI (grounded in the company's own corpus + captured back into
// it). The rest manage the shared pool of interactions: list, search, pin the useful
// ones, promote one into durable company knowledge, or remove it. Member-reachable and
// tenant-scoped — a member only ever touches their own company's pool; an admin uses
// the X-Newsroom-Id override to work a specific client.
import { Router } from 'express';
import pool from '../db/pool.js';
import { resolveNewsroomId, OFFICE_NEWSROOM_ID } from '../lib/tenancy.js';
import { askCompanyAI } from '../services/company-ai.js';
import { createKnowledgeEntry } from '../services/knowledge.js';
import { ensureKnowhowTenantForNewsroom, ensureKnowhowPerson } from '../knowhow/identity.js';
import { addCorpusItem } from '../knowhow/corpus.js';

const router = Router();
const isAdmin = (req) => req.user?.role === 'admin';

// 3.2 — A pooled answer the team marks USEFUL accrues to the asker's private Tier-1
// KnowHow base (origin='interaction', tier defaults to 'individual'). This is how KnowHow
// grows from people's own use, not only from questions sent to them. Private to the asker
// until an admin promotes it (Gate 1); idempotent (one Tier-1 row per interaction).
async function captureUsefulInteraction(newsroomId, it) {
  if (!it.user_id) return;                         // anonymous ask — no personal base to accrue to
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [n] } = await client.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
    const tenantId = await ensureKnowhowTenantForNewsroom(client, { newsroomId, name: n?.name });
    const { rows: dup } = await client.query(
      "SELECT 1 FROM knowhow.corpus_items WHERE tenant_id = $1 AND origin = 'interaction' AND origin_id = $2 LIMIT 1",
      [tenantId, it.id]);
    if (!dup.length) {
      const { rows: [tm] } = await client.query('SELECT name FROM team_members WHERE id = $1', [it.user_id]);
      const personId = await ensureKnowhowPerson(client, { tenantId, teamMemberId: it.user_id, name: tm?.name });
      const text = `Q: ${it.question}\nA: ${it.answer || ''}`.slice(0, 8000);
      await addCorpusItem(client, { tenant_id: tenantId, person_id: personId, origin: 'interaction', origin_id: it.id, text, consent_ok: false });
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); console.error('[workspace/pin capture]', e.message); }
  finally { client.release(); }
}

async function tenant(req) {
  const newsroomId = await resolveNewsroomId(req);
  const { rows } = await pool.query(
    `SELECT n.organisation_id, o.sector_id FROM newsrooms n
       LEFT JOIN organisations o ON o.id = n.organisation_id WHERE n.id = $1`, [newsroomId]);
  return { newsroomId, organisationId: rows[0]?.organisation_id || null, sectorId: rows[0]?.sector_id || null };
}

// Ask the company's AI. Grounded, cited, captured.
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || !question.trim()) return res.status(400).json({ message: 'A question is required.' });
    if (question.length > 2000) return res.status(400).json({ message: 'Question is too long (max 2000 characters).' });
    const t = await tenant(req);
    if (t.newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'The workspace is for client businesses.' });
    const result = await askCompanyAI({ ...t, userId: req.user.id, question: question.trim() });
    res.json(result);
  } catch (err) { console.error('[workspace/ask]', err); res.status(500).json({ message: err.message || 'Ask failed' }); }
});

// The shared pool — newest (and pinned) first; optional full-text search + pinned-only.
router.get('/interactions', async (req, res) => {
  try {
    const { newsroomId } = await tenant(req);
    const { q, pinned } = req.query;
    const params = [newsroomId];
    let where = 'i.newsroom_id = $1 AND i.is_shared = true';
    if (pinned === '1') where += ' AND i.is_pinned = true';
    if (q && q.trim()) {
      params.push(q.trim());
      where += ` AND to_tsvector('english', coalesce(i.question,'') || ' ' || coalesce(i.answer,'')) @@ plainto_tsquery('english', $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT i.id, i.question, i.answer, i.sources, i.is_pinned, i.created_at,
              i.promoted_knowledge_id IS NOT NULL AS promoted, tm.name AS asked_by
         FROM bair_interactions i LEFT JOIN team_members tm ON tm.id = i.user_id
        WHERE ${where}
        ORDER BY i.is_pinned DESC, i.created_at DESC LIMIT 100`, params);
    res.json(rows);
  } catch (err) { console.error('[workspace/list]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Pin / unpin an interaction as especially useful (toggle).
router.post('/interactions/:id/pin', async (req, res) => {
  try {
    const { newsroomId } = await tenant(req);
    const { rows } = await pool.query(
      `UPDATE bair_interactions SET is_pinned = NOT is_pinned WHERE id = $1 AND newsroom_id = $2
       RETURNING id, is_pinned, question, answer, user_id`,
      [req.params.id, newsroomId]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    if (rows[0].is_pinned) await captureUsefulInteraction(newsroomId, rows[0]);   // useful → accrue to Tier 1
    res.json({ id: rows[0].id, is_pinned: rows[0].is_pinned });
  } catch (err) { console.error('[workspace/pin]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Promote a pooled answer into durable, private company knowledge — the loop turning
// an ephemeral interaction into something the AI reliably draws on going forward.
// CONSULTANT-GATED: only an admin promotes, so a team member can't turn an unvetted
// answer into "truth". Members pin useful answers; the consultant reviews + promotes.
router.post('/interactions/:id/promote', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: 'Only your Be AI Ready consultant can add answers to your knowledge. Pin the ones you find useful and they’ll review them.' });
    const { newsroomId, organisationId, sectorId } = await tenant(req);
    const { rows: [it] } = await pool.query(
      'SELECT id, question, answer, promoted_knowledge_id FROM bair_interactions WHERE id = $1 AND newsroom_id = $2',
      [req.params.id, newsroomId]);
    if (!it) return res.status(404).json({ message: 'Not found' });
    if (it.promoted_knowledge_id) return res.json({ already: true, knowledge_id: it.promoted_knowledge_id });
    const knowledgeId = await createKnowledgeEntry({
      category: 'client_insight', title: it.question.slice(0, 200), content: it.answer,
      organisationId, sectorId, visibility: 'private',
      sourceType: 'bair_workspace', sourceId: it.id, sourceDescription: 'Promoted from the company AI workspace',
      confidence: 0.7,
    });
    await pool.query('UPDATE bair_interactions SET promoted_knowledge_id = $1, is_pinned = true WHERE id = $2', [knowledgeId, it.id]);
    res.json({ knowledge_id: knowledgeId });
  } catch (err) { console.error('[workspace/promote]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Remove an interaction — the person who asked it, or an admin.
router.delete('/interactions/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenant(req);
    const cond = isAdmin(req) ? '' : ' AND user_id = $3';
    const params = isAdmin(req) ? [req.params.id, newsroomId] : [req.params.id, newsroomId, req.user.id];
    const { rowCount } = await pool.query(`DELETE FROM bair_interactions WHERE id = $1 AND newsroom_id = $2${cond}`, params);
    if (!rowCount) return res.status(404).json({ message: 'Not found (or not yours to remove)' });
    res.json({ deleted: true });
  } catch (err) { console.error('[workspace/del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
