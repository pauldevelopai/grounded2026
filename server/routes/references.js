// Per-tool reference library CRUD (funders / personas / jurisdictions / resources).
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const { tool } = req.query;
  const params = []; let where = '';
  if (tool) { params.push(tool); where = 'WHERE tool = $1'; }
  const { rows } = await pool.query(`SELECT * FROM reference_items ${where} ORDER BY tool, name`, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { tool, name, content } = req.body || {};
  if (!tool || !name) return res.status(400).json({ message: 'tool and name are required' });
  const { rows } = await pool.query(
    `INSERT INTO reference_items (tool, name, content, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
    [tool, name, content || null, req.user?.id || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { name, content } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE reference_items SET name = COALESCE($1, name), content = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
    [name ?? null, content ?? null, req.params.id]
  );
  res.json(rows[0] || {});
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM reference_items WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
