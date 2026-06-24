// prompts.js — the living, model-aware prompt library (Productivity).
// Mounted at /api behind requireAuth (before the admin router). Reads are scoped
// to the caller's org visibility (global prompts + their own tenant's), writes to
// the curated library are admin-only (requireRole('admin') — admin == trainer in
// this repo; there is no separate trainer role). Variants + feedback are scoped to
// the current user. user/org are derived from the session, never from the client.
//
// INTEGRITY RULE: validation_status='proven' is NEVER settable via the API — only
// the promptfoo validation script (npm run validate-prompts) may set it. Writes
// here accept 'draft' | 'pending' only.
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { resolveNewsroomId, OFFICE_NEWSROOM_ID } from '../lib/tenancy.js';

const router = Router();

const TASK_TYPES = ['extract', 'summarise', 'draft', 'research', 'format', 'other'];
const ROLES = ['researcher', 'boq_processor', 'admin', 'finance', 'it', 'general'];
const SOURCES = ['vendor', 'wharton', 'develop_ai', 'user_promoted', 'client'];
const MODELS = { claude: 'Claude', gpt: 'ChatGPT', gemini: 'Gemini', copilot: 'Copilot', meta: 'Meta AI', other: 'Other' };

const cleanRoles = (roles) => (Array.isArray(roles) ? roles.filter((r) => ROLES.includes(r)) : []);

