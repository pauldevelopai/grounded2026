// beaiready-insights.js — the anonymised cross-business insight surface.
//
// Admin: derive patterns for a sector (consent + k-anonymity enforced in the service),
// review them, and publish the good ones (publishing ingests them as anonymised
// 'pattern' knowledge that informs every client's AI). Client: read the published
// patterns for their own sector — "what works for businesses like yours".
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { resolveNewsroomId } from '../lib/tenancy.js';
import { deriveSectorInsights, setInsightPublished } from '../services/insights.js';

const router = Router();

// Client / member: the PUBLISHED anonymised patterns for the caller's sector.
router.get('/mine', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows: [t] } = await pool.query(
      `SELECT o.sector_id FROM newsrooms n LEFT JOIN organisations o ON o.id = n.organisation_id WHERE n.id = $1`, [newsroomId]);
    const sectorId = t?.sector_id || null;
    const { rows } = await pool.query(
      `SELECT id, pattern_type, title, insight, supporting_orgs, generated_at
         FROM bair_insights
        WHERE is_published = true AND (sector_id IS NULL OR sector_id = $1)
        ORDER BY supporting_orgs DESC, generated_at DESC LIMIT 30`, [sectorId]);
    res.json(rows);
  } catch (err) { console.error('[insights/mine]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Admin: every derived insight (published + draft), newest first, for review.
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.sector_id, s.name AS sector_name, i.pattern_type, i.title, i.insight,
              i.supporting_orgs, i.is_published, i.generated_at
         FROM bair_insights i LEFT JOIN sectors s ON s.id = i.sector_id
        ORDER BY i.generated_at DESC, i.supporting_orgs DESC`);
    res.json(rows);
  } catch (err) { console.error('[insights/list]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Admin: how many businesses currently consent, by sector (so the admin knows whether
// a derivation will clear the k-anonymity floor before spending a model call).
router.get('/consent', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.sector_id, s.name AS sector_name, count(DISTINCT n.organisation_id)::int AS consenting
         FROM newsrooms n JOIN organisations o ON o.id = n.organisation_id LEFT JOIN sectors s ON s.id = o.sector_id
        WHERE n.shares_anonymised_insights = true
        GROUP BY o.sector_id, s.name ORDER BY consenting DESC`);
    res.json(rows);
  } catch (err) { console.error('[insights/consent]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Admin: derive patterns for a sector (or all sectors when sector_id omitted).
router.post('/derive', requireRole('admin'), async (req, res) => {
  try {
    const { sector_id } = req.body || {};
    const result = await deriveSectorInsights(sector_id || null);
    if (!result.ok) return res.status(422).json(result);
    res.json(result);
  } catch (err) { console.error('[insights/derive]', err); res.status(500).json({ message: err.message || 'Derivation failed' }); }
});

// Admin: publish / unpublish an insight (publishing feeds it to every client's AI).
router.post('/:id/publish', requireRole('admin'), async (req, res) => {
  try {
    const { published } = req.body || {};
    const updated = await setInsightPublished(req.params.id, !!published);
    if (!updated) return res.status(404).json({ message: 'Insight not found' });
    res.json({ id: updated.id, is_published: updated.is_published });
  } catch (err) { console.error('[insights/publish]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
