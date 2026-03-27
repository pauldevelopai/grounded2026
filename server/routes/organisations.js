import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Map data — enriched with AI implementation strength indicators
router.get('/map', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.name, o.type, o.country, o.city, o.latitude, o.longitude,
        o.relationship_stage, o.programme_name, o.funder_organisation_id,
        s.name AS sector_name,
        (SELECT COUNT(*) FROM contacts c WHERE c.organisation_id = o.id)::int AS contact_count,
        EXISTS(SELECT 1 FROM generated_documents gd JOIN document_templates dt ON gd.template_id = dt.id WHERE gd.organisation_id = o.id AND dt.type = 'ethical_ai_policy') AS has_policy,
        EXISTS(SELECT 1 FROM generated_documents gd JOIN document_templates dt ON gd.template_id = dt.id WHERE gd.organisation_id = o.id AND dt.type = 'ai_legal_framework') AS has_framework,
        EXISTS(SELECT 1 FROM generated_documents gd JOIN document_templates dt ON gd.template_id = dt.id WHERE gd.organisation_id = o.id AND dt.type = 'ai_security_framework') AS has_security,
        EXISTS(SELECT 1 FROM service_engagements se WHERE se.organisation_id = o.id AND se.type = 'mentorship' AND se.status IN ('active', 'completed')) AS has_mentorship,
        COALESCE((SELECT AVG(lj.overall_progress) FROM learning_journeys lj WHERE lj.organisation_id = o.id), 0)::int AS learning_progress
      FROM organisations o
      LEFT JOIN sectors s ON o.sector_id = s.id
      WHERE ($1::uuid IS NULL OR o.sector_id = $1)
      ORDER BY o.name
    `, [req.sectorId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, relationship_stage } = req.query;
    let query = `
      SELECT o.*, s.name AS sector_name, s.colour AS sector_colour,
        (SELECT COUNT(*) FROM contacts c WHERE c.organisation_id = o.id) AS contact_count
      FROM organisations o
      LEFT JOIN sectors s ON o.sector_id = s.id
      WHERE ($1::uuid IS NULL OR o.sector_id = $1)
    `;
    const params = [req.sectorId];

    if (relationship_stage) {
      params.push(relationship_stage);
      query += ` AND o.relationship_stage = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND o.name ILIKE $${params.length}`;
    }
    if (req.query.funder_id) {
      params.push(req.query.funder_id);
      query += ` AND o.funder_organisation_id = $${params.length}`;
    }
    if (req.query.relationship_type) {
      params.push(req.query.relationship_type);
      query += ` AND o.relationship_type = $${params.length}`;
    }

    query += ' ORDER BY o.name';
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
      `SELECT o.*, s.name AS sector_name, s.colour AS sector_colour
       FROM organisations o
       LEFT JOIN sectors s ON o.sector_id = s.id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Organisation not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { sector_id, name, type, country, city, website, notes, relationship_stage } = req.body;
    if (!sector_id || !name) {
      return res.status(400).json({ message: 'sector_id and name required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO organisations (sector_id, name, type, country, city, website, notes, relationship_stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [sector_id, name, type || null, country || null, city || null, website || null, notes || null, relationship_stage || 'prospect']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { sector_id, name, type, country, city, website, notes, relationship_stage } = req.body;
    const { rows } = await pool.query(
      `UPDATE organisations SET
        sector_id = COALESCE($1, sector_id), name = COALESCE($2, name),
        type = $3, country = $4, city = $5, website = $6,
        notes = $7, relationship_stage = COALESCE($8, relationship_stage),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [sector_id, name, type, country, city, website, notes, relationship_stage, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Organisation not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM organisations WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Organisation not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
