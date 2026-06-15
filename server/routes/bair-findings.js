// bair-findings.js — write + read typed BAIR findings.
// HARD RULE #1: every finding carries a consent_scope. This route REQUIRES it
// explicitly on every write (no silent reliance on the column default) so consent
// is always a conscious decision. Admin-only (mounted under the admin router).
// Schema-qualified to bair.*; never sets a global search_path.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const PILLARS      = ['visibility', 'governance', 'security', 'productivity', 'capability', 'usage'];
const SOURCES      = ['consultant', 'self_serve', 'automated'];
const CONSENT      = ['client_only', 'anonymised_corpus_ok', 'sealed'];
const DATA_CLASSES = ['client_pii', 'financial', 'ip', 'none'];

// List findings for one audit (the single-audit view). The full table is fine
// here — this is the client's own findings, not corpus analytics.
router.get('/', async (req, res) => {
  try {
    const { audit_id } = req.query;
    if (!audit_id) return res.status(400).json({ message: 'audit_id query param required' });
    const { rows } = await pool.query(
      `SELECT * FROM bair.findings WHERE audit_id = $1 ORDER BY pillar, severity DESC, created_at`,
      [audit_id]);
    res.json(rows);
  } catch (err) { console.error('[bair/findings:list]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Write a typed finding (consultant or self_serve channel).
router.post('/', async (req, res) => {
  try {
    const { audit_id, pillar, finding_type, severity, data_class, source,
            confidence, consent_scope, evidence_note, is_baseline } = req.body || {};

    if (!audit_id) return res.status(400).json({ message: 'audit_id required' });
    if (!PILLARS.includes(pillar)) return res.status(400).json({ message: `pillar must be one of: ${PILLARS.join(', ')}` });
    const ft = String(finding_type || '').trim();
    if (!ft || ft.length > 60) return res.status(400).json({ message: 'finding_type required (1–60 chars)' });
    const sev = Number(severity);
    if (!Number.isInteger(sev) || sev < 1 || sev > 5) return res.status(400).json({ message: 'severity must be an integer 1–5' });
    if (!SOURCES.includes(source)) return res.status(400).json({ message: `source must be one of: ${SOURCES.join(', ')}` });
    // HARD RULE #1 — consent_scope is mandatory and explicit on every write.
    if (!CONSENT.includes(consent_scope)) return res.status(400).json({ message: `consent_scope is required and must be one of: ${CONSENT.join(', ')}` });
    if (data_class && !DATA_CLASSES.includes(data_class)) return res.status(400).json({ message: `data_class must be one of: ${DATA_CLASSES.join(', ')}` });
    const conf = confidence == null ? 1.0 : Number(confidence);
    if (Number.isNaN(conf) || conf < 0 || conf > 1) return res.status(400).json({ message: 'confidence must be between 0 and 1' });

    // Audit must exist — the FK would catch it, but return a clean 400.
    const { rows: a } = await pool.query('SELECT id FROM bair.audits WHERE id = $1', [audit_id]);
    if (!a.length) return res.status(400).json({ message: 'audit_id does not exist' });

    const { rows } = await pool.query(`
      INSERT INTO bair.findings
        (audit_id, pillar, finding_type, severity, data_class, source, confidence, consent_scope, evidence_note, is_baseline)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10, true))
      RETURNING *`,
      [audit_id, pillar, ft, sev, data_class || null, source, conf, consent_scope, evidence_note || null,
       typeof is_baseline === 'boolean' ? is_baseline : null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[bair/findings:create]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Update a finding. consent_scope is the lever that moves a finding into or out
// of the corpus (client_only → anonymised_corpus_ok), so it stays validated.
router.put('/:id', async (req, res) => {
  try {
    const { consent_scope, severity, evidence_note } = req.body || {};
    if (consent_scope !== undefined && !CONSENT.includes(consent_scope))
      return res.status(400).json({ message: `consent_scope must be one of: ${CONSENT.join(', ')}` });
    let sev = null;
    if (severity !== undefined) {
      sev = Number(severity);
      if (!Number.isInteger(sev) || sev < 1 || sev > 5) return res.status(400).json({ message: 'severity must be an integer 1–5' });
    }
    const { rows } = await pool.query(`
      UPDATE bair.findings SET
        consent_scope = COALESCE($1, consent_scope),
        severity      = COALESCE($2, severity),
        evidence_note = COALESCE($3, evidence_note)
      WHERE id = $4 RETURNING *`,
      [consent_scope || null, sev, evidence_note ?? null, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Finding not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[bair/findings:update]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
