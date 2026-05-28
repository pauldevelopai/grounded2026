// Operations-tools API — direct use of a single tool block (outside a workflow),
// with saved history. The same blocks are also droppable in the Builder.
//   GET  /                list the tool blocks (the workspaces index)
//   GET  /:slug           one tool block's metadata
//   POST /:slug/run       run the tool + save to tool_outputs
//   GET  /:slug/history   recent saved outputs for that tool
import { Router } from 'express';
import pool from '../db/pool.js';
import blocks from '../services/blocks/registry.js';
import '../services/blocks/tools.js';  // side-effect: registers the tool blocks
import '../services/blocks/agents.js'; // side-effect: registers the agent blocks

const router = Router();
const COOKIE = process.env.AUTH_COOKIE || 'tracker_token';
const DIRECT = new Set(['tool', 'agent']); // categories usable directly here

function ctxFrom(req) {
  return {
    userId: req.user?.id || null,
    authToken: req.cookies?.[COOKIE] || null,
    origin: process.env.PUBLIC_BASE_URL || `https://${req.get('host')}`,
  };
}

router.get('/', (req, res) => {
  res.json({ tools: blocks.listByCategory('tool'), agents: blocks.listByCategory('agent') });
});

router.get('/:slug', (req, res) => {
  const b = blocks.get(req.params.slug);
  if (!b || !DIRECT.has(b.category)) return res.status(404).json({ message: 'not found' });
  const { run, ...meta } = b;
  res.json(meta);
});

router.post('/:slug/run', async (req, res) => {
  const b = blocks.get(req.params.slug);
  if (!b || !DIRECT.has(b.category)) return res.status(404).json({ message: 'unknown block' });
  if (b.comingSoon) return res.status(503).json({ message: `${b.name} is coming soon.` });
  const input = req.body?.input || {};
  // required-input check
  for (const [field, schema] of Object.entries(b.inputs || {})) {
    if (schema.required && (input[field] === undefined || input[field] === '')) {
      return res.status(400).json({ message: `"${field}" is required.` });
    }
  }
  try {
    const output = await b.run(input, ctxFrom(req));
    const { rows } = await pool.query(
      `INSERT INTO tool_outputs (tool, user_id, title, input, output)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id, created_at`,
      [b.slug, req.user?.id || null, req.body?.title || null, JSON.stringify(input), JSON.stringify(output ?? null)]
    );
    res.json({ id: rows[0].id, created_at: rows[0].created_at, output });
  } catch (err) {
    console.error(`[tool:${b.slug}]`, err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/:slug/history', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, input, output, created_at FROM tool_outputs WHERE tool = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.slug]
  );
  res.json(rows);
});

export default router;
