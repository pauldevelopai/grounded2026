// bair-intake.js — client self-serve BAIR questionnaire.
// Token-scoped (NOT admin): reuses the existing participant_tokens mechanism
// (same as participant-portal.js) — no new auth. Mounted public at
// /api/bair/intake, BEFORE the admin router, so requireAuth doesn't intercept it.
//
//   GET  /questions?token=&audit_id=  → the audit's sector questionnaire
//   POST /answers?token=  { audit_id, answers:[{question_id, answer_index}] }
//        → flagged answers become bair.findings (source='self_serve',
//          consent_scope='client_only'; severity scaled from the option chosen).
//
// Options are authored best→worst: index 0 = clean (no finding); a worse option
// yields a finding on the question's maps_to_finding, severity rising with the
// option position. Re-submitting replaces this audit's self_serve findings
// (idempotent); consultant-entered findings are never touched.
import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Same token check as the participant portal — token in ?token= or header.
async function requireToken(req, res, next) {
  try {
    const token = req.query.token || req.headers['x-participant-token'];
    if (!token) return res.status(401).json({ message: 'Access token required' });
    const { rows } = await pool.query(
      `SELECT pt.id, pt.contact_id, c.organisation_id
         FROM participant_tokens pt
         JOIN contacts c ON c.id = pt.contact_id
        WHERE pt.token = $1 AND pt.is_active = true`,
      [token]
    );
    if (!rows.length) return res.status(401).json({ message: 'Invalid or expired token' });
    req.participant = rows[0];
    pool.query('UPDATE participant_tokens SET last_accessed_at = NOW() WHERE id = $1', [rows[0].id]).catch(() => {});
    next();
  } catch (err) { console.error('[bair/intake:token]', err); res.status(500).json({ message: 'Internal server error' }); }
}

// Resolve an audit the token's holder is allowed to fill in (by contact or org).
async function ownedAudit(auditId, participant) {
  const { rows } = await pool.query('SELECT id, sector_id, contact_id, organisation_id FROM bair.audits WHERE id = $1', [auditId]);
  if (!rows.length) return { error: 404 };
  const a = rows[0];
  const ok = (a.contact_id && a.contact_id === participant.contact_id) ||
             (a.organisation_id && a.organisation_id === participant.organisation_id);
  if (!ok) return { error: 403 };
  return { audit: a };
}

function severityFromIndex(idx, n) {
  if (n <= 1) return 3;
  return Math.min(5, Math.max(1, Math.round(1 + (idx / (n - 1)) * 4)));
}

// The questionnaire for this audit's sector (+ any global questions).
router.get('/questions', requireToken, async (req, res) => {
  try {
    const { audit_id } = req.query;
    if (!audit_id) return res.status(400).json({ message: 'audit_id required' });
    const { audit, error } = await ownedAudit(audit_id, req.participant);
    if (error === 404) return res.status(404).json({ message: 'Audit not found' });
    if (error === 403) return res.status(403).json({ message: 'This audit is not linked to your token' });

    const { rows } = await pool.query(`
      SELECT id, pillar, question_text, question_type, options, order_index
      FROM bair.questions
      WHERE is_active = true AND (sector_id = $1 OR sector_id IS NULL)
      ORDER BY hit_rate DESC NULLS LAST, order_index`,
      [audit.sector_id]);
    res.json({ audit_id, sector_id: audit.sector_id, questions: rows });
  } catch (err) { console.error('[bair/intake:questions]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Submit answers → flagged ones become self_serve findings (idempotent replace).
router.post('/answers', requireToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { audit_id, answers } = req.body || {};
    if (!audit_id) return res.status(400).json({ message: 'audit_id required' });
    if (!Array.isArray(answers)) return res.status(400).json({ message: 'answers must be an array' });
    const { audit, error } = await ownedAudit(audit_id, req.participant);
    if (error === 404) return res.status(404).json({ message: 'Audit not found' });
    if (error === 403) return res.status(403).json({ message: 'This audit is not linked to your token' });

    // Load the answered questions (scoped to the audit's sector / global, active).
    const ids = answers.map((a) => a.question_id).filter(Boolean);
    const meta = {};
    if (ids.length) {
      const { rows } = await pool.query(`
        SELECT id, pillar, maps_to_finding, options, question_text
        FROM bair.questions
        WHERE id = ANY($1) AND is_active = true AND (sector_id = $2 OR sector_id IS NULL)`,
        [ids, audit.sector_id]);
      rows.forEach((q) => { meta[q.id] = q; });
    }

    await client.query('BEGIN');
    // Idempotent: clear this audit's prior self_serve findings, keep consultant ones.
    await client.query(`DELETE FROM bair.findings WHERE audit_id = $1 AND source = 'self_serve'`, [audit_id]);

    let created = 0;
    for (const ans of answers) {
      const q = meta[ans.question_id];
      if (!q || !q.maps_to_finding) continue;                 // unknown / unmapped question
      const opts = Array.isArray(q.options) ? q.options : [];
      const idx = Number(ans.answer_index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) continue; // invalid selection
      if (idx === 0) continue;                                // best option → clean, no finding
      const severity = severityFromIndex(idx, opts.length);
      await client.query(`
        INSERT INTO bair.findings
          (audit_id, pillar, finding_type, severity, source, consent_scope, is_baseline, evidence_note)
        VALUES ($1,$2,$3,$4,'self_serve','client_only', true, $5)`,
        [audit_id, q.pillar, q.maps_to_finding, severity,
         `Self-serve: "${q.question_text}" → "${opts[idx]}"`]);
      created += 1;
    }
    await client.query('COMMIT');
    res.status(201).json({ audit_id, findings_created: created });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[bair/intake:answers]', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