// ── Curated library ─────────────────────────────────────────────────────────
// GET /prompts — global + own-tenant prompts. Filters: role, task_type, model,
// validation_status, search. When ?model= is given, that model's validation is
// surfaced on each row (model_status / model_rating / model_band).
router.get('/prompts', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { role, task_type, model, validation_status, search } = req.query;
    const params = [newsroomId];
    const where = ['(p.newsroom_id IS NULL OR p.newsroom_id = $1)'];
    if (role && ROLES.includes(role)) { params.push(JSON.stringify([role])); where.push(`p.roles @> $${params.length}::jsonb`); }
    if (task_type && TASK_TYPES.includes(task_type)) { params.push(task_type); where.push(`p.task_type = $${params.length}`); }
    if (validation_status) { params.push(validation_status); where.push(`p.validation_status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.body ILIKE $${params.length})`); }

    let join = '', cols = '';
    if (model && MODELS[model]) {
      params.push(model);
      join = `LEFT JOIN prompt_model_validations v ON v.prompt_id = p.id AND v.model_key = $${params.length}`;
      cols = ', v.status AS model_status, v.rating AS model_rating, v.band AS model_band';
    }
    const { rows } = await pool.query(
      `SELECT p.*${cols} FROM prompts p ${join}
        WHERE ${where.join(' AND ')}
        ORDER BY (p.validation_status = 'proven') DESC, p.title ASC`,
      params
    );
    res.json(rows);
  } catch (err) { console.error('[prompts:list]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// GET /prompts/:id — the prompt + all its per-model validations.
router.get('/prompts/:id', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows } = await pool.query(
      `SELECT p.*, eb.name AS updated_by_name
         FROM prompts p LEFT JOIN team_members eb ON eb.id = p.updated_by
        WHERE p.id = $1 AND (p.newsroom_id IS NULL OR p.newsroom_id = $2)`,
      [req.params.id, newsroomId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Prompt not found' });
    const { rows: validations } = await pool.query(
      `SELECT model_key, model_label, rating, band, status, evidence, validated_at
         FROM prompt_model_validations WHERE prompt_id = $1 ORDER BY model_key`, [req.params.id]);
    res.json({ ...rows[0], validations });
  } catch (err) { console.error('[prompts:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Validate a write payload; returns { error } or { value }. Never lets 'proven' through.
function validatePromptBody(b, { partial = false } = {}) {
  if (!partial && (!b.title?.trim() || !b.body?.trim())) return { error: 'title and body are required' };
  if (b.task_type && !TASK_TYPES.includes(b.task_type)) return { error: `task_type must be one of: ${TASK_TYPES.join(', ')}` };
  if (b.source && !SOURCES.includes(b.source)) return { error: `source must be one of: ${SOURCES.join(', ')}` };
  if (b.validation_status && !['draft', 'pending'].includes(b.validation_status)) {
    return { error: "validation_status may only be 'draft' or 'pending' — 'proven' is set by the validation script" };
  }
  if (b.source === 'wharton' && !b.attribution?.trim()) {
    return { error: 'attribution is required for Wharton prompts (credit Ethan & Lilach Mollick, CC-BY 4.0 + source URL)' };
  }
  return { value: true };
}

// POST /prompts — admin only.
router.post('/prompts', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const v = validatePromptBody(b);
    if (v.error) return res.status(400).json({ message: v.error });
    const { rows } = await pool.query(
      `INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, attribution, validation_status, example_input, example_output, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5,'other'),$6,$7,$8,COALESCE($9,'draft'),$10,$11,$12) RETURNING *`,
      [b.newsroom_id || null, b.title, b.body, b.description || null, b.task_type || null,
       JSON.stringify(cleanRoles(b.roles)), b.source || 'develop_ai', b.attribution || null,
       b.validation_status || null, b.example_input || null, b.example_output || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[prompts:create]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// PUT /prompts/:id — admin only. (validation_status here can only move to draft/pending.)
router.put('/prompts/:id', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body || {};
    const v = validatePromptBody(b, { partial: true });
    if (v.error) return res.status(400).json({ message: v.error });
    const { rows } = await pool.query(
      `UPDATE prompts SET
         title = COALESCE($1,title), body = COALESCE($2,body), description = COALESCE($3,description),
         task_type = COALESCE($4,task_type), roles = COALESCE($5,roles), source = COALESCE($6,source),
         attribution = COALESCE($7,attribution), validation_status = COALESCE($8,validation_status),
         example_input = COALESCE($9,example_input), example_output = COALESCE($10,example_output), updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [b.title || null, b.body || null, b.description ?? null, b.task_type || null,
       b.roles ? JSON.stringify(cleanRoles(b.roles)) : null, b.source || null, b.attribution ?? null,
       b.validation_status || null, b.example_input ?? null, b.example_output ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Prompt not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[prompts:update]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/prompts/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Prompt not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[prompts:delete]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Company prompt wiki (any member of a company can add + edit; shared) ─────
// A company prompt is scoped to the caller's newsroom. Global prompts (ours) stay
// read-only to members; only the company's OWN prompts are editable here.
router.post('/prompts/company', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    if (!newsroomId || newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'You need to belong to a company to add a company prompt.' });
    const b = req.body || {};
    if (!b.title?.trim() || !b.body?.trim()) return res.status(400).json({ message: 'title and body are required' });
    if (b.task_type && !TASK_TYPES.includes(b.task_type)) return res.status(400).json({ message: `task_type must be one of: ${TASK_TYPES.join(', ')}` });
    const { rows } = await pool.query(
      `INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, validation_status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,COALESCE($5,'other'),$6,'client','draft',$7,$7) RETURNING *`,
      [newsroomId, b.title, b.body, b.description || null, b.task_type || null, JSON.stringify(cleanRoles(b.roles)), req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[prompts:company:create]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/prompts/company/:id', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const b = req.body || {};
    if (b.task_type && !TASK_TYPES.includes(b.task_type)) return res.status(400).json({ message: `task_type must be one of: ${TASK_TYPES.join(', ')}` });
    // WHERE newsroom_id = caller's company → members can only edit their own
    // company's prompts (global/ours won't match → 404). Wiki: records updated_by.
    const { rows } = await pool.query(
      `UPDATE prompts SET title = COALESCE($1,title), body = COALESCE($2,body), description = COALESCE($3,description),
         task_type = COALESCE($4,task_type), roles = COALESCE($5,roles), updated_by = $6, updated_at = NOW()
       WHERE id = $7 AND newsroom_id = $8 RETURNING *`,
      [b.title || null, b.body || null, b.description ?? null, b.task_type || null,
       b.roles ? JSON.stringify(cleanRoles(b.roles)) : null, req.user.id, req.params.id, newsroomId]);
    if (!rows.length) return res.status(404).json({ message: 'Prompt not found, or it isn’t one of your company’s own prompts.' });
    res.json(rows[0]);
  } catch (err) { console.error('[prompts:company:update]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Admin: push a prompt we think is good directly to ONE company (a company-scoped
// copy, source=develop_ai, that that company's members then see).
router.post('/admin/prompts/:id/share', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id } = req.body || {};
    if (!newsroom_id) return res.status(400).json({ message: 'newsroom_id (the company) is required' });
    const { rows: [src] } = await pool.query('SELECT * FROM prompts WHERE id = $1', [req.params.id]);
    if (!src) return res.status(404).json({ message: 'Prompt not found' });
    const { rows } = await pool.query(
      `INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, attribution, example_input, example_output, validation_status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,'develop_ai',$7,$8,$9,'draft',$10,$10) RETURNING *`,
      [newsroom_id, src.title, src.body, src.description, src.task_type, JSON.stringify(src.roles || []), src.attribution, src.example_input, src.example_output, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[prompts:share]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── A user's personal variants (the living cheat-sheet) ─────────────────────
router.get('/me/prompt-variants', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM user_prompt_variants WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) { console.error('[variants:list]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/me/prompt-variants', async (req, res) => {
  try {
    const { source_prompt_id, title, body, notes, preferred_model } = req.body || {};
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ message: 'title and body are required' });
    const { rows } = await pool.query(
      `INSERT INTO user_prompt_variants (user_id, source_prompt_id, title, body, notes, preferred_model)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, source_prompt_id || null, title, body, notes || null, preferred_model || null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[variants:create]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/me/prompt-variants/:id', async (req, res) => {
  try {
    const { title, body, notes, preferred_model } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE user_prompt_variants SET title = COALESCE($1,title), body = COALESCE($2,body),
         notes = COALESCE($3,notes), preferred_model = COALESCE($4,preferred_model), updated_at = NOW()
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [title || null, body || null, notes ?? null, preferred_model ?? null, req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'Variant not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[variants:update]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/me/prompt-variants/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM user_prompt_variants WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ message: 'Variant not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[variants:delete]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Feedback (the learning signal) ──────────────────────────────────────────
router.post('/prompts/:id/feedback', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows: p } = await pool.query(
      'SELECT id FROM prompts WHERE id = $1 AND (newsroom_id IS NULL OR newsroom_id = $2)', [req.params.id, newsroomId]);
    if (!p.length) return res.status(404).json({ message: 'Prompt not found' });
    const { model_key, rating, comment, suggested_edit } = req.body || {};
    if (model_key && !MODELS[model_key]) return res.status(400).json({ message: 'invalid model_key' });
    const r = rating == null ? null : Number(rating);
    if (r != null && (!Number.isInteger(r) || r < 1 || r > 5)) return res.status(400).json({ message: 'rating must be 1–5' });
    const { rows } = await pool.query(
      `INSERT INTO prompt_feedback (prompt_id, user_id, model_key, rating, comment, suggested_edit)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, req.user.id, model_key || null, r, comment || null, suggested_edit || null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[feedback:create]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Curation queue (admin/trainer) ──────────────────────────────────────────
router.get('/admin/feedback', requireRole('admin'), async (req, res) => {
  try {
    const status = req.query.status || 'new';
    const { rows } = await pool.query(
      `SELECT f.*, p.title AS prompt_title, p.source AS prompt_source, p.validation_status,
              tm.name AS user_name
         FROM prompt_feedback f
         JOIN prompts p ON p.id = f.prompt_id
         LEFT JOIN team_members tm ON tm.id = f.user_id
        WHERE f.status = $1
        ORDER BY (f.suggested_edit IS NOT NULL) DESC, f.created_at DESC`, [status]);
    res.json(rows);
  } catch (err) { console.error('[admin/feedback]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Promote a suggested edit into a new curated prompt (source=user_promoted, pending).
router.post('/admin/feedback/:id/promote', requireRole('admin'), async (req, res) => {
  try {
    const { rows: fb } = await pool.query(
      `SELECT f.*, p.title, p.body, p.description, p.task_type, p.roles, p.newsroom_id
         FROM prompt_feedback f JOIN prompts p ON p.id = f.prompt_id WHERE f.id = $1`, [req.params.id]);
    if (!fb.length) return res.status(404).json({ message: 'Feedback not found' });
    const f = fb[0];
    const body = (f.suggested_edit && f.suggested_edit.trim()) || f.body;
    const { rows: created } = await pool.query(
      `INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, validation_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'user_promoted','pending',$7) RETURNING *`,
      [f.newsroom_id || null, `${f.title} (community)`, body, f.description || null, f.task_type, JSON.stringify(f.roles || []), req.user.id]);
    await pool.query("UPDATE prompt_feedback SET status = 'promoted', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.status(201).json({ promoted: created[0] });
  } catch (err) { console.error('[admin/feedback/promote]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/admin/feedback/:id/dismiss', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query("UPDATE prompt_feedback SET status = 'dismissed', updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Feedback not found' });
    res.json({ dismissed: true });
  } catch (err) { console.error('[admin/feedback/dismiss]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
