import { Router } from 'express';
import pool from '../db/pool.js';
import { callClaude } from '../services/claude.js';
import { requireRole } from '../middleware/auth.js';
import { resolveNewsroomId } from '../lib/tenancy.js';

// Feedback is a PLATFORM surface: every tenant's feedback lands in Develop AI's
// one ops queue (admin reads are cross-newsroom by design). Writes are tagged
// with the submitter's newsroom (Phase 2c) so items are attributable per-tenant.
const router = Router();

// ── Admin-only: list, update, delete, generate prompts ────────────────────────
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT f.*, t.name AS user_name FROM feedback f LEFT JOIN team_members t ON f.user_id = t.id';
    const params = [];
    if (status) { params.push(status); query += ` WHERE f.status = $${params.length}`; }
    query += ' ORDER BY f.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { content, page, category, priority } = req.body;
    if (!content) return res.status(400).json({ message: 'content required' });
    const nid = await resolveNewsroomId(req);
    const { rows } = await pool.query(
      `INSERT INTO feedback (user_id, newsroom_id, page, category, content, priority) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, nid, page || null, category || 'feature', content, priority || 'medium']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { status, priority } = req.body;
    const { rows } = await pool.query(
      `UPDATE feedback SET status = COALESCE($1, status), priority = COALESCE($2, priority), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, priority, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Feedback not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/generate-prompt', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM feedback WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Feedback not found' });
    const fb = rows[0];

    const prompt = await callClaude({
      system: `You are helping a non-technical founder talk to Claude Code about changes to their app called Tracker (Node.js/Express + React, PostgreSQL). Convert their feedback into a natural, conversational prompt they can paste into Claude Code.

Rules:
- Write as if the user is talking directly to Claude Code: "In Tracker, on the X page, I need you to..."
- Be specific about what needs to change and where, but keep it conversational
- Reference the page or feature clearly so Claude Code knows where to look
- Describe the desired behaviour in plain language
- If the feedback mentions a bug, describe what should happen instead
- Don't use technical jargon unless the feedback uses it
- Start with context ("In the Tracker app...") so it works even if pasted into a fresh Claude Code session
- Make sure you reference that this is an existing codebase and should not conflict with existing code
- Output ONLY the prompt — no explanation around it`,
      userContent: `Feedback from page "${fb.page || 'unknown'}":\nCategory: ${fb.category}\nPriority: ${fb.priority}\n\n"${fb.content}"`,
      maxTokens: 1000,
      temperature: 0.3,
    });

    await pool.query('UPDATE feedback SET claude_prompt = $1, updated_at = NOW() WHERE id = $2', [prompt, fb.id]);
    res.json({ prompt });
  } catch (err) {
    console.error('Prompt generation error:', err);
    res.status(500).json({ message: err.message || 'Prompt generation failed' });
  }
});

// Generate master prompt from all unaddressed feedback
router.post('/generate-master-prompt', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT content, page, category, priority FROM feedback WHERE status IN ('pending', 'in_progress') ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        created_at DESC`
    );
    if (rows.length === 0) return res.json({ prompt: 'No unaddressed feedback items.' });

    const feedbackList = rows.map((fb, i) =>
      `${i + 1}. [${fb.category}] [${fb.priority}] ${fb.page ? `(${fb.page}) ` : ''}${fb.content}`
    ).join('\n');

    const prompt = await callClaude({
      system: `You are helping a non-technical founder create a single comprehensive prompt for Claude Code that addresses multiple feedback items for their app called Tracker (Node.js/Express + React, PostgreSQL).

Rules:
- Combine all the feedback into one coherent, conversational prompt
- Group related items together (e.g. all UI fixes, all feature requests, all bugs)
- Write as if talking directly to Claude Code: "I need you to make these changes to Tracker..."
- Start with context about the Tracker codebase so it works in a fresh session
- Be specific about what needs to change but keep it natural language
- Reference pages and features clearly
- Mention that this is an existing codebase and changes should not break existing functionality
- Prioritise: address high priority items first
- Output ONLY the prompt`,
      userContent: `Here are ${rows.length} unaddressed feedback items:\n\n${feedbackList}`,
      maxTokens: 3000,
      temperature: 0.3,
    });

    res.json({ prompt, itemCount: rows.length });
  } catch (err) {
    console.error('Master prompt error:', err);
    res.status(500).json({ message: err.message || 'Master prompt generation failed' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM feedback WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Feedback not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
