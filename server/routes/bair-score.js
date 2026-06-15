// bair-score.js — compute an audit's 0–100 AI-readiness score.
// Model (Paul's pick): per-pillar penalty, capped, then averaged across the six
// pillars. For each pillar:  damage = Σ(severity × weight);  a pillar reaches 0
// once its damage hits PILLAR_ZERO_AT.  pillar_score = 100 · max(0, 1 − damage/CAP).
// A pillar with no findings scores 100 (no detected gap). Overall readiness is the
// mean of the six pillar scores, written to bair.audits.readiness_score.
//
// Weight resolution per finding: a sector-specific weight beats the global default,
// and a 'learned' weight (written later by the reweighting mechanism) beats 'prior'.
// Unknown finding_types fall back to weight 1.0.
//
// This reads bair.findings for the one audit directly — it's the client's OWN score,
// not corpus analytics, so the corpus_findings firewall does not apply here.
// Admin-only (mounted under the admin router). Schema-qualified to bair.*.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const PILLARS = ['visibility', 'governance', 'security', 'productivity', 'capability', 'usage'];
const PILLAR_ZERO_AT = 25;   // damage points at which a pillar scores 0 — the one tunable knob
const round2 = (n) => Math.round(n * 100) / 100;

// POST /:auditId — recompute from current findings, persist, return the breakdown.
router.post('/:auditId', async (req, res) => {
  try {
    const { rows: auditRows } = await pool.query('SELECT id, sector_id FROM bair.audits WHERE id = $1', [req.params.auditId]);
    if (!auditRows.length) return res.status(404).json({ message: 'Audit not found' });
    const { sector_id } = auditRows[0];

    // Each finding with its resolved weight (sector override → global → 1.0).
    const { rows } = await pool.query(`
      SELECT f.pillar, f.severity, COALESCE(w.weight, 1.0) AS weight
      FROM bair.findings f
      LEFT JOIN LATERAL (
        SELECT sw.weight
        FROM bair.score_weights sw
        WHERE sw.pillar = f.pillar AND sw.finding_type = f.finding_type
          AND (sw.sector_id = $2 OR sw.sector_id IS NULL)
        ORDER BY (sw.sector_id = $2) DESC NULLS LAST,   -- sector-specific first
                 (sw.source = 'learned') DESC            -- learned beats prior
        LIMIT 1
      ) w ON true
      WHERE f.audit_id = $1`,
      [req.params.auditId, sector_id]);

    const damage = {}, counts = {};
    PILLARS.forEach((p) => { damage[p] = 0; counts[p] = 0; });
    for (const r of rows) {
      if (!(r.pillar in damage)) { damage[r.pillar] = 0; counts[r.pillar] = 0; } // defensive: unknown pillar
      damage[r.pillar] += Number(r.severity) * Number(r.weight);
      counts[r.pillar] += 1;
    }

    const pillars = PILLARS.map((p) => ({
      pillar: p,
      finding_count: counts[p],
      damage: round2(damage[p]),
      score: round2(Math.max(0, 100 * (1 - damage[p] / PILLAR_ZERO_AT))),
    }));
    const readiness = round2(pillars.reduce((s, x) => s + x.score, 0) / PILLARS.length);

    await pool.query('UPDATE bair.audits SET readiness_score = $1, updated_at = NOW() WHERE id = $2', [readiness, req.params.auditId]);

    res.json({ audit_id: req.params.auditId, readiness_score: readiness, cap: PILLAR_ZERO_AT, pillars });
  } catch (err) { console.error('[bair/score]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
