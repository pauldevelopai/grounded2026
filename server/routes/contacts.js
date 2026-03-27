import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { organisation_id, pipeline_stage, search } = req.query;
    let query = `
      SELECT c.*, o.name AS organisation_name, s.name AS sector_name, s.colour AS sector_colour
      FROM contacts c
      LEFT JOIN organisations o ON c.organisation_id = o.id
      LEFT JOIN sectors s ON c.sector_id = s.id
      WHERE ($1::uuid IS NULL OR c.sector_id = $1)
    `;
    const params = [req.sectorId];

    if (organisation_id) {
      params.push(organisation_id);
      query += ` AND c.organisation_id = $${params.length}`;
    }
    if (pipeline_stage) {
      params.push(pipeline_stage);
      query += ` AND c.pipeline_stage = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
    }

    query += ' ORDER BY c.last_name, c.first_name';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, o.name AS organisation_name, s.name AS sector_name, s.colour AS sector_colour
       FROM contacts c
       LEFT JOIN organisations o ON c.organisation_id = o.id
       LEFT JOIN sectors s ON c.sector_id = s.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Contact not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { sector_id, first_name, last_name, email, phone, job_title, organisation_id, linkedin_url, notes, tags, pipeline_stage, source } = req.body;
    if (!sector_id || !first_name || !last_name) {
      return res.status(400).json({ message: 'sector_id, first_name, and last_name required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO contacts (sector_id, first_name, last_name, email, phone, job_title, organisation_id, linkedin_url, notes, tags, pipeline_stage, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [sector_id, first_name, last_name, email || null, phone || null, job_title || null, organisation_id || null, linkedin_url || null, notes || null, tags || '{}', pipeline_stage || 'prospect', source || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { sector_id, first_name, last_name, email, phone, job_title, organisation_id, linkedin_url, notes, tags, pipeline_stage, source, last_contacted_at } = req.body;
    const { rows } = await pool.query(
      `UPDATE contacts SET
        sector_id = COALESCE($1, sector_id), first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name), email = $4, phone = $5,
        job_title = $6, organisation_id = $7, linkedin_url = $8,
        notes = $9, tags = COALESCE($10, tags), pipeline_stage = COALESCE($11, pipeline_stage),
        source = $12, last_contacted_at = COALESCE($13, last_contacted_at),
        updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [sector_id, first_name, last_name, email, phone, job_title, organisation_id || null, linkedin_url, notes, tags, pipeline_stage, source, last_contacted_at, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Contact not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Contact not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get email history for a contact from Gmail
router.get('/:id/emails', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email FROM contacts WHERE id = $1', [req.params.id]);
    if (rows.length === 0 || !rows[0].email) return res.json([]);

    const { searchEmails, readEmail, getConnectionStatus } = await import('../services/gmail.js');
    const connected = await getConnectionStatus();
    if (!connected.connected) return res.json([]);

    const messages = await searchEmails(`from:${rows[0].email} OR to:${rows[0].email}`, 30);
    const emails = [];
    for (const msg of messages.slice(0, 20)) {
      try {
        const email = await readEmail(msg.id);
        if (email) {
          emails.push({
            id: email.id,
            from: email.from,
            subject: email.subject,
            date: email.date,
            snippet: email.body?.slice(0, 300) || '',
          });
        }
      } catch (e) { /* skip */ }
    }
    res.json(emails);
  } catch (err) {
    console.error('Email history error:', err);
    res.status(500).json({ message: 'Failed to load email history' });
  }
});

export default router;
