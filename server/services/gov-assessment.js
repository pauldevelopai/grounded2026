// gov-assessment.js — the BAIR Governance Assessment engine (Part 2).
// See docs/BUILD_bair-governance-assess-learn.md.
//
// This EXTENDS the existing bair.audits engine rather than adding parallel tables:
//   - questions live in bair.questions (pillar='governance', domain 1-4, options best→worst)
//   - answers become bair.findings (source='self_serve', carrying the question's domain)
//   - scoring mirrors bair-score.js exactly, but grouped by DOMAIN within the governance
//     pillar to produce the four-domain scorecard; the whole-audit six-pillar readiness is
//     refreshed via the shared computeAndSaveScore().
//
// A logged-in client (newsroom) reaches the org-keyed engine via newsroom → organisation
// → audit (find-or-create). BAIR business tenants carry an organisation_id; if one does
// not, we fail closed (no orphan audits) rather than guessing.
import pool from '../db/pool.js';
import { computeAndSaveScore } from '../routes/bair-score.js';

const DOMAINS = [1, 2, 3, 4];
const DOMAIN_TITLES = {
  1: 'Foundations of AI governance',
  2: 'Laws, standards & frameworks',
  3: 'Governing AI development',
  4: 'Governing AI deployment & use',
};
// Mirrors PILLAR_ZERO_AT in bair-score.js — the damage at which a domain scores 0.
const DOMAIN_ZERO_AT = 25;
const round2 = (n) => Math.round(n * 100) / 100;

// A typed error the API layer (Part 3) can map to a friendly 4xx.
export class AssessmentError extends Error {
  constructor(message, code) { super(message); this.name = 'AssessmentError'; this.code = code; }
}

// Severity from the chosen option index — identical scaling to bair-intake.js.
function severityFromIndex(idx, n) {
  if (n <= 1) return 3;
  return Math.min(5, Math.max(1, Math.round(1 + (idx / (n - 1)) * 4)));
}

// newsroom → organisation → sector (mirrors tenantContext in beaiready.js).
async function tenantOrg(newsroomId) {
  const { rows } = await pool.query(
    `SELECT n.organisation_id, o.sector_id
       FROM newsrooms n LEFT JOIN organisations o ON o.id = n.organisation_id
      WHERE n.id = $1`, [newsroomId]);
  return { organisationId: rows[0]?.organisation_id || null, sectorId: rows[0]?.sector_id || null };
}

// Find the business's existing audit (by organisation), or create one. Fails closed when
// the tenant has no organisation linked — the org-keyed engine has nothing to hang on.
export async function resolveOrCreateAudit(newsroomId) {
  const { organisationId, sectorId } = await tenantOrg(newsroomId);
  if (!organisationId) {
    throw new AssessmentError('This business has no organisation linked, so a governance assessment cannot be started.', 'no_organisation');
  }
  const { rows: existing } = await pool.query(
    `SELECT id FROM bair.audits WHERE organisation_id = $1 ORDER BY created_at LIMIT 1`, [organisationId]);
  if (existing.length) return existing[0].id;
  const { rows } = await pool.query(
    `INSERT INTO bair.audits (organisation_id, sector_id, status, intake_at)
     VALUES ($1, $2, 'intake', NOW()) RETURNING id`, [organisationId, sectorId]);
  return rows[0].id;
}

