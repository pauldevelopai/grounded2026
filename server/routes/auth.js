import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import config from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, role, sector_ids FROM team_members WHERE email = $1 AND holly_access = true AND is_active = true',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, sector_ids: user.sector_ids },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.cookie('holly_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Self-service registration (creates a 'member' account) ─────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM team_members WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO team_members (name, email, password_hash, role, holly_access, is_active)
       VALUES ($1, $2, $3, 'member', true, true)
       RETURNING id, name, email, role, sector_ids`,
      [name, email, password_hash]
    );

    const user = rows[0];

    // Auto-login: issue JWT + cookie
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, sector_ids: user.sector_ids || [] },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.cookie('holly_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('holly_token', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, sector_ids FROM team_members WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
