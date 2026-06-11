import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import config from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { bridgeAikitLogin, bridgeAikitLogout } from '../services/aikit-bridge.js';
import { OFFICE_NEWSROOM_ID } from '../lib/tenancy.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, role, sector_ids, newsroom_id FROM team_members WHERE email = $1 AND tracker_access = true AND is_active = true',
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
      { id: user.id, email: user.email, role: user.role, sector_ids: user.sector_ids, newsroom_id: user.newsroom_id },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    // Record sign-in time for the Grounded admin overview (best-effort).
    pool.query('UPDATE team_members SET last_login = NOW() WHERE id = $1', [user.id]).catch(() => {});

    res.cookie('tracker_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Mirror sign-in into AIKit so /aikit/* is also authenticated.
    await bridgeAikitLogin(res, user);

    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, newsroom_id: user.newsroom_id } });
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

    // Self-registrations land in the office newsroom — the same shared space
    // they effectively joined pre-multi-tenancy. Real partner newsrooms get
    // their users via admin-managed onboarding (Phase 2d), which will also
    // revisit this default (e.g. invite tokens).
    const { rows } = await pool.query(
      `INSERT INTO team_members (name, email, password_hash, role, tracker_access, is_active, newsroom_id)
       VALUES ($1, $2, $3, 'member', true, true, $4)
       RETURNING id, name, email, role, sector_ids, newsroom_id`,
      [name, email, password_hash, OFFICE_NEWSROOM_ID]
    );

    const user = rows[0];

    // Auto-login: issue JWT + cookie
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, sector_ids: user.sector_ids || [], newsroom_id: user.newsroom_id },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.cookie('tracker_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Mirror sign-in into AIKit so /aikit/* is also authenticated.
    await bridgeAikitLogin(res, user);

    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  res.clearCookie('tracker_token', { path: '/' });
  await bridgeAikitLogout(req, res);

  // AIKit's HTML logout form submits with Accept: text/html and expects a
  // redirect, not JSON. Detect that and bounce to the public home so the
  // user lands somewhere coherent. Programmatic JSON callers (Accept:
  // application/json) still get the {ok:true} response.
  const accept = req.headers.accept || '';
  if (accept.includes('text/html') && !accept.includes('application/json')) {
    return res.redirect(303, '/');
  }
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tm.id, tm.name, tm.email, tm.role, tm.sector_ids, tm.newsroom_id,
              n.name AS newsroom_name, n.slug AS newsroom_slug, n.kind AS newsroom_kind
         FROM team_members tm
         LEFT JOIN newsrooms n ON n.id = tm.newsroom_id
        WHERE tm.id = $1`,
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