// Read the tenant's own Governance-pillar data and suggest an answer index per question.
// Returns { [maps_to_finding]: suggestedIndex }. Keys are omitted where the pillar data
// can't answer the question (the client answers those manually).
export async function evidenceAutoAnswer(newsroomId) {
  const q = (sql, p) => pool.query(sql, p).then((r) => r.rows).catch(() => []);
  const [policy, profileRows, systems, controls, reviews] = await Promise.all([
    q(`SELECT 1 FROM ai_policies WHERE newsroom_id = $1 LIMIT 1`, [newsroomId]),
    q(`SELECT accountable_owner, review_cadence FROM ai_governance_profile WHERE newsroom_id = $1`, [newsroomId]),
    q(`SELECT risk_tier, acceptability FROM ai_tool_inventory WHERE newsroom_id = $1`, [newsroomId]),
    q(`SELECT 1 FROM ai_controls WHERE newsroom_id = $1 AND status = 'active' LIMIT 1`, [newsroomId]),
    q(`SELECT 1 FROM ai_reviews WHERE newsroom_id = $1 LIMIT 1`, [newsroomId]),
  ]);
  const profile = profileRows[0] || {};
  const sug = {};
  // Domain 1
  sug.gov_d1_no_policy = policy.length ? 0 : 2;
  sug.gov_d1_no_owner = (profile.accountable_owner && profile.accountable_owner.trim()) ? 0 : 2;
  // Domain 3
  sug.gov_d3_no_register = systems.length ? 0 : 2;
  sug.gov_d3_no_controls = controls.length ? 0 : 2;
  // Domain 2 & 4 signals derived from the register — only meaningful if systems exist.
  if (systems.length) {
    const tiered = systems.filter((s) => s.risk_tier && s.risk_tier !== 'unclassified').length;
    sug.gov_d2_untiered_systems = tiered === systems.length ? 0 : tiered > 0 ? 1 : 2;
    const reviewed = systems.filter((s) => s.acceptability && s.acceptability !== 'unreviewed').length;
    sug.gov_d4_no_acceptability = reviewed === systems.length ? 0 : reviewed > 0 ? 1 : 2;
  }
  // Domain 4 — review routine (cadence set AND at least one logged review → clean).
  const cadence = profile.review_cadence && String(profile.review_cadence).trim();
  sug.gov_d4_no_review = (cadence && reviews.length) ? 0 : cadence ? 1 : 2;
  return sug;
}

// Load the assessment for a tenant: find/create the audit, the domain-grouped questions,
// the evidence-based suggestions, and any current (unresolved) governance findings.
export async function loadAssessment(newsroomId) {
  const auditId = await resolveOrCreateAudit(newsroomId);
  const [{ rows: questions }, suggestions, { rows: current }] = await Promise.all([
    pool.query(`
      SELECT id, domain, question_text, options, maps_to_finding, order_index
        FROM bair.questions
       WHERE pillar = 'governance' AND is_active = true AND domain IS NOT NULL
       ORDER BY domain, order_index`),
    evidenceAutoAnswer(newsroomId),
    pool.query(`
      SELECT finding_type, domain, severity, evidence_note
        FROM bair.findings
       WHERE audit_id = (SELECT id FROM bair.audits WHERE organisation_id =
             (SELECT organisation_id FROM newsrooms WHERE id = $1) ORDER BY created_at LIMIT 1)
         AND pillar = 'governance' AND source = 'self_serve' AND resolved_at IS NULL`, [newsroomId]),
  ]);
  const domains = DOMAINS.map((d) => ({
    domain: d,
    title: DOMAIN_TITLES[d],
    questions: questions.filter((x) => x.domain === d).map((x) => ({
      id: x.id,
      question_text: x.question_text,
      options: x.options,
      maps_to_finding: x.maps_to_finding,
      suggested_index: Object.prototype.hasOwnProperty.call(suggestions, x.maps_to_finding) ? suggestions[x.maps_to_finding] : null,
    })),
  }));
  return { audit_id: auditId, domains, current_findings: current };
}

