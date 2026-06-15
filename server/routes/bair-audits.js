// bair-audits.js — CRUD on bair.audits (the AI-readiness audit record).
// Admin-only: mounted under the admin router in index.js, which already enforces
// requireAuth + requireRole('admin'). All queries are schema-qualified to bair.*;
// we never set a global search_path (that would risk shadowing public.* tables).
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const STATUSES = ['intake', 'in_review', 'delivered', 'rechecked'];
const SIZES = ['micro', 'small', 'medium', 'large'];

// List audits, newest first, with org + sector names and a finding count.
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, o.name AS organisation_name, s.name AS sector_name,
             (SELECT COUNT(*)::int FROM bair.findings f WHERE f.audit_id = a.id) AS finding_count
      FROM bair.audits a
      LEFT JOIN public.organisations o ON o.id = a.organisation_id
      LEFT JOIN public.sectors s       ON s.id = a.sector_id
      ORDER BY a.created_at DESC
    `);
    res.json(rows);
  } catch (err) { console.error('[bair/audits:list]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// One audit with display names.
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, o.name AS organisation_name, s.name AS sector_name,
             NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), '') AS contact_name
      FROM bair.audits a
      LEFT JOIN public.organisations o ON o.id = a.organisation_id
      LEFT JOIN public.sectors s       ON s.id = a.sector_id
      LEFT JOIN public.contacts c      ON c.id = a.contact_id
      WHERE a.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Audit not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[bair/audits:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Create an audit. intake_at is stamped when it starts life in 'intake'.
router.post('/', async (req, res) => {
  try {
    const { organisation_id, sector_id, contact_id, company_size, region, status } = req.body || {};
    if (company_size && !SIZES.includes(company_size)) return res.status(400).json({ message: `company_size must be one of: ${SIZES.join(', ')}` });
    if (status && !STATUSES.includes(status)) return res.status(400).json({ message: `status must be one of: ${STATUSES.join(', ')}` });
    const { rows } = await pool.query(`
      INSERT INTO bair.audits (organisation_id, sector_id, contact_id, company_size, region, status, intake_at)
      VALUES ($1,$2,$3,$4,$5, COALESCE($6,'intake'),
              CASE WHEN COALESCE($6,'intake') = 'intake' THEN NOW() ELSE NULL END)
      RETURNING *`,
      [organisation_id || null, sector_id || null, contact_id || null, company_size || null, region || null, status || null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[bair/audits:create]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Update an audit — attributes + status, stamping milestone timestamps on transition.
router.put('/:id', async (req, res) => {
  try {
    const { organisation_id, sector_id, contact_id, company_size, region, status } = req.body || {};
    if (company_size && !SIZES.includes(company_size)) return res.status(400).json({ message: `company_size must be one of: ${SIZES.join(', ')}` });
    if (status && !STATUSES.includes(status)) return res.status(400).json({ message: `status must be one of: ${STATUSES.join(', ')}` });
    const { rows } = await pool.query(`
      UPDATE bair.audits SET
        organisation_id = COALESCE($1, organisation_id),
        sector_id       = COALESCE($2, sector_id),
        contact_id      = COALESCE($3, contact_id),
        company_size    = COALESCE($4, company_size),
        region          = COALESCE($5, region),
        status          = COALESCE($6, status),
        delivered_at    = CASE WHEN $6 = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
        recheck_at      = CASE WHEN $6 = 'rechecked' AND recheck_at  IS NULL THEN NOW() ELSE recheck_at  END,
        updated_at      = NOW()
      WHERE id = $7 RETURNING *`,
      [organisation_id || null, sector_id || null, contact_id || null, company_size || null, region || null, status || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Audit not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[bair/audits:update]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Delete an audit (cascades to its findings via the FK).
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM bair.audits WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Audit not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[bair/audits:delete]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
