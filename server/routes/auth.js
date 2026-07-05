import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import pool from '../db/pool.js';
import config from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { bridgeAikitLogin, bridgeAikitLogout } from '../services/aikit-bridge.js';
import { OFFICE_NEWSROOM_ID } from '../lib/tenancy.js';
import { getMailer } from '../services/email/providers.js';

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
    const { name, email, password, newsroom_id, access_code } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Joining a specific company requires that company's access code — so nobody
    // can register into a company they're not part of. Verified against the bcrypt
    // hash; never compared in plaintext. No company → the shared office newsroom.
    let targetNewsroom = OFFICE_NEWSROOM_ID;
    if (newsroom_id) {
      const { rows: [nr] } = await pool.query(
        'SELECT id, access_code_hash FROM newsrooms WHERE id = $1 AND is_active = true', [newsroom_id]);
      if (!nr) return res.status(400).json({ message: 'Unknown company.' });
      if (!nr.access_code_hash) return res.status(400).json({ message: 'This company isn’t open for self-registration yet — it’s enabled once your team has been on a Develop AI course.' });
      if (!access_code || !(await bcrypt.compare(String(access_code), nr.access_code_hash))) {
        return res.status(403).json({ message: 'That access code is incorrect. You’ll have been given it on your Develop AI course — your company admin can share it too.' });
      }
      targetNewsroom = nr.id;
    }

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM team_members WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO team_members (name, email, password_hash, role, tracker_access, is_active, newsroom_id)
       VALUES ($1, $2, $3, 'member', true, true, $4)
       RETURNING id, name, email, role, sector_ids, newsroom_id`,
      [name, email, password_hash, targetNewsroom]
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

// ── Forgotten password (item 4) ───────────────────────────────────────────────
// Standard single-use, time-limited token flow. The raw token travels only in
// the emailed link; the DB stores its sha256 hash (migration 130). We reuse the
// existing email provider abstraction. Until a real provider is wired on the box
// (EMAIL_PROVIDER=resend + RESEND_API_KEY/RESEND_FROM), getMailer() returns the
// console mailer — in that case we surface the reset link in the response so the
// flow is testable, mirroring the subscription-confirm pattern in public.js.
// Remove that fallback exposure once prod email delivery is confirmed live.
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function baseUrlOf(req) {
  const proto = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${proto}://${req.get('host') || 'grounded.developai.co.za'}`;
}

// POST /api/auth/request-reset  { email }
// Always responds 200 with a generic message so we never reveal whether an
// address has an account (no user enumeration).
router.post('/request-reset', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const generic = { message: 'If that email has an account, a reset link is on its way.' };
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const { rows } = await pool.query(
      'SELECT id, name, email FROM team_members WHERE lower(email) = $1 AND is_active = true',
      [email]
    );
    const user = rows[0];
    if (!user) return res.json(generic); // silent no-op — don't leak existence

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expires  = new Date(Date.now() + RESET_TTL_MS);
    await pool.query(
      'UPDATE team_members SET reset_token_hash = $1, reset_token_expires = $2 WHERE id = $3',
      [hashToken(rawToken), expires, user.id]
    );

    const resetLink = `${baseUrlOf(req)}/reset?token=${rawToken}`;
    const subject = 'Reset your password';
    const text =
      `Hi ${user.name || ''},\n\n` +
      `Someone (hopefully you) asked to reset your password.\n\n` +
      `Reset it here — this link expires in 1 hour:\n${resetLink}\n\n` +
      `If you didn't ask for this, you can ignore this email; your password won't change.`;
    const html =
      `<p>Hi ${user.name ? escapeText(user.name) : ''},</p>` +
      `<p>Someone (hopefully you) asked to reset your password.</p>` +
      `<p><a href="${resetLink}">Reset your password</a> — this link expires in 1 hour.</p>` +
      `<p>If you didn't ask for this, you can ignore this email; your password won't change.</p>`;

    let delivered = false;
    try {
      const mailer = await getMailer();
      await mailer.send({ to: user.email, subject, text, html });
      delivered = mailer.name !== 'console'; // console = not really delivered
    } catch (mailErr) {
      console.error('[auth/request-reset] mail send failed:', mailErr.message);
    }

    // Fallback: if no real mailer is configured, expose the link so the flow is
    // usable in dev/test. Never exposed once a real provider is delivering.
    if (!delivered) return res.json({ ...generic, reset_link: resetLink });
    return res.json(generic);
  } catch (err) {
    console.error('request-reset error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/auth/reset  { token, password }
router.post('/reset', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token || !password) return res.status(400).json({ message: 'Token and new password are required' });
    if (password.length < 6)  return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const { rows } = await pool.query(
      `SELECT id FROM team_members
        WHERE reset_token_hash = $1 AND reset_token_expires > now() AND is_active = true`,
      [hashToken(token)]
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired. Request a new one.' });

    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE team_members SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = $2',
      [password_hash, user.id]
    );
    res.json({ message: 'Your password has been reset. You can sign in now.' });
  } catch (err) {
    console.error('reset error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Minimal HTML escaping for the one interpolated field in the reset email body.
function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default router;
