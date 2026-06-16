// toolkit-admin.js — admin-only CRUD for the AI toolbox catalogue (the `tools`
// table that powers /toolbox, the Finder and the CDI Explorer). Mounted at
// /api/toolkit-admin behind requireAuth + requireRole('admin'). Lets a BE AI
// READY admin add, edit, score and remove tools. The public /public/toolkit
// route reads the same table, so edits here show on the site after a rebuild.
import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// Columns an admin may set. cdi_* are 0–10 smallints; tags/categories/similar_tools are JSONB arrays.
const TEXT_FIELDS = ['name', 'url', 'primary_category', 'description', 'purpose', 'comments', 'time_saved', 'time_reinvestment', 'sovereign_alternative'];
const CDI_FIELDS = ['cdi_cost', 'cdi_difficulty', 'cdi_invasiveness'];
const JSON_FIELDS = ['categories', 'tags', 'similar_tools'];

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);

// Coerce a CDI value to an int 0–10 or null; reject anything else.
function cdi(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 10) return undefined; // undefined = invalid
  return n;
}

// Build the {column: value} map from a request body, validating as we go.
// Returns { values } or { error }.
function collect(body, { partial }) {
  const values = {};
  for (const f of TEXT_FIELDS) {
    if (f in body) values[f] = body[f] === '' ? null : String(body[f]);
  }
  for (const f of CDI_FIELDS) {
    if (f in body) {
      const n = cdi(body[f]);
      if (n === undefined) return { error: `${f} must be a whole number 0–10` };
      values[f] = n;
    }
  }
  for (const f of JSON_FIELDS) {
    if (f in body) {
      const arr = Array.isArray(body[f]) ? body[f] : (typeof body[f] === 'string' && body[f].trim() ? body[f].split(',').map((s) => s.trim()).filter(Boolean) : []);
      values[f] = JSON.stringify(arr);
    }
  }
  // categories defaults to [primary_category] when a category is set but categories isn't.
  if (!('categories' in values) && values.primary_category && !partial) {
    values.categories = JSON.stringify([values.primary_category]);
  }
  return { values };
}

