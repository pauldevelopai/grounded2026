// Workflow engine API — Phase 1.
//   GET  /blocks                 the palette (Nodes now; tools + agents later)
//   GET  /                       list workflows
//   POST /                       create a workflow
//   GET  /:id                    one workflow
//   PUT  /:id                    update (name/definition/framing/status)
//   DELETE /:id                  delete
//   POST /:id/run                run a saved workflow ({ input })
//   POST /run                    run an ad-hoc definition ({ definition, input }) — composer test
//   GET  /:id/runs               recent run history
import { Router } from 'express';
import pool from '../db/pool.js';
import blocks from '../services/blocks/registry.js';
import '../services/blocks/nodes.js'; // side-effect: registers the Node blocks
import '../services/blocks/tools.js'; // side-effect: registers the operations-tool blocks
import '../services/blocks/agents.js'; // side-effect: registers the journalism-agent blocks
import { runWorkflow } from '../services/workflows/runner.js';
import { generateFromDescription } from '../services/workflows/generate.js';
import { resolveNewsroomId, runWithNewsroom } from '../lib/tenancy.js';

const router = Router();
const COOKIE = process.env.AUTH_COOKIE || 'tracker_token';

function slugify(s) {
  return String(s || 'workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'workflow';
}
function ctxFrom(req, newsroomId) {
  return {
    userId: req.user?.id || null,
    newsroomId: newsroomId || null,
    authToken: req.cookies?.[COOKIE] || null,
    origin: process.env.PUBLIC_BASE_URL || `https://${req.get('host')}`,
  };
}

// ── Palette ──────────────────────────────────────────────────────────────────
router.get('/blocks', (req, res) => {
  res.json({ blocks: blocks.list() });
});

// ── Describe & build: draft a workflow graph from plain English ───────────────
router.post('/generate', async (req, res) => {
  try {
    const out = await generateFromDescription({ description: req.body?.description });
    res.json(out);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Workflow CRUD — all scoped to the active newsroom (Phase 2c) ─────────────
router.get('/', async (req, res) => {
  const nid = await resolveNewsroomId(req);
  const { rows } = await pool.query(
    `SELECT w.*, t.name AS created_by_name
       FROM workflows w LEFT JOIN team_members t ON t.id = w.created_by
      WHERE w.newsroom_id = $1
      ORDER BY w.updated_at DESC`,
    [nid]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  try {
    const { name, description, definition, problem_statement, problem_category, user_instructions, trigger_phrase } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name required' });
    const nid = await resolveNewsroomId(req);
    let slug = slugify(name);
    // ensure unique slug (slug index is global, so check globally)
    const exists = await pool.query('SELECT 1 FROM workflows WHERE slug = $1', [slug]);
    if (exists.rowCount) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const { rows } = await pool.query(
      `INSERT INTO workflows (created_by, newsroom_id, name, slug, description, definition, problem_statement, problem_category, user_instructions, trigger_phrase)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::jsonb,'{"nodes":[],"edges":[],"inputs":[],"output":null}'::jsonb),$7,$8,$9,$10) RETURNING *`,
      [req.user?.id || null, nid, name, slug, description || null,
       definition ? JSON.stringify(definition) : null,
       problem_statement || null, problem_category || null, user_instructions || null, trigger_phrase || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  const nid = await resolveNewsroomId(req);
  const { rows } = await pool.query('SELECT * FROM workflows WHERE id = $1 AND newsroom_id = $2', [req.params.id, nid]);
  if (!rows.length) return res.status(404).json({ message: 'not found' });
  res.json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const fields = ['name', 'description', 'definition', 'problem_statement', 'problem_category', 'user_instructions', 'trigger_phrase', 'status', 'is_shared'];
  const sets = [], params = [];
  for (const f of fields) {
    if (f in (req.body || {})) {
      params.push(f === 'definition' ? JSON.stringify(req.body[f]) : req.body[f]);
      sets.push(`${f} = $${params.length}${f === 'definition' ? '::jsonb' : ''}`);
    }
  }
  if (!sets.length) return res.status(400).json({ message: 'no fields' });
  const nid = await resolveNewsroomId(req);
  params.push(req.params.id, nid);
  const { rows } = await pool.query(
    `UPDATE workflows SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length - 1} AND newsroom_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows.length) return res.status(404).json({ message: 'not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const nid = await resolveNewsroomId(req);
  await pool.query('DELETE FROM workflows WHERE id = $1 AND newsroom_id = $2', [req.params.id, nid]);
  res.json({ ok: true });
});

// ── Run ────────────────────────────────────────────────────────────────────────
async function execute(definition, input, req, res, workflowId) {
  const started = Date.now();
  const nid = await resolveNewsroomId(req);
  const { rows: runRows } = await pool.query(
    `INSERT INTO workflow_runs (workflow_id, user_id, newsroom_id, status, input) VALUES ($1,$2,$3,'running',$4::jsonb) RETURNING id`,
    [workflowId || null, req.user?.id || null, nid, JSON.stringify(input || {})]
  );
  const runId = runRows[0].id;
  try {
    // Ambient tenancy: every block in this run (incl. the profile loader that
    // grounds the agents) sees THIS newsroom.
    const { output, nodeOutputs } = await runWithNewsroom(nid, () => runWorkflow(definition, input || {}, ctxFrom(req, nid)));
    const ms = Date.now() - started;
    await pool.query(
      `UPDATE workflow_runs SET status='completed', output=$1::jsonb, node_outputs=$2::jsonb, duration_ms=$3, completed_at=NOW() WHERE id=$4`,
      [JSON.stringify(output ?? null), JSON.stringify(nodeOutputs ?? {}), ms, runId]
    );
    res.json({ run_id: runId, status: 'completed', output, node_outputs: nodeOutputs, duration_ms: ms });
  } catch (err) {
    await pool.query(`UPDATE workflow_runs SET status='failed', error=$1, duration_ms=$2, completed_at=NOW() WHERE id=$3`,
      [String(err.message || err).slice(0, 2000), Date.now() - started, runId]);
    res.status(400).json({ run_id: runId, status: 'failed', error: err.message, detail: err.detail });
  }
}

router.post('/run', async (req, res) => {
  const { definition, input } = req.body || {};
  if (!definition) return res.status(400).json({ message: 'definition required' });
  await execute(definition, input, req, res, null);
});

router.post('/:id/run', async (req, res) => {
  const nid = await resolveNewsroomId(req);
  const { rows } = await pool.query('SELECT * FROM workflows WHERE id = $1 AND newsroom_id = $2', [req.params.id, nid]);
  if (!rows.length) return res.status(404).json({ message: 'not found' });
  await execute(rows[0].definition, req.body?.input, req, res, rows[0].id);
});

router.get('/:id/runs', async (req, res) => {
  const nid = await resolveNewsroomId(req);
  const { rows } = await pool.query(
    `SELECT id, status, input, output, error, duration_ms, created_at, completed_at
       FROM workflow_runs WHERE workflow_id = $1 AND newsroom_id = $2 ORDER BY created_at DESC LIMIT 50`,
    [req.params.id, nid]
  );
  res.json(rows);
});

export default router;
