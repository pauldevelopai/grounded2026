import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, sector_ids, bio, is_active, tracker_access, created_at, updated_at FROM team_members ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, sector_ids, bio, is_active, tracker_access, created_at, updated_at FROM team_members WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Team member not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, password, role, sector_ids, bio, is_active, tracker_access } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email required' });
    }
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    const { rows } = await pool.query(
      `INSERT INTO team_members (name, email, password_hash, role, sector_ids, bio, is_active, tracker_access)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, email, role, sector_ids, bio, is_active, tracker_access, created_at, updated_at`,
      [name, email, passwordHash, role || 'trainer', sector_ids || '{}', bio || null, is_active !== false, tracker_access || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email already exists' });
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, email, password, role, sector_ids, bio, is_active, tracker_access } = req.body;

    // If password provided, hash it and update separately
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE team_members SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    }

    const { rows } = await pool.query(
      `UPDATE team_members SET
        name = COALESCE($1, name), email = COALESCE($2, email),
        role = COALESCE($3, role), sector_ids = COALESCE($4, sector_ids),
        bio = $5, is_active = COALESCE($6, is_active),
        tracker_access = COALESCE($7, tracker_access), updated_at = NOW()
       WHERE id = $8
       RETURNING id, name, email, role, sector_ids, bio, is_active, tracker_access, created_at, updated_at`,
      [name, email, role, sector_ids, bio, is_active, tracker_access, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Team member not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE team_members SET is_active = false, tracker_access = false, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, is_active, tracker_access`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Team member not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