// Submit answers → replace this audit's self_serve governance findings (idempotent),
// then recompute. answers: [{ question_id, answer_index }].
export async function submitAnswers(newsroomId, answers) {
  if (!Array.isArray(answers)) throw new AssessmentError('answers must be an array', 'bad_input');
  const auditId = await resolveOrCreateAudit(newsroomId);
  const ids = answers.map((a) => a.question_id).filter(Boolean);
  const meta = {};
  if (ids.length) {
    const { rows } = await pool.query(
      `SELECT id, domain, maps_to_finding, options, question_text
         FROM bair.questions
        WHERE id = ANY($1) AND pillar = 'governance' AND is_active = true`, [ids]);
    rows.forEach((qq) => { meta[qq.id] = qq; });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Idempotent: clear this audit's prior self_serve GOVERNANCE findings only — consultant
    // findings and other pillars are never touched (mirrors bair-intake.js).
    await client.query(
      `DELETE FROM bair.findings WHERE audit_id = $1 AND pillar = 'governance' AND source = 'self_serve'`, [auditId]);
    let created = 0;
    for (const ans of answers) {
      const qq = meta[ans.question_id];
      if (!qq || !qq.maps_to_finding) continue;
      const opts = Array.isArray(qq.options) ? qq.options : [];
      const idx = Number(ans.answer_index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) continue;
      if (idx === 0) continue; // best option → clean, no finding
      const severity = severityFromIndex(idx, opts.length);
      await client.query(
        `INSERT INTO bair.findings
           (audit_id, pillar, finding_type, domain, severity, source, consent_scope, is_baseline, evidence_note)
         VALUES ($1, 'governance', $2, $3, $4, 'self_serve', 'client_only', true, $5)`,
        [auditId, qq.maps_to_finding, qq.domain, severity, `Self-serve: "${qq.question_text}" → "${opts[idx]}"`]);
      created += 1;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  const scorecard = await computeGovernanceScorecard(auditId);
  return { audit_id: auditId, findings_created: scorecard.domains.reduce((s, d) => s + d.gap_count, 0), ...scorecard };
}

// Per-domain governance scorecard for one audit. Mirrors bair-score.js math (severity ×
// resolved weight → damage → score), grouped by domain. Also refreshes the whole-audit
// six-pillar readiness (governance now contributes real findings).
export async function computeGovernanceScorecard(auditId) {
  const { rows: audit } = await pool.query(
    `SELECT sector_id, attested_by, attested_at FROM bair.audits WHERE id = $1`, [auditId]);
  if (!audit.length) return null;
  const sectorId = audit[0].sector_id;

  const { rows } = await pool.query(`
    SELECT f.domain, f.severity, f.finding_type, f.evidence_note, COALESCE(w.weight, 1.0) AS weight
      FROM bair.findings f
      LEFT JOIN LATERAL (
        SELECT sw.weight FROM bair.score_weights sw
         WHERE sw.pillar = 'governance' AND sw.finding_type = f.finding_type
           AND (sw.sector_id = $2 OR sw.sector_id IS NULL)
         ORDER BY (sw.sector_id = $2) DESC NULLS LAST, (sw.source = 'learned') DESC
         LIMIT 1
      ) w ON true
     WHERE f.audit_id = $1 AND f.pillar = 'governance' AND f.resolved_at IS NULL AND f.domain IS NOT NULL`,
    [auditId, sectorId]);

  const damage = {}, items = {};
  DOMAINS.forEach((d) => { damage[d] = 0; items[d] = []; });
  for (const r of rows) {
    if (!(r.domain in damage)) { damage[r.domain] = 0; items[r.domain] = []; }
    damage[r.domain] += Number(r.severity) * Number(r.weight);
    items[r.domain].push({ finding_type: r.finding_type, severity: r.severity, note: r.evidence_note });
  }

  const domains = DOMAINS.map((d) => ({
    domain: d,
    title: DOMAIN_TITLES[d],
    gap_count: items[d].length,
    damage: round2(damage[d]),
    score: round2(Math.max(0, 100 * (1 - damage[d] / DOMAIN_ZERO_AT))),
    gaps: items[d],
  }));
  const governance_score = round2(domains.reduce((s, x) => s + x.score, 0) / DOMAINS.length);

  // Refresh the whole-business six-pillar readiness (governance contributes). Non-fatal.
  await computeAndSaveScore(auditId).catch(() => {});

  return {
    audit_id: auditId, governance_score, cap: DOMAIN_ZERO_AT, domains,
    attested_at: audit[0].attested_at || null,
  };
}
