// Newsrooms management — Phase 2d (admin-managed onboarding).
// Mounted under the admin router (requireAuth + requireRole('admin')).
//
//   GET    /                 list newsrooms (+ user/workflow counts)
//   POST   /                 create a newsroom { name, slug? }
//   PUT    /:id              update { name?, slug?, is_active? }
//   GET    /:id/users        team members homed in this newsroom
//   POST   /:id/users        create a user in this newsroom { name, email, password, role? }
//   PUT    /users/:userId    move a user { newsroom_id }
//
// Per the settled decisions: Develop AI creates each newsroom and its users;
// there is no self-serve newsroom creation. Deleting a newsroom is deliberately
// NOT exposed (it would orphan scoped data) — deactivate instead.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { OFFICE_NEWSROOM_ID } from '../lib/tenancy.js';

const router = Router();

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*,
              (SELECT COUNT(*)::int FROM team_members t WHERE t.newsroom_id = n.id) AS user_count,
              (SELECT COUNT(*)::int FROM workflows w WHERE w.newsroom_id = n.id) AS workflow_count
         FROM newsrooms n
        ORDER BY n.created_at`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'name required' });
    let slug = slugify(req.body?.slug || name);
    if (!slug) return res.status(400).json({ message: 'could not derive a slug' });
    const exists = await pool.query('SELECT 1 FROM newsrooms WHERE slug = $1', [slug]);
    if (exists.rowCount) return res.status(409).json({ message: `slug "${slug}" is taken` });
    const { rows } = await pool.query(
      'INSERT INTO newsrooms (name, slug) VALUES ($1, $2) RETURNING *',
      [name.trim(), slug]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, slug, is_active } = req.body || {};
    const sets = [], params = [];
    if (name !== undefined) { params.push(name.trim()); sets.push(`name = $${params.length}`); }
    if (slug !== undefined) {
      const s = slugify(slug);
      if (!s) return res.status(400).json({ message: 'invalid slug' });
      params.push(s); sets.push(`slug = $${params.length}`);
    }
    if (typeof is_active === 'boolean') {
      if (req.params.id === OFFICE_NEWSROOM_ID && !is_active) {
        return res.status(400).json({ message: 'the office newsroom cannot be deactivated' });
      }
      params.push(is_active); sets.push(`is_active = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ message: 'no fields' });
    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE newsrooms SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ message: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'slug is taken' });
    console.error(err); res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, is_active, tracker_access, last_login, created_at
         FROM team_members WHERE newsroom_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/:id/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password required' });
    if (password.length < 6) return res.status(400).json({ message: 'password must be at least 6 characters' });
    const r = role === 'admin' ? 'admin' : 'member';
    const nr = await pool.query('SELECT 1 FROM newsrooms WHERE id = $1', [req.params.id]);
    if (!nr.rowCount) return res.status(404).json({ message: 'newsroom not found' });
    const exists = await pool.query('SELECT 1 FROM team_members WHERE email = $1', [email]);
    if (exists.rowCount) return res.status(409).json({ message: 'an account with this email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO team_members (name, email, password_hash, role, tracker_access, is_active, newsroom_id)
       VALUES ($1, $2, $3, $4, true, true, $5)
       RETURNING id, name, email, role, newsroom_id, created_at`,
      [name.trim(), email.trim().toLowerCase(), hash, r, req.params.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/users/:userId', async (req, res) => {
  try {
    const { newsroom_id } = req.body || {};
    if (!newsroom_id) return res.status(400).json({ message: 'newsroom_id required' });
    const nr = await pool.query('SELECT 1 FROM newsrooms WHERE id = $1', [newsroom_id]);
    if (!nr.rowCount) return res.status(404).json({ message: 'newsroom not found' });
    const { rows } = await pool.query(
      `UPDATE team_members SET newsroom_id = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, name, email, role, newsroom_id`,
      [newsroom_id, req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'user not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