// GET /api/toolkit-admin — full catalogue (all fields) + distinct categories.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, url, primary_category, categories, description, purpose,
              cdi_cost, cdi_difficulty, cdi_invasiveness, comments, time_saved,
              time_reinvestment, tags, similar_tools, sovereign_alternative, updated_at
         FROM tools ORDER BY primary_category ASC NULLS LAST, name ASC`
    );
    const cats = await pool.query(
      `SELECT primary_category AS name, COUNT(*)::int AS count FROM tools
        WHERE primary_category IS NOT NULL GROUP BY primary_category ORDER BY primary_category`
    );
    res.json({ items: rows, categories: cats.rows });
  } catch (err) {
    console.error('[toolkit-admin/list]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/toolkit-admin — create a tool.
router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const slug = slugify(req.body.slug || name);
    if (!slug) return res.status(400).json({ message: 'Could not derive a slug from the name' });

    const { values, error } = collect(req.body, { partial: false });
    if (error) return res.status(400).json({ message: error });
    values.name = name;
    if (!('categories' in values)) values.categories = JSON.stringify(values.primary_category ? [values.primary_category] : []);

    const cols = ['slug', ...Object.keys(values)];
    const params = [slug, ...Object.values(values)];
    const placeholders = cols.map((c, i) => (JSON_FIELDS.includes(c) ? `$${i + 1}::jsonb` : `$${i + 1}`));
    const { rows } = await pool.query(
      `INSERT INTO tools (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING slug`,
      params
    );
    res.status(201).json({ slug: rows[0].slug });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A tool with that slug already exists' });
    console.error('[toolkit-admin/create]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/toolkit-admin/:slug — update fields.
router.patch('/:slug', async (req, res) => {
  try {
    const { values, error } = collect(req.body, { partial: true });
    if (error) return res.status(400).json({ message: error });
    if (Object.keys(values).length === 0) return res.status(400).json({ message: 'Nothing to update' });

    const sets = Object.keys(values).map((c, i) => `${c} = $${i + 2}${JSON_FIELDS.includes(c) ? '::jsonb' : ''}`);
    sets.push('updated_at = NOW()');
    const { rowCount } = await pool.query(
      `UPDATE tools SET ${sets.join(', ')} WHERE slug = $1`,
      [req.params.slug, ...Object.values(values)]
    );
    if (rowCount === 0) return res.status(404).json({ message: 'Tool not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[toolkit-admin/update]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/toolkit-admin/:slug — remove a tool.
router.delete('/:slug', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tools WHERE slug = $1', [req.params.slug]);
    if (rowCount === 0) return res.status(404).json({ message: 'Tool not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[toolkit-admin/delete]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Suggestions queue (admin) ────────────────────────────────────────────────
router.get('/suggestions', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) { params.push(status); where = 'WHERE status = $1'; }
    const { rows } = await pool.query(
      `SELECT id, name, url, description, why_valuable, submitter_name, status, review_notes,
              created_tool_slug, created_at, reviewed_at
         FROM tool_suggestions ${where} ORDER BY (status = 'pending') DESC, created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { console.error('[toolkit-admin/suggestions]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Approve a suggestion. By default seeds a draft tool (no scores yet) the admin
// then opens and scores; pass {create:false} to just mark it approved.
router.post('/suggestions/:id/approve', async (req, res) => {
  try {
    const sug = await pool.query("SELECT * FROM tool_suggestions WHERE id = $1", [req.params.id]);
    if (!sug.rowCount) return res.status(404).json({ message: 'Suggestion not found' });
    const s = sug.rows[0];
    let createdSlug = null;
    if (req.body.create !== false) {
      let base = slugify(s.name) || 'tool';
      for (let i = 0; i < 50; i++) {
        const candidate = i === 0 ? base : `${base}-${i + 1}`;
        try {
          await pool.query(
            'INSERT INTO tools (slug, name, url, description, categories) VALUES ($1,$2,$3,$4,$5::jsonb)',
            [candidate, s.name, s.url, s.description, '[]']
          );
          createdSlug = candidate; break;
        } catch (e) { if (e.code !== '23505') throw e; }
      }
    }
    await pool.query(
      `UPDATE tool_suggestions SET status='approved', reviewed_by=$2, reviewed_at=NOW(),
              review_notes=$3, created_tool_slug=$4, updated_at=NOW() WHERE id=$1`,
      [req.params.id, req.user.id, req.body.notes || null, createdSlug]
    );
    res.json({ ok: true, slug: createdSlug });
  } catch (err) { console.error('[toolkit-admin/suggestion.approve]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/suggestions/:id/reject', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE tool_suggestions SET status='rejected', reviewed_by=$2, reviewed_at=NOW(), review_notes=$3, updated_at=NOW() WHERE id=$1`,
      [req.params.id, req.user.id, req.body.notes || null]
    );
    if (!rowCount) return res.status(404).json({ message: 'Suggestion not found' });
    res.json({ ok: true });
  } catch (err) { console.error('[toolkit-admin/suggestion.reject]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Review moderation (admin) ────────────────────────────────────────────────
router.get('/reviews/flagged', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.tool_slug, t.name AS tool_name, r.rating, r.comment, r.use_case, r.is_hidden,
              tm.name AS author_name, r.created_at,
              (SELECT COUNT(*)::int FROM review_flags f WHERE f.review_id = r.id AND NOT f.is_resolved) AS open_flags,
              (SELECT string_agg(f.reason, ' | ') FROM review_flags f WHERE f.review_id = r.id AND NOT f.is_resolved) AS flag_reasons
         FROM tool_reviews r JOIN team_members tm ON tm.id = r.user_id JOIN tools t ON t.slug = r.tool_slug
        WHERE EXISTS (SELECT 1 FROM review_flags f WHERE f.review_id = r.id AND NOT f.is_resolved) OR r.is_hidden
        ORDER BY open_flags DESC, r.created_at DESC`
    );
    res.json(rows);
  } catch (err) { console.error('[toolkit-admin/reviews.flagged]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/reviews/:id/hide', async (req, res) => {
  try {
    await pool.query('UPDATE tool_reviews SET is_hidden=TRUE, hidden_reason=$2, updated_at=NOW() WHERE id=$1', [req.params.id, req.body.reason || null]);
    await pool.query('UPDATE review_flags SET is_resolved=TRUE WHERE review_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error('[toolkit-admin/review.hide]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/reviews/:id/unhide', async (req, res) => {
  try {
    await pool.query('UPDATE tool_reviews SET is_hidden=FALSE, hidden_reason=NULL, updated_at=NOW() WHERE id=$1', [req.params.id]);
    await pool.query('UPDATE review_flags SET is_resolved=TRUE WHERE review_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error('[toolkit-admin/review.unhide]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Playbook editing (admin) ─────────────────────────────────────────────────
router.get('/:slug/playbook', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tool_playbooks WHERE tool_slug = $1', [req.params.slug]);
    res.json(rows[0] || null);
  } catch (err) { console.error('[toolkit-admin/playbook.get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/:slug/playbook', async (req, res) => {
  try {
    const tool = await pool.query('SELECT 1 FROM tools WHERE slug = $1', [req.params.slug]);
    if (!tool.rowCount) return res.status(404).json({ message: 'Tool not found' });
    const status = req.body.status === 'published' ? 'published' : 'draft';
    const feats = Array.isArray(req.body.key_features) ? req.body.key_features
      : (typeof req.body.key_features === 'string' && req.body.key_features.trim() ? req.body.key_features.split('\n').map((s) => s.trim()).filter(Boolean) : []);
    const text = (k) => (req.body[k] ? String(req.body[k]) : null);
    await pool.query(
      `INSERT INTO tool_playbooks (tool_slug, status, best_use_cases, implementation_steps, common_mistakes, privacy_notes, key_features, generated_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'admin',$8)
       ON CONFLICT (tool_slug) DO UPDATE SET
         status=EXCLUDED.status, best_use_cases=EXCLUDED.best_use_cases, implementation_steps=EXCLUDED.implementation_steps,
         common_mistakes=EXCLUDED.common_mistakes, privacy_notes=EXCLUDED.privacy_notes, key_features=EXCLUDED.key_features,
         updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [req.params.slug, status, text('best_use_cases'), text('implementation_steps'), text('common_mistakes'), text('privacy_notes'), JSON.stringify(feats), req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { console.error('[toolkit-admin/playbook.put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
