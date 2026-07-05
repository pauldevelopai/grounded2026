// BE AI READY — business-tenant dashboard API (spec Part C).
// Mounted at /api/beaiready behind requireAuth. Every read is scoped to the
// CALLER'S OWN business tenant (its newsroom + linked organisation); a business
// member can only ever see their own data. Admin-only writes self-guard inline.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { resolveNewsroomId } from '../lib/tenancy.js';
import { callClaude } from '../services/claude.js';
import { runVisibilityScan } from '../services/visibility-scan.js';
import { providerStatus, getModelConfig, saveModelConfig, saveProviderSecret, FUNCTIONS, PROVIDERS } from '../lib/models.js';
import fs from 'node:fs';
import { upload } from '../middleware/upload.js';
import { processUpload } from '../services/document-processor.js';
import { getRelevantKnowledge } from '../services/knowledge.js';
import { ingestGovernanceDocument } from '../services/governance-ingest.js';
import { computeAndSaveScore } from './bair-score.js';
import { loadAssessment, submitAnswers, computeGovernanceScorecard, resolveOrCreateAudit, AssessmentError } from '../services/gov-assessment.js';

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const router = Router();

// Resolve the caller's tenant context: { newsroomId, kind, organisationId, sectorId }.
async function tenantContext(req) {
  const newsroomId = await resolveNewsroomId(req);
  const { rows } = await pool.query(
    `SELECT n.kind, n.organisation_id, o.sector_id
       FROM newsrooms n LEFT JOIN organisations o ON o.id = n.organisation_id
      WHERE n.id = $1`,
    [newsroomId]
  );
  return {
    newsroomId,
    kind: rows[0]?.kind || 'newsroom',
    organisationId: rows[0]?.organisation_id || null,
    sectorId: rows[0]?.sector_id || null,
  };
}

// Accepted recommendation pillar keys. The Be AI Ready model now surfaces six
// pillars — knowledge, training, governance, productivity (Tools), strategy,
// measurement — but the legacy keys 'visibility' and 'data-security' are kept so
// existing recommendations stay valid; the client dashboard folds those into
// Knowledge and Governance respectively (match client/.../pillars.js).
const PILLARS = ['knowledge', 'training', 'governance', 'productivity', 'strategy', 'measurement', 'visibility', 'data-security'];

// ── Recommendations ────────────────────────────────────────────────────────
router.get('/recommendations', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT id, pillar, title, detail, priority, status, created_at
         FROM recommendations
        WHERE newsroom_id = $1 AND status <> 'dismissed'
        ORDER BY CASE priority WHEN 'now' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 created_at DESC`,
      [newsroomId]
    );
    res.json(rows);
  } catch (err) { console.error('[beaiready/recs]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Admin writes the audit's recommendations (brochure: prioritised, plain-language).
router.post('/recommendations', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, pillar, title, detail, priority } = req.body || {};
    if (!newsroom_id || !pillar || !title) return res.status(400).json({ message: 'newsroom_id, pillar, title required' });
    if (!PILLARS.includes(pillar)) return res.status(400).json({ message: 'invalid pillar' });
    const { rows } = await pool.query(
      `INSERT INTO recommendations (newsroom_id, pillar, title, detail, priority)
       VALUES ($1,$2,$3,$4,COALESCE($5,'medium')) RETURNING *`,
      [newsroom_id, pillar, title, detail || null, priority || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/recs/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/recommendations/:id', requireRole('admin'), async (req, res) => {
  try {
    const { status, priority, title, detail } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE recommendations SET
         status = COALESCE($1, status), priority = COALESCE($2, priority),
         title = COALESCE($3, title), detail = COALESCE($4, detail), updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status || null, priority || null, title || null, detail ?? null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/recs/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Business metrics (the five; entered-only, never computed) ────────────────
router.get('/metrics', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    // Latest value per metric.
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (metric) metric, value, period, note, created_at
         FROM business_metrics WHERE newsroom_id = $1
        ORDER BY metric, created_at DESC`,
      [newsroomId]
    );
    res.json(rows);
  } catch (err) { console.error('[beaiready/metrics]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Client-facing metric entry — scoped to the CALLER'S OWN tenant (no newsroom_id
// in the body; a business enters its own five measures). "No surveillance" by
// design: aggregate values + baselines/targets, never per-individual tracking.
router.post('/metrics/mine', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { metric, value, period, note } = req.body || {};
    const ALLOWED = ['deliverables', 'revenue', 'time_spent', 'ai_hours_saved', 'client_outcomes'];
    if (!ALLOWED.includes(metric)) return res.status(400).json({ message: 'unknown metric' });
    const { rows } = await pool.query(
      `INSERT INTO business_metrics (newsroom_id, metric, value, period, note, entered_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [newsroomId, metric, value ?? null, period || null, note || null, req.user?.id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/metrics/mine]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/metrics', requireRole('admin'), async (req, res) => {
  try {
    const { newsroom_id, metric, value, period, note } = req.body || {};
    if (!newsroom_id || !metric) return res.status(400).json({ message: 'newsroom_id, metric required' });
    const { rows } = await pool.query(
      `INSERT INTO business_metrics (newsroom_id, metric, value, period, note, entered_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [newsroom_id, metric, value ?? null, period || null, note || null, req.user?.id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/metrics/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Goals (the Measurement pillar) ───────────────────────────────────────────
// Measurable targets agreed at the start, then tracked against the metrics. The
// consultant sets them (control stays with them); the client sees them + progress.
const METRIC_KEYS = ['deliverables', 'revenue', 'time_spent', 'ai_hours_saved', 'client_outcomes'];
const GOAL_STATUS = ['active', 'achieved', 'archived'];
const toNum = (v) => (v == null || v === '' ? null : Number(v));
function withProgress(g) {
  const baseline = g.baseline == null ? null : Number(g.baseline);
  const target = g.target == null ? null : Number(g.target);
  const current = g.current == null ? null : Number(g.current);
  let progress = null;
  if (baseline != null && target != null && current != null) {
    const span = target - baseline;
    progress = span === 0 ? (current >= target ? 1 : 0) : (current - baseline) / span;
    progress = Math.max(0, Math.min(1, progress));
  }
  return { ...g, baseline, target, current, progress };
}

// Tenant reads its own goals, newest first, with current measured off the latest metric.
router.get('/goals', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT g.id, g.title, g.detail, g.metric, g.unit, g.baseline, g.target, g.target_date, g.status, g.created_at,
              COALESCE(g.current_value,
                (SELECT bm.value FROM business_metrics bm
                  WHERE bm.newsroom_id = g.newsroom_id AND bm.metric = g.metric
                  ORDER BY bm.created_at DESC LIMIT 1)) AS current
         FROM bair_goals g
        WHERE g.newsroom_id = $1 AND g.status <> 'archived'
        ORDER BY CASE g.status WHEN 'active' THEN 0 ELSE 1 END, g.created_at DESC`,
      [newsroomId]);
    res.json(rows.map(withProgress));
  } catch (err) { console.error('[beaiready/goals:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/goals', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.newsroom_id || !b.title?.trim()) return res.status(400).json({ message: 'newsroom_id, title required' });
    if (b.metric && !METRIC_KEYS.includes(b.metric)) return res.status(400).json({ message: 'unknown metric' });
    const { rows } = await pool.query(
      `INSERT INTO bair_goals (newsroom_id, title, detail, metric, unit, baseline, target, current_value, target_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.newsroom_id, b.title.trim(), b.detail || null, b.metric || null, b.unit || null,
       toNum(b.baseline), toNum(b.target), toNum(b.current_value), b.target_date || null, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/goals:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/goals/:id', requireRole('admin'), async (req, res) => {
  try {
    const b = req.body || {};
    if (b.metric && !METRIC_KEYS.includes(b.metric)) return res.status(400).json({ message: 'unknown metric' });
    if (b.status && !GOAL_STATUS.includes(b.status)) return res.status(400).json({ message: 'unknown status' });
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `UPDATE bair_goals SET
         title = COALESCE($1,title), detail = COALESCE($2,detail), metric = COALESCE($3,metric),
         unit = COALESCE($4,unit), baseline = COALESCE($5,baseline), target = COALESCE($6,target),
         current_value = COALESCE($7,current_value), target_date = COALESCE($8,target_date),
         status = COALESCE($9,status), updated_at = NOW()
       WHERE id = $10 AND newsroom_id = $11 RETURNING *`,
      [b.title || null, b.detail ?? null, b.metric || null, b.unit ?? null,
       toNum(b.baseline), toNum(b.target), toNum(b.current_value), b.target_date || null,
       b.status || null, req.params.id, newsroomId]);
    if (!rows.length) return res.status(404).json({ message: 'Goal not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/goals:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/goals/:id', requireRole('admin'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rowCount } = await pool.query('DELETE FROM bair_goals WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    if (!rowCount) return res.status(404).json({ message: 'Goal not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[beaiready/goals:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Trainings (read-only over the CRM, by the tenant's organisation) ────────
router.get('/trainings', async (req, res) => {
  try {
    const { organisationId } = await tenantContext(req);
    if (!organisationId) return res.json({ upcoming: [], past: [] });
    const { rows: engagements } = await pool.query(
      `SELECT id, type, status, start_date, end_date, session_count, deliverable_url, notes
         FROM service_engagements
        WHERE organisation_id = $1
        ORDER BY COALESCE(start_date, created_at::date) DESC`,
      [organisationId]
    );
    // Attach sessions to each engagement.
    for (const e of engagements) {
      const { rows: sessions } = await pool.query(
        `SELECT id, session_date, duration_minutes, notes, next_steps
           FROM engagement_sessions WHERE engagement_id = $1 ORDER BY session_date`,
        [e.id]
      );
      e.sessions = sessions;
    }
    const today = new Date().toISOString().slice(0, 10);
    const isUpcoming = (e) =>
      (e.end_date && e.end_date >= today) ||
      (e.start_date && e.start_date >= today) ||
      (e.sessions || []).some((s) => s.session_date && s.session_date >= today);
    res.json({
      upcoming: engagements.filter(isUpcoming),
      past: engagements.filter((e) => !isUpcoming(e)),
    });
  } catch (err) { console.error('[beaiready/trainings]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Training materials (final courses in the tenant's sector, with modules) ──
router.get('/materials', async (req, res) => {
  try {
    const { sectorId } = await tenantContext(req);
    if (!sectorId) return res.json([]);
    const { rows: courses } = await pool.query(
      `SELECT id, title, description, delivery_type
         FROM courses WHERE sector_id = $1 AND status = 'final'
        ORDER BY title`,
      [sectorId]
    );
    for (const c of courses) {
      const { rows: modules } = await pool.query(
        `SELECT id, title, description, content_url, video_url, duration_minutes
           FROM course_modules WHERE course_id = $1 ORDER BY order_index`,
        [c.id]
      );
      c.modules = modules;
    }
    res.json(courses);
  } catch (err) { console.error('[beaiready/materials]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Intake responses (from synced Google-Form CSVs — spec Part D) ────────────
router.get('/intake', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: forms } = await pool.query(
      `SELECT f.form_name, f.last_synced_at,
              (SELECT COUNT(*)::int FROM intake_responses r
                WHERE r.newsroom_id = f.newsroom_id AND r.form_name = f.form_name) AS response_count
         FROM intake_forms f WHERE f.newsroom_id = $1 AND f.is_enabled = true
        ORDER BY f.form_name`,
      [newsroomId]
    );
    res.json(forms);
  } catch (err) { console.error('[beaiready/intake]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Governance · pick-and-mix policy modules (item 5) ───────────────────────
// The AI policy is DERIVED from the tenant's real governance data (see
// /policy/generate). The business chooses WHICH sections to include; each
// module carries a directive that steers the generator's coverage for that
// section. This is the "modular policy" idea proven for newsrooms, per business.
// Server-owned so the picker renders from a single source of truth.
const POLICY_MODULES = [
  { key: 'acceptable_use',   label: 'Acceptable use',        description: 'What staff may and may not do with AI.',
    directive: 'Acceptable use — what staff may and may not do with AI, in concrete terms tied to how THIS business works.' },
  { key: 'data_handling',    label: 'Data handling & POPIA', description: 'Which data may go into which tools; POPIA alignment.',
    directive: 'Data handling & POPIA — what data may/may not go into which tools (reflect the register), personal-information handling, and POPIA alignment (cite sources).' },
  { key: 'tool_rules',       label: 'Model & tool rules',    description: 'Approved, restricted and forbidden tools/models.',
    directive: "Model & tool rules — approved vs restricted vs forbidden tools/models, naming the business's ACTUAL systems from the register." },
  { key: 'human_oversight',  label: 'Human oversight',       description: 'Human approval for high-risk AI use.',
    directive: 'Human oversight — where a human must review or approve, especially for the high-risk systems in the register.' },
  { key: 'incident_response',label: 'Incident response',     description: 'Reporting and handling AI incidents; escalation.',
    directive: 'Incident response — how to report and handle AI incidents, and the escalation path (reflect the roles & review data).' },
  { key: 'eu_ai_act',        label: 'EU AI Act alignment',   description: 'Risk-tier obligations under the EU AI Act.',
    directive: "EU AI Act alignment — obligations implied by the register's risk tiers, and how the business meets them (cite sources)." },
  { key: 'accountability',   label: 'Accountability & review', description: 'Who is accountable; the review cadence.',
    directive: 'Accountability & review — the named accountable owner and the review cadence that keeps this policy current.' },
];
const POLICY_MODULE_KEYS = POLICY_MODULES.map((m) => m.key);

// Catalog for the client picker (no directives — those stay server-side).
router.get('/policy/modules', (req, res) => {
  res.json(POLICY_MODULES.map(({ key, label, description }) => ({ key, label, description })));
});

// ── Governance · the tenant's AI-use policy (lives in the dashboard) ─────────
router.get('/policy', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      'SELECT id, title, content, brief, updated_at FROM ai_policies WHERE newsroom_id = $1',
      [newsroomId]
    );
    res.json(rows[0] || null);
  } catch (err) { console.error('[beaiready/policy/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Generate a business AI-use policy DERIVED from the tenant's own operational layer —
// the AI System Register + risk tiers (P1), the adopted Controls (P2), and the
// accountable owner + cadence + escalation path (P3) — and GROUNDED in the governance
// corpus with citations. The policy is the human-readable summary of what the business
// actually runs, not a brief. Does NOT save (client reviews, edits, PUTs).
router.post('/policy/generate', async (req, res) => {
  try {
    const { newsroomId, organisationId, sectorId } = await tenantContext(req);
    const body = req.body || {};

    // Pick-and-mix (item 5): the business chooses which sections to include.
    // Default to all modules when none are specified (back-compatible).
    const requestedSections = Array.isArray(body.sections) && body.sections.length
      ? body.sections.filter((k) => POLICY_MODULE_KEYS.includes(k))
      : POLICY_MODULE_KEYS.slice();
    const selectedModules = POLICY_MODULES.filter((m) => requestedSections.includes(m.key));
    const sections = selectedModules.length ? selectedModules : POLICY_MODULES; // never zero
    const coverDirective = sections.map((m) => `- ${m.directive}`).join('\n');

    const { rows: [t] } = await pool.query(
      `SELECT o.name AS org, o.country, s.name AS sector FROM newsrooms n
         LEFT JOIN organisations o ON o.id = n.organisation_id
         LEFT JOIN sectors s ON s.id = o.sector_id WHERE n.id = $1`, [newsroomId]).catch(() => ({ rows: [{}] }));
    const businessName = body.businessName || t?.org || 'the business';
    const sector = body.sector || t?.sector || '';
    const country = t?.country || 'South Africa';

    // ── The tenant's real operational layer (P1 register, P2 controls, P3 roles) ──
    const { rows: systems } = await pool.query(
      `SELECT tool_name, purpose, owner_person, data_shared, risk_tier, paid_free
         FROM ai_tool_inventory WHERE newsroom_id = $1
        ORDER BY CASE risk_tier WHEN 'unacceptable' THEN 0 WHEN 'high' THEN 1 WHEN 'limited' THEN 2 WHEN 'minimal' THEN 3 ELSE 4 END, tool_name`,
      [newsroomId]).catch(() => ({ rows: [] }));
    const { rows: controls } = await pool.query(
      `SELECT title, description, applies_to_tier, framework_ref FROM ai_controls
        WHERE newsroom_id = $1 AND status = 'active' ORDER BY title`, [newsroomId]).catch(() => ({ rows: [] }));
    const { rows: [profile] } = await pool.query(
      'SELECT accountable_owner, owner_role, review_cadence, incident_escalation_path FROM ai_governance_profile WHERE newsroom_id = $1',
      [newsroomId]).catch(() => ({ rows: [] }));

    // Enforce the method (no fake data): a credible policy is DERIVED, not minted from
    // nothing. Empty register AND no controls → honest state, not boilerplate.
    if (systems.length === 0 && controls.length === 0) {
      return res.json({ empty: true, message: 'Build your AI System Register and adopt some controls first — your policy is generated from them, not from a blank brief.' });
    }

    // ── Grounding from the governance corpus (cited) ──
    const searchTerms = [businessName, sector, country, 'AI use policy acceptable use POPIA EU AI Act data protection human oversight'].filter(Boolean).join(' ');
    const sources = await getRelevantKnowledge({ categories: ['ai_governance'], orgId: organisationId, sectorId, searchTerms, limit: 8 }).catch(() => []);
    const grounded = sources.length > 0;
    const sourceBlock = grounded ? sources.map((s, i) => `[${i + 1}] ${s.title}: ${(s.content || '').slice(0, 450)}`).join('\n\n') : '';

    const systemsBlock = systems.length
      ? systems.map((s) => `- ${s.tool_name}${s.risk_tier && s.risk_tier !== 'unclassified' ? ` [${s.risk_tier}-risk]` : ''}${s.purpose ? ` — ${s.purpose}` : ''}${s.owner_person ? ` (owner: ${s.owner_person})` : ''}${s.data_shared ? ` — data: ${s.data_shared}` : ''}${s.paid_free && s.paid_free !== 'unknown' ? ` — ${s.paid_free}` : ''}`).join('\n')
      : '(no systems logged)';
    const controlsBlock = controls.length
      ? controls.map((c) => `- ${c.title}${c.applies_to_tier && c.applies_to_tier !== 'any' ? ` [${c.applies_to_tier}-risk]` : ''}${c.description ? ` — ${c.description}` : ''}${c.framework_ref ? ` (${c.framework_ref})` : ''}`).join('\n')
      : '(no controls adopted yet)';
    const rolesBlock = profile
      ? `Accountable owner: ${profile.accountable_owner || '(unnamed)'}${profile.owner_role ? `, ${profile.owner_role}` : ''}. Review cadence: ${profile.review_cadence || 'quarterly'}. Incident escalation: ${profile.incident_escalation_path || '(undefined)'}.`
      : '(no accountable owner named yet)';

    const system = `You are an AI-governance adviser writing a SMALL/MEDIUM BUSINESS's AI-use policy. CRITICAL: DERIVE the policy from the business's OWN governance data below (its AI System Register, risk tiers, adopted controls, and accountable owner) and ground it in the cited SOURCES — never generic boilerplate. Name the business's ACTUAL systems and controls. Cover EXACTLY these sections the business has chosen — each as its own clearly-headed section, and no others:
${coverDirective}
${grounded ? 'Cite the SOURCE numbers you rely on.' : 'No governance sources are available; write from general principle and return "cited": [].'}

Respond in TWO parts, in this exact order:
PART 1 — a single-line JSON object (no code fence, no newlines): {"title":string,"summary":"1-2 sentences","checklist":["short adoptable steps to put this policy in place"],"cited":[source numbers used]}
PART 2 — a line containing exactly:
---POLICY---
…then the full policy as markdown (clear sections, concrete rules tied to THIS business's systems and controls). End with the line: "Generated guidance, not legal advice — verify with counsel." Put NO JSON in part 2.`;

    const userContent = `BUSINESS: ${businessName}${sector ? ` (sector: ${sector})` : ''} — ${country}

AI SYSTEM REGISTER (by risk tier):
${systemsBlock}

ADOPTED CONTROLS:
${controlsBlock}

ROLES & REVIEW:
${rolesBlock}${grounded ? `\n\nSOURCES (ground + cite these):\n${sourceBlock}` : ''}`;

    const raw = String(await callClaude({ system, userContent, maxTokens: 3500, temperature: 0.3 }));
    const [metaPart, ...rest] = raw.split('---POLICY---');
    const policyMarkdown = rest.join('---POLICY---').trim();
    let meta = {};
    const jsonStr = metaPart.replace(/```json|```/g, '');
    const a = jsonStr.indexOf('{'), b = jsonStr.lastIndexOf('}');
    if (a >= 0 && b > a) { try { meta = JSON.parse(jsonStr.slice(a, b + 1)); } catch { /* defaults */ } }
    const citations = grounded && Array.isArray(meta.cited)
      ? meta.cited.map((n) => sources[n - 1]).filter(Boolean).map((s) => ({ title: (s.title || '').replace(/ — part \d+\/\d+$/, ''), url: s.source_description || null }))
      : [];
    res.json({
      title: meta.title || `${businessName} — AI-use policy`,
      summary: meta.summary || '',
      checklist: Array.isArray(meta.checklist) ? meta.checklist : [],
      content: policyMarkdown || raw.replace('---POLICY---', '').trim(),
      grounded,
      citations,
      sections: sections.map((m) => ({ key: m.key, label: m.label })),
      derived_from: { systems: systems.length, controls: controls.length, owner: profile?.accountable_owner || null, sources: sources.length, sections: sections.map((m) => m.key) },
    });
  } catch (err) {
    console.error('[beaiready/policy/generate]', err);
    res.status(500).json({ message: err.message || 'Could not generate the policy. Please try again.' });
  }
});

// Save / update the tenant's current policy (the business owns + edits it).
router.put('/policy', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { title, content, brief } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ message: 'content required' });
    const { rows } = await pool.query(
      `INSERT INTO ai_policies (newsroom_id, title, content, brief, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (newsroom_id) DO UPDATE
         SET title = EXCLUDED.title, content = EXCLUDED.content,
             brief = COALESCE(EXCLUDED.brief, ai_policies.brief),
             updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING id, title, content, updated_at`,
      [newsroomId, (title || 'AI-use policy').slice(0, 200), content, brief ? JSON.stringify(brief) : null, req.user?.id || null]
    );
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/policy/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Governance · the legal framework the business operates under (item 6) ────
// Presentation only — NO new engine. Reference facts about POPIA + the EU AI
// Act (the two frameworks that bite for an SA business using AI), mapped onto
// the tenant's OWN AI System Register: its EU AI Act risk tiers and which
// systems touch personal information. "Here are the rules that apply to you."
// The reference text below is established law stated plainly, not fabricated
// business data; the live, dated text lives in the tracker (/regulations).
const LEGAL_FRAMEWORKS = [
  {
    key: 'popia',
    name: 'POPIA — Protection of Personal Information Act',
    jurisdiction: 'South Africa',
    applies_when: 'You process personal information about people (staff, customers, leads) — which almost every business does. Feeding personal data into AI tools counts.',
    obligations: [
      'Only process personal information for a lawful, specific purpose people have been told about.',
      'Collect the minimum needed, keep it accurate, and don’t keep it longer than necessary.',
      'Secure it — including what you paste into or store in AI tools; check where the tool sends and keeps data.',
      'Be transparent: people can ask what you hold and object to how it’s used.',
      'Take special care with special-personal-information (health, race, religion, children) and cross-border transfers.',
      'Have someone accountable (an Information Officer) and a way to handle a data breach.',
    ],
    tracker_query: 'POPIA',
  },
  {
    key: 'eu_ai_act',
    name: 'EU AI Act',
    jurisdiction: 'European Union (reaches you if you serve EU users or your AI output is used in the EU)',
    applies_when: 'You offer AI-driven products/services to people in the EU, or your AI system’s output is used there. Its four-tier risk model is the lens your AI System Register already uses.',
    // Keyed to the register's risk tiers so the view reuses existing data.
    tiers: [
      { tier: 'unacceptable', headline: 'Prohibited', requirement: 'Banned outright — e.g. social scoring, manipulative or exploitative AI. If anything sits here, stop and remove it.' },
      { tier: 'high',         headline: 'Strict obligations', requirement: 'Risk management, data governance, human oversight, logging, transparency and conformity checks before and during use.' },
      { tier: 'limited',      headline: 'Transparency duties', requirement: 'Tell people they’re dealing with AI (chatbots, generated content). Light-touch but mandatory.' },
      { tier: 'minimal',      headline: 'Few extra duties', requirement: 'Most everyday AI. No special obligations beyond good practice — but keep it in your register.' },
    ],
    tracker_query: 'EU AI Act',
  },
];

router.get('/governance/legal-framework', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows: systems } = await pool.query(
      `SELECT tool_name, risk_tier, data_shared FROM ai_tool_inventory WHERE newsroom_id = $1 ORDER BY tool_name`,
      [newsroomId]
    ).catch(() => ({ rows: [] }));

    const byTier = {};
    for (const s of systems) {
      const k = s.risk_tier || 'unclassified';
      (byTier[k] ||= []).push(s.tool_name);
    }
    // Systems that record any shared data → the POPIA-relevant set.
    const personalDataSystems = systems
      .filter((s) => s.data_shared && String(s.data_shared).trim())
      .map((s) => ({ tool_name: s.tool_name, data_shared: s.data_shared }));

    res.json({
      frameworks: LEGAL_FRAMEWORKS,
      register: {
        total: systems.length,
        by_tier: byTier,
        unclassified: (byTier.unclassified || []).length,
        personal_data_systems: personalDataSystems,
      },
    });
  } catch (err) {
    console.error('[beaiready/legal-framework]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Visibility · how AI sees the business (Claude-only v1) ───────────────────
async function businessForScan(req) {
  const { newsroomId, organisationId } = await tenantContext(req);
  let name = null, sector = null, location = null, website = null;
  if (organisationId) {
    const { rows } = await pool.query(
      `SELECT o.name, o.country, o.website, s.name AS sector
         FROM organisations o LEFT JOIN sectors s ON s.id = o.sector_id WHERE o.id = $1`,
      [organisationId]
    );
    if (rows[0]) { name = rows[0].name; location = rows[0].country; website = rows[0].website; sector = rows[0].sector; }
  }
  if (!name) {
    const { rows } = await pool.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
    name = rows[0]?.name || null;
  }
  return { newsroomId, business: { name, sector, location, website } };
}

router.get('/visibility', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    // The most recent scan's checks.
    const { rows } = await pool.query(
      `SELECT id, model, question, response, assessment, ran_at, scan_id
         FROM visibility_checks
        WHERE newsroom_id = $1
          AND scan_id = (SELECT scan_id FROM visibility_checks WHERE newsroom_id = $1 ORDER BY ran_at DESC LIMIT 1)
        ORDER BY ran_at`,
      [newsroomId]
    );
    res.json({ checks: rows, ran_at: rows[0]?.ran_at || null, model: rows[0]?.model || null });
  } catch (err) { console.error('[beaiready/visibility/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/visibility/scan', async (req, res) => {
  try {
    const { newsroomId, business } = await businessForScan(req);
    if (!business.name) return res.status(400).json({ message: 'No business name on file to scan.' });
    const result = await runVisibilityScan(newsroomId, business);
    res.json({ ...result, business });
  } catch (err) { console.error('[beaiready/visibility/scan]', err); res.status(500).json({ message: err.message || 'Scan failed' }); }
});

// ── Data Security · the company's AI-tool inventory + acceptability ─────────
// Try to recognise a logged tool in the assessed-tools DB (by name).
async function matchTool(name) {
  const { rows } = await pool.query(
    `SELECT id, name, vendor, category, description, strengths, limitations, pricing
       FROM ai_legal_tools WHERE is_published = true AND name ILIKE $1
      ORDER BY length(name) ASC LIMIT 1`,
    [`%${name.trim()}%`]
  );
  return rows[0] || null;
}

router.get('/security/inventory', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT i.*, t.name AS matched_name, t.description AS matched_description,
              t.strengths AS matched_strengths, t.limitations AS matched_limitations
         FROM ai_tool_inventory i
         LEFT JOIN ai_legal_tools t ON t.id = i.matched_tool_id
        WHERE i.newsroom_id = $1 ORDER BY i.created_at DESC`,
      [newsroomId]
    );
    res.json(rows);
  } catch (err) { console.error('[beaiready/inv/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/security/inventory', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { tool_name, used_by, data_shared, purpose, owner_person, paid_free, lifecycle_status } = req.body || {};
    if (!tool_name || !tool_name.trim()) return res.status(400).json({ message: 'tool_name required' });
    const match = await matchTool(tool_name);
    const { rows } = await pool.query(
      `INSERT INTO ai_tool_inventory (newsroom_id, tool_name, used_by, data_shared, matched_tool_id, purpose, owner_person, paid_free, lifecycle_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [newsroomId, tool_name.trim(), used_by || null, data_shared || null, match?.id || null,
       purpose || null, owner_person || null, paid_free || null, lifecycle_status || null]
    );
    res.status(201).json({ ...rows[0], matched_name: match?.name || null });
  } catch (err) { console.error('[beaiready/inv/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/security/inventory/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { used_by, data_shared, acceptability, ruling, fix,
            purpose, owner_person, paid_free, lifecycle_status, risk_tier } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE ai_tool_inventory SET
         used_by = COALESCE($1, used_by), data_shared = COALESCE($2, data_shared),
         acceptability = COALESCE($3, acceptability), ruling = COALESCE($4, ruling),
         fix = COALESCE($5, fix), purpose = COALESCE($6, purpose),
         owner_person = COALESCE($7, owner_person), paid_free = COALESCE($8, paid_free),
         lifecycle_status = COALESCE($9, lifecycle_status), risk_tier = COALESCE($10, risk_tier),
         updated_at = NOW()
       WHERE id = $11 AND newsroom_id = $12 RETURNING *`,
      [used_by ?? null, data_shared ?? null, acceptability ?? null, ruling ?? null, fix ?? null,
       purpose ?? null, owner_person ?? null, paid_free ?? null, lifecycle_status ?? null, risk_tier ?? null,
       req.params.id, newsroomId]
    );
    if (!rows.length) return res.status(404).json({ message: 'not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/inv/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/security/inventory/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    await pool.query('DELETE FROM ai_tool_inventory WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    res.json({ ok: true });
  } catch (err) { console.error('[beaiready/inv/del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// AI acceptability ruling for one logged tool (uses the matched assessment +
// what data the business says it puts in). Saves the ruling + fix on the row.
router.post('/security/inventory/:id/assess', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT i.*, t.name AS matched_name, t.description AS matched_description,
              t.strengths AS matched_strengths, t.limitations AS matched_limitations
         FROM ai_tool_inventory i LEFT JOIN ai_legal_tools t ON t.id = i.matched_tool_id
        WHERE i.id = $1 AND i.newsroom_id = $2`,
      [req.params.id, newsroomId]
    );
    if (!rows.length) return res.status(404).json({ message: 'not found' });
    const it = rows[0];
    const system = `You are a data-security adviser for a small/medium business assessing whether an AI tool is acceptable to use given what the business puts into it. Be practical and strict about POPIA/client-data risk. Return ONLY a single-line JSON object:
{"acceptability": "approved"|"restricted"|"avoid",
 "ruling": "one short plain sentence — why",
 "fix": "one short, concrete action to make it safe (or '' if approved as-is)"}`;
    const ctx = `Tool: ${it.tool_name}${it.matched_name ? ` (recognised as ${it.matched_name})` : ' (not in our assessed-tools database)'}
What it is: ${it.matched_description || 'unknown'}
Known strengths: ${it.matched_strengths || 'unknown'}
Known limitations / risks: ${it.matched_limitations || 'unknown'}
Used by: ${it.used_by || 'unspecified'}
Data the business puts into it: ${it.data_shared || 'unspecified'}`;
    const raw = String(await callClaude({ system, userContent: ctx, maxTokens: 250, temperature: 0 }));
    let out = { acceptability: 'restricted', ruling: raw.slice(0, 160), fix: '' };
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) { try { out = JSON.parse(raw.slice(a, b + 1)); } catch { /* keep */ } }
    const ok = ['approved', 'restricted', 'avoid'].includes(out.acceptability) ? out.acceptability : 'restricted';
    const { rows: upd } = await pool.query(
      `UPDATE ai_tool_inventory SET acceptability=$1, ruling=$2, fix=$3, updated_at=NOW()
       WHERE id=$4 AND newsroom_id=$5 RETURNING *`,
      [ok, out.ruling || null, out.fix || null, req.params.id, newsroomId]
    );
    res.json(upd[0]);
  } catch (err) { console.error('[beaiready/inv/assess]', err); res.status(500).json({ message: err.message || 'Assessment failed' }); }
});

// ── Governance · EU AI Act risk classification (GROUNDED + CITED) ────────────
// Classify one register system's risk tier, grounded in the global 'ai_governance'
// corpus and citing the sources used. If the corpus has nothing relevant, still
// classify but flag it ungrounded ("verify") — never fabricate a citation.
const RISK_TIERS = ['unacceptable', 'high', 'limited', 'minimal'];
router.post('/security/inventory/:id/classify', async (req, res) => {
  try {
    const { newsroomId, organisationId, sectorId } = await tenantContext(req);
    const { rows } = await pool.query(
      'SELECT * FROM ai_tool_inventory WHERE id = $1 AND newsroom_id = $2',
      [req.params.id, newsroomId]
    );
    if (!rows.length) return res.status(404).json({ message: 'not found' });
    const it = rows[0];

    // Retrieve grounding from the global governance corpus, ranked to this system.
    const searchTerms = [it.tool_name, it.purpose, it.data_shared, 'EU AI Act risk tier'].filter(Boolean).join(' ');
    const sources = await getRelevantKnowledge({
      categories: ['ai_governance'], orgId: organisationId, sectorId, searchTerms, limit: 6,
    }).catch(() => []);
    const grounded = sources.length > 0;
    const sourceBlock = grounded
      ? sources.map((s, i) => `[${i + 1}] ${s.title}: ${(s.content || '').slice(0, 500)}`).join('\n\n')
      : '';

    const system = `You classify an AI system's risk tier under the EU AI Act four-level model: "unacceptable", "high", "limited", or "minimal". ${
      grounded
        ? 'Ground your reasoning ONLY in the numbered SOURCES provided and cite the source numbers you used.'
        : 'No governance sources are available; classify from general principles and return "cited": [].'
    } Return ONLY a single-line JSON object:
{"risk_tier":"unacceptable"|"high"|"limited"|"minimal","rationale":"one or two plain sentences — the why","cited":[source numbers used]}
This is generated guidance, not legal advice — verify with counsel.`;
    const userContent = `AI SYSTEM
Name: ${it.tool_name}
Purpose: ${it.purpose || '(unspecified)'}
Data it touches: ${it.data_shared || '(unspecified)'}
Used by: ${it.used_by || '(unspecified)'}${grounded ? `\n\nSOURCES\n${sourceBlock}` : ''}`;

    const raw = String(await callClaude({ system, userContent, maxTokens: 600, temperature: 0 }));
    let out = {};
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) { try { out = JSON.parse(raw.slice(a, b + 1)); } catch { /* keep defaults */ } }
    const tier = RISK_TIERS.includes(out.risk_tier) ? out.risk_tier : 'unclassified';
    const citations = grounded && Array.isArray(out.cited)
      ? out.cited.map((n) => sources[n - 1]).filter(Boolean).map((s) => ({ id: s.id, title: (s.title || '').replace(/ — part \d+\/\d+$/, ''), url: s.source_description || null }))
      : [];

    const { rows: upd } = await pool.query(
      `UPDATE ai_tool_inventory SET risk_tier=$1, risk_rationale=$2, risk_citations=$3::jsonb,
         risk_grounded=$4, last_reviewed=NOW(), updated_at=NOW()
       WHERE id=$5 AND newsroom_id=$6 RETURNING *`,
      [tier, out.rationale || null, JSON.stringify(citations), grounded, req.params.id, newsroomId]
    );
    // 'unacceptable' AI must be stopped, not managed (manual). Surface it loudly; the
    // auto-creation of a bair.finding is wired in Phase 6, where audit linkage exists.
    res.json({ ...upd[0], grounded, citations, stop: tier === 'unacceptable' });
  } catch (err) { console.error('[beaiready/inv/classify]', err); res.status(500).json({ message: err.message || 'Classification failed' }); }
});

// ── Discovery (manual Phase 1): seed the register from the staff survey ───────
// Surface candidate AI systems from the tenant's OWN intake-survey responses, so the
// register is populated from what staff actually reported (the manual's shadow-AI
// discovery) rather than only typed by hand. Reads private intake_responses, extracts
// with Claude; the caller then adds the real ones. Suggestions are NOT saved, and this
// uses the org's own data only (never the shared corpus).
router.get('/security/discover', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      'SELECT response FROM intake_responses WHERE newsroom_id = $1 ORDER BY submitted_at DESC NULLS LAST LIMIT 50',
      [newsroomId]
    );
    if (!rows.length) return res.json({ responses: 0, suggestions: [] });
    const text = rows
      .map((r) => Object.entries(r.response || {}).map(([k, v]) => `${k}: ${v}`).join(' | '))
      .filter(Boolean).join('\n').slice(0, 8000);
    const { rows: ex } = await pool.query('SELECT lower(tool_name) AS n FROM ai_tool_inventory WHERE newsroom_id = $1', [newsroomId]);
    const have = new Set(ex.map((r) => r.n));
    const system = `From staff survey responses, extract the distinct AI tools/systems the business actually uses. For each, infer a short purpose, who uses it, and what data goes in — only where stated or strongly implied. Do NOT invent tools that aren't mentioned. Return ONLY a single-line JSON array:
[{"tool_name":"...","purpose":"...","used_by":"...","data_shared":"..."}]
Return an empty array [] if no specific AI tools are named.`;
    const raw = String(await callClaude({ system, userContent: `STAFF SURVEY RESPONSES:\n${text}`, maxTokens: 800, temperature: 0 }));
    let arr = [];
    const a = raw.indexOf('['), b = raw.lastIndexOf(']');
    if (a >= 0 && b > a) { try { arr = JSON.parse(raw.slice(a, b + 1)); } catch { /* keep [] */ } }
    const suggestions = (Array.isArray(arr) ? arr : [])
      .filter((s) => s && s.tool_name && !have.has(String(s.tool_name).toLowerCase().trim()))
      .map((s) => ({ tool_name: String(s.tool_name).slice(0, 120), purpose: s.purpose || '', used_by: s.used_by || '', data_shared: s.data_shared || '' }));
    res.json({ responses: rows.length, suggestions });
  } catch (err) { console.error('[beaiready/security/discover]', err); res.status(500).json({ message: err.message || 'Discovery failed' }); }
});

// ── Governance · Controls Library (manual Component 3) ───────────────────────
// The manual's six starter controls — a framework-cited template the client adopts
// BY CHOICE (never auto-seeded). No fake data: nothing exists until they adopt it.
const STARTER_CONTROLS = [
  { key: 'no-pii-public', title: 'No personal or confidential data in public AI tools', applies_to_tier: 'any', framework_ref: 'ISO/IEC 42001 A.8 · NIST AI RMF MANAGE', description: 'Staff may not paste customer personal data or confidential business information into free/public AI tools. Use approved tools for anything sensitive.' },
  { key: 'human-approval-high', title: 'Human approval for high-risk AI decisions', applies_to_tier: 'high', framework_ref: 'EU AI Act Art. 14 (human oversight) · NIST GOVERN', description: 'A named person must review and approve any AI-influenced decision about a person — hiring, credit, evaluation — before it takes effect.' },
  { key: 'disclose-customer-ai', title: 'Disclosure on customer-facing AI', applies_to_tier: 'limited', framework_ref: 'EU AI Act Art. 50 (transparency)', description: 'Where customers interact with AI (e.g. a chatbot), tell them clearly they are dealing with an AI system.' },
  { key: 'approved-tools-list', title: 'Approved-tools list', applies_to_tier: 'any', framework_ref: 'ISO/IEC 42001 A.6 · NIST GOVERN', description: 'Only tools on an approved list may be used for work involving sensitive data, with safe alternatives provided so staff are not forced into workarounds.' },
  { key: 'log-high-risk-use', title: 'Logging of high-risk AI use', applies_to_tier: 'high', framework_ref: 'EU AI Act Art. 12 (record-keeping) · NIST MEASURE', description: 'Keep a record of what high-risk AI systems were asked to do and what they produced, so decisions can be reviewed after the fact.' },
  { key: 'new-tool-vetting', title: 'New-tool vetting', applies_to_tier: 'any', framework_ref: 'NIST AI RMF MAP · ISO/IEC 42001 A.6.2', description: 'Before a new AI tool is adopted it goes through a short check against the risk scheme — what data, what risk tier, who owns it.' },
];
const CONTROL_TIERS = ['unacceptable', 'high', 'limited', 'minimal', 'any'];

// A control may link to the gap (bair.findings) it closes — but only one in the
// SAME organisation as the caller's tenant (fact 2: findings are org/audit-keyed,
// controls newsroom-keyed). Resolve via newsrooms.organisation_id and guard.
async function findingBelongsToTenant(findingId, organisationId) {
  if (!findingId) return true;
  if (!organisationId) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM bair.findings f JOIN bair.audits a ON a.id = f.audit_id WHERE f.id = $1 AND a.organisation_id = $2',
    [findingId, organisationId]
  );
  return rows.length > 0;
}
// A finding is resolved iff at least one ACTIVE control closes it; recompute its
// audit's readiness score after any control change (the finding → control → score chain).
async function syncFindingResolution(findingId) {
  if (!findingId) return;
  const { rows } = await pool.query('SELECT audit_id FROM bair.findings WHERE id = $1', [findingId]);
  if (!rows.length) return;
  await pool.query(
    `UPDATE bair.findings SET resolved_at = CASE
        WHEN EXISTS (SELECT 1 FROM ai_controls c WHERE c.closes_finding_id = $1 AND c.status = 'active')
        THEN COALESCE(resolved_at, NOW()) ELSE NULL END
      WHERE id = $1`, [findingId]
  );
  await computeAndSaveScore(rows[0].audit_id).catch((e) => console.error('[controls/score]', e.message));
}
// Replace a control's linked systems with the given set (tenant-validated).
async function setControlSystems(controlId, newsroomId, systemIds) {
  const { rows } = await pool.query('SELECT id FROM ai_tool_inventory WHERE newsroom_id = $1 AND id = ANY($2::uuid[])', [newsroomId, systemIds]);
  await pool.query('DELETE FROM ai_system_controls WHERE control_id = $1', [controlId]);
  for (const sid of rows.map((r) => r.id)) {
    await pool.query('INSERT INTO ai_system_controls (control_id, system_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [controlId, sid]);
  }
}

router.get('/governance/controls', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT c.*,
              COALESCE(json_agg(json_build_object('id', s.id, 'name', s.tool_name) ORDER BY s.tool_name)
                       FILTER (WHERE s.id IS NOT NULL), '[]') AS systems
         FROM ai_controls c
         LEFT JOIN ai_system_controls sc ON sc.control_id = c.id
         LEFT JOIN ai_tool_inventory s ON s.id = sc.system_id
        WHERE c.newsroom_id = $1
        GROUP BY c.id ORDER BY c.created_at DESC`, [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[beaiready/controls/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.get('/governance/controls/starters', async (req, res) => res.json(STARTER_CONTROLS));

router.post('/governance/controls/adopt', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const s = STARTER_CONTROLS.find((x) => x.key === (req.body || {}).key);
    if (!s) return res.status(400).json({ message: 'unknown starter control' });
    const { rows } = await pool.query(
      `INSERT INTO ai_controls (newsroom_id, title, description, applies_to_tier, status, framework_ref)
       VALUES ($1,$2,$3,$4,'active',$5) RETURNING *`,
      [newsroomId, s.title, s.description, s.applies_to_tier, s.framework_ref]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/controls/adopt]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Grounded + cited control suggestions for a system (or general). Not saved.
router.post('/governance/controls/suggest', async (req, res) => {
  try {
    const { newsroomId, organisationId, sectorId } = await tenantContext(req);
    const { system_id } = req.body || {};
    let sys = null;
    if (system_id) {
      const { rows } = await pool.query('SELECT * FROM ai_tool_inventory WHERE id = $1 AND newsroom_id = $2', [system_id, newsroomId]);
      sys = rows[0] || null;
    }
    const searchTerms = [sys?.tool_name, sys?.purpose, sys?.data_shared, sys?.risk_tier, 'AI governance controls safeguards'].filter(Boolean).join(' ');
    const sources = await getRelevantKnowledge({ categories: ['ai_governance'], orgId: organisationId, sectorId, searchTerms, limit: 6 }).catch(() => []);
    const grounded = sources.length > 0;
    const sourceBlock = grounded ? sources.map((s, i) => `[${i + 1}] ${s.title}: ${(s.content || '').slice(0, 500)}`).join('\n\n') : '';
    const system = `You propose concrete, practical AI-governance CONTROLS (safeguards) for a small business${sys ? ' for the AI system described' : ''}. ${grounded ? 'Ground each control in the numbered SOURCES and cite the source numbers used.' : 'No governance sources are available; propose sensible controls and return "cited": [].'} Return ONLY a single-line JSON array of 2–4 items:
[{"title":"...","description":"one practical sentence","applies_to_tier":"unacceptable|high|limited|minimal|any","framework_ref":"the framework/article","cited":[source numbers used]}]
This is generated guidance, not legal advice — verify with counsel.`;
    const userContent = `${sys ? `AI SYSTEM\nName: ${sys.tool_name}\nPurpose: ${sys.purpose || '(unspecified)'}\nData: ${sys.data_shared || '(unspecified)'}\nRisk tier: ${sys.risk_tier || 'unclassified'}` : 'General controls for a small business using AI.'}${grounded ? `\n\nSOURCES\n${sourceBlock}` : ''}`;
    const raw = String(await callClaude({ system, userContent, maxTokens: 900, temperature: 0.2 }));
    let arr = []; const a = raw.indexOf('['), b = raw.lastIndexOf(']');
    if (a >= 0 && b > a) { try { arr = JSON.parse(raw.slice(a, b + 1)); } catch { /* keep [] */ } }
    const suggestions = (Array.isArray(arr) ? arr : []).map((x) => ({
      title: String(x.title || '').slice(0, 200),
      description: x.description || '',
      applies_to_tier: CONTROL_TIERS.includes(x.applies_to_tier) ? x.applies_to_tier : 'any',
      framework_ref: x.framework_ref || '',
      citations: grounded && Array.isArray(x.cited) ? x.cited.map((n) => sources[n - 1]).filter(Boolean).map((s) => ({ title: (s.title || '').replace(/ — part \d+\/\d+$/, ''), url: s.source_description || null })) : [],
    })).filter((x) => x.title);
    res.json({ grounded, suggestions });
  } catch (err) { console.error('[beaiready/controls/suggest]', err); res.status(500).json({ message: err.message || 'Suggestion failed' }); }
});

router.post('/governance/controls', async (req, res) => {
  try {
    const { newsroomId, organisationId } = await tenantContext(req);
    const { title, description, applies_to_tier, owner_person, status, framework_ref, closes_finding_id, system_ids } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ message: 'title required' });
    if (closes_finding_id && !(await findingBelongsToTenant(closes_finding_id, organisationId)))
      return res.status(400).json({ message: 'finding not found for this tenant' });
    const { rows } = await pool.query(
      `INSERT INTO ai_controls (newsroom_id, title, description, applies_to_tier, owner_person, status, framework_ref, closes_finding_id)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'active'),$7,$8) RETURNING *`,
      [newsroomId, title.trim(), description || null, applies_to_tier || null, owner_person || null, status || null, framework_ref || null, closes_finding_id || null]);
    const control = rows[0];
    if (Array.isArray(system_ids) && system_ids.length) await setControlSystems(control.id, newsroomId, system_ids);
    if (control.closes_finding_id) await syncFindingResolution(control.closes_finding_id);
    res.status(201).json(control);
  } catch (err) { console.error('[beaiready/controls/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/governance/controls/:id', async (req, res) => {
  try {
    const { newsroomId, organisationId } = await tenantContext(req);
    const { rows: cur } = await pool.query('SELECT * FROM ai_controls WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    if (!cur.length) return res.status(404).json({ message: 'not found' });
    const prev = cur[0];
    const b = req.body || {};
    const nextFinding = b.closes_finding_id === undefined ? prev.closes_finding_id : (b.closes_finding_id || null);
    if (nextFinding && nextFinding !== prev.closes_finding_id && !(await findingBelongsToTenant(nextFinding, organisationId)))
      return res.status(400).json({ message: 'finding not found for this tenant' });
    const { rows } = await pool.query(
      `UPDATE ai_controls SET title=COALESCE($1,title), description=COALESCE($2,description),
         applies_to_tier=COALESCE($3,applies_to_tier), owner_person=COALESCE($4,owner_person),
         status=COALESCE($5,status), framework_ref=COALESCE($6,framework_ref),
         closes_finding_id=$7, updated_at=NOW()
       WHERE id=$8 AND newsroom_id=$9 RETURNING *`,
      [b.title ?? null, b.description ?? null, b.applies_to_tier ?? null, b.owner_person ?? null, b.status ?? null, b.framework_ref ?? null, nextFinding, req.params.id, newsroomId]);
    if (Array.isArray(b.system_ids)) await setControlSystems(req.params.id, newsroomId, b.system_ids);
    for (const fid of new Set([prev.closes_finding_id, rows[0].closes_finding_id].filter(Boolean))) await syncFindingResolution(fid);
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/controls/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/governance/controls/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query('DELETE FROM ai_controls WHERE id = $1 AND newsroom_id = $2 RETURNING closes_finding_id', [req.params.id, newsroomId]);
    if (rows.length && rows[0].closes_finding_id) await syncFindingResolution(rows[0].closes_finding_id);
    res.json({ ok: true });
  } catch (err) { console.error('[beaiready/controls/del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Governance · Roles, Review Routine & Incidents (manual Components 5 + 7) ──
// The named accountable owner + cadence + escalation path (one row per tenant), the
// log of review meetings, and the incident log. The heartbeat that keeps governance
// from decaying into fiction.
router.get('/governance/profile', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query('SELECT * FROM ai_governance_profile WHERE newsroom_id = $1', [newsroomId]);
    res.json(rows[0] || null);
  } catch (err) { console.error('[beaiready/gov/profile/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/governance/profile', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { accountable_owner, owner_role, review_cadence, next_review_date, incident_escalation_path } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO ai_governance_profile (newsroom_id, accountable_owner, owner_role, review_cadence, next_review_date, incident_escalation_path)
       VALUES ($1,$2,$3,COALESCE($4,'quarterly'),$5,$6)
       ON CONFLICT (newsroom_id) DO UPDATE SET
         accountable_owner = EXCLUDED.accountable_owner, owner_role = EXCLUDED.owner_role,
         review_cadence = EXCLUDED.review_cadence, next_review_date = EXCLUDED.next_review_date,
         incident_escalation_path = EXCLUDED.incident_escalation_path, updated_at = NOW()
       RETURNING *`,
      [newsroomId, accountable_owner || null, owner_role || null, review_cadence || null, next_review_date || null, incident_escalation_path || null]);
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/gov/profile/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.get('/governance/reviews', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query('SELECT * FROM ai_reviews WHERE newsroom_id = $1 ORDER BY review_date DESC NULLS LAST, created_at DESC', [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[beaiready/gov/reviews/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/governance/reviews', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { review_date, attendees, what_checked, actions } = req.body || {};
    const { rows } = await pool.query(
      'INSERT INTO ai_reviews (newsroom_id, review_date, attendees, what_checked, actions) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [newsroomId, review_date || null, attendees || null, what_checked || null, actions || null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/gov/reviews/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/governance/reviews/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    await pool.query('DELETE FROM ai_reviews WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    res.json({ ok: true });
  } catch (err) { console.error('[beaiready/gov/reviews/del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.get('/governance/incidents', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query('SELECT * FROM ai_incidents WHERE newsroom_id = $1 ORDER BY occurred_at DESC NULLS LAST, created_at DESC', [newsroomId]);
    res.json(rows);
  } catch (err) { console.error('[beaiready/gov/incidents/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/governance/incidents', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { occurred_at, what_happened, who_told, action_taken, status } = req.body || {};
    if (!what_happened || !what_happened.trim()) return res.status(400).json({ message: 'what_happened required' });
    const { rows } = await pool.query(
      `INSERT INTO ai_incidents (newsroom_id, occurred_at, what_happened, who_told, action_taken, status)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'open')) RETURNING *`,
      [newsroomId, occurred_at || null, what_happened.trim(), who_told || null, action_taken || null, status || null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/gov/incidents/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/governance/incidents/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { occurred_at, what_happened, who_told, action_taken, status } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE ai_incidents SET occurred_at = COALESCE($1, occurred_at), what_happened = COALESCE($2, what_happened),
         who_told = COALESCE($3, who_told), action_taken = COALESCE($4, action_taken), status = COALESCE($5, status)
       WHERE id = $6 AND newsroom_id = $7 RETURNING *`,
      [occurred_at ?? null, what_happened ?? null, who_told ?? null, action_taken ?? null, status ?? null, req.params.id, newsroomId]);
    if (!rows.length) return res.status(404).json({ message: 'not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/gov/incidents/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/governance/incidents/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    await pool.query('DELETE FROM ai_incidents WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    res.json({ ok: true });
  } catch (err) { console.error('[beaiready/gov/incidents/del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Grounded + cited suggestion for a standing review agenda + escalation path. Not saved.
router.post('/governance/review/suggest-agenda', async (req, res) => {
  try {
    const { organisationId, sectorId } = await tenantContext(req);
    const sources = await getRelevantKnowledge({
      categories: ['ai_governance'], orgId: organisationId, sectorId,
      searchTerms: 'AI governance review cadence monitoring standing agenda incident escalation path', limit: 6,
    }).catch(() => []);
    const grounded = sources.length > 0;
    const sourceBlock = grounded ? sources.map((s, i) => `[${i + 1}] ${s.title}: ${(s.content || '').slice(0, 400)}`).join('\n\n') : '';
    const system = `Propose a short STANDING AGENDA for a small business's periodic AI-governance review, plus a simple incident-escalation path. ${grounded ? 'Ground in the numbered SOURCES and cite the numbers used.' : 'No governance sources are available; use sensible general practice and return "cited": [].'} Return ONLY single-line JSON:
{"agenda":["short agenda items"],"escalation":"one or two sentences — who is told, who acts, in what order","cited":[source numbers used]}
This is generated guidance, not legal advice — verify with counsel.`;
    const userContent = grounded ? `SOURCES\n${sourceBlock}` : 'A small/medium business reviewing its AI use on a regular cadence.';
    const raw = String(await callClaude({ system, userContent, maxTokens: 600, temperature: 0.2 }));
    let out = {}; const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) { try { out = JSON.parse(raw.slice(a, b + 1)); } catch { /* keep */ } }
    const citations = grounded && Array.isArray(out.cited) ? out.cited.map((n) => sources[n - 1]).filter(Boolean).map((s) => ({ title: (s.title || '').replace(/ — part \d+\/\d+$/, ''), url: s.source_description || null })) : [];
    res.json({ agenda: Array.isArray(out.agenda) ? out.agenda : [], escalation: out.escalation || '', grounded, citations });
  } catch (err) { console.error('[beaiready/gov/suggest-agenda]', err); res.status(500).json({ message: err.message || 'Suggestion failed' }); }
});

// ── Governance · Evidence Trail (manual Component 6) ─────────────────────────
// Files (reusing the uploads pipeline) or links attached to a governance entity —
// the policy, a control, a review, or a register system. The proof that governance
// is real. Tenant-scoped; member-reachable.
const EVIDENCE_ENTITIES = ['ai_policy', 'ai_control', 'ai_review', 'ai_system'];

router.get('/governance/evidence', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { entity_type, entity_id } = req.query;
    const { rows } = await pool.query(
      `SELECT e.id, e.entity_type, e.entity_id, e.kind, e.url, e.label, e.upload_id, e.created_at,
              d.original_name, d.mime_type
         FROM ai_evidence e LEFT JOIN uploaded_documents d ON d.id = e.upload_id
        WHERE e.newsroom_id = $1
          AND ($2::text IS NULL OR e.entity_type = $2)
          AND ($3::uuid IS NULL OR e.entity_id = $3)
        ORDER BY e.created_at DESC`,
      [newsroomId, entity_type || null, entity_id || null]);
    res.json(rows);
  } catch (err) { console.error('[beaiready/gov/evidence/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Attach a link (JSON).
router.post('/governance/evidence/link', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { entity_type, entity_id, url, label } = req.body || {};
    if (!EVIDENCE_ENTITIES.includes(entity_type) || !entity_id || !url || !url.trim()) {
      return res.status(400).json({ message: 'entity_type, entity_id and url are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO ai_evidence (newsroom_id, entity_type, entity_id, kind, url, label, created_by)
       VALUES ($1,$2,$3,'link',$4,$5,$6) RETURNING *`,
      [newsroomId, entity_type, entity_id, url.trim(), label || null, req.user?.id || null]);
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/gov/evidence/link]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Attach a file (multipart — entity_type/entity_id/label must precede the file).
router.post('/governance/evidence', upload.single('file'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { entity_type, entity_id, label } = req.body || {};
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    if (!EVIDENCE_ENTITIES.includes(entity_type) || !entity_id) return res.status(400).json({ message: 'entity_type and entity_id are required' });
    const { rows: [doc] } = await pool.query(
      `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, uploaded_by, newsroom_id)
       VALUES ($1,$2,$3,$4,$5,'governance_evidence',$6,$7,$8) RETURNING id`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, entity_id, req.user?.id || null, newsroomId]);
    const { rows } = await pool.query(
      `INSERT INTO ai_evidence (newsroom_id, entity_type, entity_id, kind, upload_id, label, created_by)
       VALUES ($1,$2,$3,'upload',$4,$5,$6) RETURNING *`,
      [newsroomId, entity_type, entity_id, doc.id, label || req.file.originalname, req.user?.id || null]);
    res.status(201).json({ ...rows[0], original_name: req.file.originalname });
  } catch (err) { console.error('[beaiready/gov/evidence/upload]', err); res.status(500).json({ message: err.message || 'Upload failed' }); }
});

router.get('/governance/evidence/:id/download', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(
      `SELECT d.file_path, d.original_name FROM ai_evidence e
         JOIN uploaded_documents d ON d.id = e.upload_id
        WHERE e.id = $1 AND e.newsroom_id = $2 AND e.kind = 'upload'`,
      [req.params.id, newsroomId]);
    if (!rows.length) return res.status(404).json({ message: 'not found' });
    const doc = rows[0];
    if (!fs.existsSync(doc.file_path)) return res.status(404).json({ message: 'file missing' });
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) { console.error('[beaiready/gov/evidence/download]', err); res.status(500).json({ message: 'Download failed' }); }
});

router.delete('/governance/evidence/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query('DELETE FROM ai_evidence WHERE id = $1 AND newsroom_id = $2 RETURNING upload_id', [req.params.id, newsroomId]);
    if (rows.length && rows[0].upload_id) {
      const { rows: [d] } = await pool.query('DELETE FROM uploaded_documents WHERE id = $1 AND newsroom_id = $2 RETURNING file_path', [rows[0].upload_id, newsroomId]);
      if (d?.file_path) { try { fs.unlinkSync(d.file_path); } catch { /* file already gone */ } }
    }
    res.json({ ok: true });
  } catch (err) { console.error('[beaiready/gov/evidence/del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Governance Assessment (Part 3) — self-serve, four AIGP domains ────────────
// Extends the bair.audits engine: the client's newsroom resolves to its organisation's
// audit; governance questions → self_serve findings (carrying domain); scored per domain.
// Tenant-scoped throughout via tenantContext → newsroom → organisation. A business with
// no organisation linked gets a friendly 409 (the org-keyed engine can't attach).
router.get('/governance/assessment', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    res.json(await loadAssessment(newsroomId));
  } catch (err) {
    if (err instanceof AssessmentError) return res.status(409).json({ message: err.message, code: err.code });
    console.error('[beaiready/gov/assessment/get]', err); res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/governance/assessment/answers', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    res.json(await submitAnswers(newsroomId, req.body?.answers));
  } catch (err) {
    if (err instanceof AssessmentError) return res.status(err.code === 'bad_input' ? 400 : 409).json({ message: err.message, code: err.code });
    console.error('[beaiready/gov/assessment/answers]', err); res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/governance/assessment/scorecard', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const auditId = await resolveOrCreateAudit(newsroomId);
    res.json(await computeGovernanceScorecard(auditId));
  } catch (err) {
    if (err instanceof AssessmentError) return res.status(409).json({ message: err.message, code: err.code });
    console.error('[beaiready/gov/assessment/scorecard]', err); res.status(500).json({ message: 'Internal server error' });
  }
});

// Admin attestation — an admin stamps the tenant's governance result as reviewed.
router.post('/governance/assessment/attest', requireRole('admin'), async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const auditId = await resolveOrCreateAudit(newsroomId);
    const { rows } = await pool.query(
      `UPDATE bair.audits SET attested_by = $1, attested_at = NOW(), updated_at = NOW()
        WHERE id = $2 RETURNING attested_by, attested_at`, [req.user.id, auditId]);
    res.json(rows[0]);
  } catch (err) {
    if (err instanceof AssessmentError) return res.status(409).json({ message: err.message, code: err.code });
    console.error('[beaiready/gov/assessment/attest]', err); res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Governance Learning (Part 5) — the four-unit course, per-person progress ──
// Units are a GLOBAL catalogue (bair.gov_learning_unit); progress is per tenant + per
// person (bair.gov_learning_progress). Section content lives client-side in
// govLearningContent.js — this returns the catalogue joined with the caller's progress.
const LEARNING_STATUSES = ['not_started', 'in_progress', 'complete'];

router.get('/governance/learning', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { rows } = await pool.query(`
      SELECT u.unit_no, u.domain, u.title, u.summary,
             COALESCE(p.status, 'not_started') AS status, p.completed_at
        FROM bair.gov_learning_unit u
        LEFT JOIN bair.gov_learning_progress p
          ON p.unit_no = u.unit_no AND p.newsroom_id = $1 AND p.user_id = $2
       ORDER BY u.unit_no`, [newsroomId, req.user.id]);
    res.json({ units: rows, complete: rows.filter((r) => r.status === 'complete').length, total: rows.length });
  } catch (err) { console.error('[beaiready/gov/learning/get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/governance/learning/:unitNo/progress', async (req, res) => {
  try {
    const unitNo = Number(req.params.unitNo);
    const { status } = req.body || {};
    if (!Number.isInteger(unitNo)) return res.status(400).json({ message: 'unitNo must be an integer' });
    if (!LEARNING_STATUSES.includes(status)) return res.status(400).json({ message: `status must be one of: ${LEARNING_STATUSES.join(', ')}` });
    const { newsroomId } = await tenantContext(req);
    // Guard: only progress against a unit that exists in the catalogue.
    const { rows: unit } = await pool.query('SELECT 1 FROM bair.gov_learning_unit WHERE unit_no = $1', [unitNo]);
    if (!unit.length) return res.status(404).json({ message: 'Unknown learning unit' });
    // completed_at computed here (as its own typed param) so no parameter is reused across
    // two type contexts — otherwise Postgres can't deduce a consistent type for it.
    const completedAt = status === 'complete' ? new Date() : null;
    const { rows } = await pool.query(`
      INSERT INTO bair.gov_learning_progress (newsroom_id, user_id, unit_no, status, completed_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (newsroom_id, user_id, unit_no) DO UPDATE
        SET status = EXCLUDED.status,
            completed_at = CASE WHEN EXCLUDED.status = 'complete'
                                THEN COALESCE(bair.gov_learning_progress.completed_at, EXCLUDED.completed_at) ELSE NULL END,
            updated_at = NOW()
      RETURNING unit_no, status, completed_at`, [newsroomId, req.user.id, unitNo, status, completedAt]);
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready/gov/learning/progress]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Governance Knowledge Engine · admin corpus (global, shared across tenants) ─
// Ingest a governance document (regulation / framework / guidance / report) into the
// global 'ai_governance' corpus — chunked + embedded — so every tenant's governance
// AI grounds + cites against it. Admin-only.
router.post('/admin/governance/ingest', requireRole('admin'), async (req, res) => {
  try {
    const { title, text, framework, jurisdiction, sourceUrl } = req.body || {};
    if (!title || !title.trim() || !text || !text.trim()) {
      return res.status(400).json({ message: 'title and text are required' });
    }
    const result = await ingestGovernanceDocument({
      title: title.trim(), text, framework: framework || null,
      jurisdiction: jurisdiction || null, sourceUrl: sourceUrl || null,
    });
    res.status(201).json(result);
  } catch (err) { console.error('[beaiready/gov/ingest]', err); res.status(500).json({ message: err.message || 'Ingest failed' }); }
});

// List the governance corpus, grouped by source document. Admin-only.
router.get('/admin/governance/corpus', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(parent_document_id::text, id::text) AS document_id,
              MIN(split_part(title, ' — part', 1)) AS title,
              MIN(framework) AS framework, MIN(jurisdiction) AS jurisdiction,
              MIN(source_description) AS source, COUNT(*)::int AS chunks,
              bool_and(embedding IS NOT NULL) AS embedded,
              MAX(created_at) AS created_at
         FROM knowledge_entries
        WHERE category = 'ai_governance' AND is_active = true
        GROUP BY COALESCE(parent_document_id::text, id::text)
        ORDER BY MAX(created_at) DESC`
    );
    res.json(rows);
  } catch (err) { console.error('[beaiready/gov/corpus]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Governance · Engagement runner (manual Part 7 — the 6 phases as a workflow) ─
// The delivery manual AS a per-client status view: Scope → Discovery → Classify →
// Gap → Controls/Policy → Monitor, each phase's progress COMPUTED from the real
// governance data the client has built. Admin-only; pick any client via newsroom_id.
router.get('/admin/governance/runner', requireRole('admin'), async (req, res) => {
  try {
    const newsroomId = req.query.newsroom_id || (await resolveNewsroomId(req));
    const { rows: [nr] } = await pool.query('SELECT organisation_id FROM newsrooms WHERE id = $1', [newsroomId]);
    if (!nr) return res.status(404).json({ message: 'client not found' });
    const orgId = nr.organisation_id;

    const sys = (await pool.query(
      `SELECT count(*)::int n,
              count(*) FILTER (WHERE risk_tier IS NOT NULL AND risk_tier <> 'unclassified')::int classified,
              count(*) FILTER (WHERE risk_tier = 'unacceptable')::int unacceptable
         FROM ai_tool_inventory WHERE newsroom_id = $1`, [newsroomId])).rows[0];
    const controls = (await pool.query("SELECT count(*)::int n FROM ai_controls WHERE newsroom_id = $1 AND status = 'active'", [newsroomId])).rows[0].n;
    const policy = (await pool.query('SELECT 1 FROM ai_policies WHERE newsroom_id = $1', [newsroomId])).rowCount;
    const profile = (await pool.query('SELECT accountable_owner, review_cadence, next_review_date FROM ai_governance_profile WHERE newsroom_id = $1', [newsroomId])).rows[0] || null;
    const reviews = (await pool.query('SELECT count(*)::int n FROM ai_reviews WHERE newsroom_id = $1', [newsroomId])).rows[0].n;
    const inc = (await pool.query("SELECT count(*) FILTER (WHERE status = 'open')::int open FROM ai_incidents WHERE newsroom_id = $1", [newsroomId])).rows[0];
    const evidence = (await pool.query('SELECT count(*)::int n FROM ai_evidence WHERE newsroom_id = $1', [newsroomId])).rows[0].n;

    let audit = null, openFindings = 0;
    if (orgId) {
      audit = (await pool.query('SELECT id, readiness_score FROM bair.audits WHERE organisation_id = $1 ORDER BY created_at DESC LIMIT 1', [orgId])).rows[0] || null;
      if (audit) openFindings = (await pool.query('SELECT count(*)::int n FROM bair.findings WHERE audit_id = $1 AND resolved_at IS NULL', [audit.id])).rows[0].n;
    }

    const dueForReview = profile?.next_review_date && new Date(profile.next_review_date) <= new Date();
    const phases = [
      { key: 'scope', label: 'Scope & setup', status: 'done', detail: 'Client onboarded' },
      { key: 'discovery', label: 'Discovery — AI register', status: sys.n > 0 ? 'done' : 'todo', detail: `${sys.n} system${sys.n === 1 ? '' : 's'} in the register` },
      { key: 'classify', label: 'Risk classification', status: sys.n === 0 ? 'todo' : (sys.classified >= sys.n ? 'done' : 'in_progress'), detail: `${sys.classified}/${sys.n} classified${sys.unacceptable ? ` · ${sys.unacceptable} unacceptable` : ''}` },
      { key: 'gap', label: 'Gap analysis', status: audit ? (openFindings > 0 ? 'in_progress' : 'done') : 'todo', detail: audit ? `readiness ${audit.readiness_score ?? '—'} · ${openFindings} open finding${openFindings === 1 ? '' : 's'}` : 'no audit yet' },
      { key: 'controls', label: 'Controls & policy', status: (controls > 0 && policy > 0) ? 'done' : (controls > 0 || policy > 0) ? 'in_progress' : 'todo', detail: `${controls} control${controls === 1 ? '' : 's'} · policy ${policy ? 'saved' : 'not set'}` },
      { key: 'monitor', label: 'Monitoring & review', status: profile?.accountable_owner ? (reviews > 0 ? 'done' : 'in_progress') : 'todo', detail: `${profile?.accountable_owner ? `owner set · ${profile.review_cadence || 'quarterly'}` : 'no owner named'} · ${reviews} review${reviews === 1 ? '' : 's'}${inc.open ? ` · ${inc.open} open incident` : ''}${dueForReview ? ' · review due' : ''}` },
    ];
    res.json({ newsroom_id: newsroomId, phases, done: phases.filter((p) => p.status === 'done').length, total: phases.length, evidence });
  } catch (err) { console.error('[beaiready/gov/runner]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Admin · manage client businesses (each business = one tenant/login) ─────
// All admin-only. A "client" is a newsrooms row with kind='business' + a linked
// organisation; its users are team_members homed in that newsroom.
router.get('/admin/clients', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.name, n.slug, n.is_active, n.created_at, o.website, o.country, s.name AS sector,
              (n.access_code_hash IS NOT NULL) AS has_access_code,
              n.shares_anonymised_insights,
              (SELECT COUNT(*)::int FROM team_members t WHERE t.newsroom_id = n.id) AS user_count,
              EXISTS (SELECT 1 FROM ai_policies p WHERE p.newsroom_id = n.id) AS has_policy,
              (SELECT COUNT(*)::int FROM visibility_checks v WHERE v.newsroom_id = n.id) AS visibility_checks,
              (SELECT COUNT(*)::int FROM ai_tool_inventory i WHERE i.newsroom_id = n.id) AS tools_logged,
              (SELECT COUNT(*)::int FROM recommendations r WHERE r.newsroom_id = n.id) AS recommendations,
              (SELECT COUNT(*)::int FROM business_metrics m WHERE m.newsroom_id = n.id) AS metrics
         FROM newsrooms n
         LEFT JOIN organisations o ON o.id = n.organisation_id
         LEFT JOIN sectors s ON s.id = o.sector_id
        WHERE n.kind = 'business'
        ORDER BY n.created_at`
    );
    res.json(rows);
  } catch (err) { console.error('[beaiready/admin/clients]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Set / rotate / clear a company's self-registration access code (stored hashed).
// Members of this company use it (with their own password) to register. Empty/null
// clears it → the company is no longer open for self-registration.
router.post('/admin/clients/:id/access-code', requireRole('admin'), async (req, res) => {
  try {
    const code = (req.body?.access_code ?? '').trim();
    const hash = code ? await bcrypt.hash(code, 10) : null;
    const { rowCount } = await pool.query(
      `UPDATE newsrooms SET access_code_hash = $1, updated_at = NOW() WHERE id = $2 AND kind = 'business'`,
      [hash, req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Company not found' });
    res.json({ ok: true, has_access_code: !!hash });
  } catch (err) { console.error('[beaiready/admin/clients/access-code]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Per-company consent to contribute to the anonymised cross-business insight pool.
// Off by default; nothing of a business's crosses the boundary unless it opts in.
router.post('/admin/clients/:id/insights-consent', requireRole('admin'), async (req, res) => {
  try {
    const consent = !!req.body?.consent;
    const { rowCount } = await pool.query(
      `UPDATE newsrooms SET shares_anonymised_insights = $1, updated_at = NOW() WHERE id = $2 AND kind = 'business'`,
      [consent, req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Company not found' });
    res.json({ ok: true, shares_anonymised_insights: consent });
  } catch (err) { console.error('[beaiready/admin/clients/insights-consent]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Create a client: organisation + business tenant + (optional) first login.
router.post('/admin/clients', requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, website, adminEmail, adminPassword } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'business name required' });
    let slug = slugify(name);
    if (!slug) return res.status(400).json({ message: 'could not derive a slug' });
    const taken = await client.query('SELECT 1 FROM newsrooms WHERE slug = $1', [slug]);
    if (taken.rowCount) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    await client.query('BEGIN');
    // Business sector (idempotent — created in migration 082, but be safe).
    await client.query(
      `INSERT INTO sectors (name, slug, colour, description)
       SELECT 'Business', 'business', '#c75b39', 'BE AI READY client businesses (SMEs).'
       WHERE NOT EXISTS (SELECT 1 FROM sectors WHERE slug = 'business')`
    );
    const sector = await client.query("SELECT id FROM sectors WHERE slug = 'business'");
    const org = await client.query(
      `INSERT INTO organisations (name, type, country, website, sector_id)
       VALUES ($1, 'client', 'South Africa', $2, $3) RETURNING id`,
      [name.trim(), website || null, sector.rows[0].id]
    );
    const nr = await client.query(
      `INSERT INTO newsrooms (name, slug, kind, organisation_id) VALUES ($1,$2,'business',$3) RETURNING *`,
      [name.trim(), slug, org.rows[0].id]
    );
    let user = null;
    if (adminEmail && adminPassword) {
      if (adminPassword.length < 6) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'password must be at least 6 characters' }); }
      const exists = await client.query('SELECT 1 FROM team_members WHERE email = $1', [adminEmail.trim().toLowerCase()]);
      if (exists.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'a user with that email already exists' }); }
      const hash = await bcrypt.hash(adminPassword, 10);
      const u = await client.query(
        `INSERT INTO team_members (name, email, password_hash, role, tracker_access, is_active, newsroom_id)
         VALUES ($1,$2,$3,'member',true,true,$4) RETURNING id, name, email`,
        [name.trim(), adminEmail.trim().toLowerCase(), hash, nr.rows[0].id]
      );
      user = u.rows[0];
    }
    await client.query('COMMIT');
    res.status(201).json({ ...nr.rows[0], user_count: user ? 1 : 0, first_user: user });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[beaiready/admin/clients/post]', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally { client.release(); }
});

router.get('/admin/clients/:id/users', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, is_active, last_login, created_at
         FROM team_members WHERE newsroom_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { console.error('[beaiready/admin/clients/users]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.post('/admin/clients/:id/users', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password required' });
    if (password.length < 6) return res.status(400).json({ message: 'password must be at least 6 characters' });
    const nr = await pool.query("SELECT 1 FROM newsrooms WHERE id = $1 AND kind = 'business'", [req.params.id]);
    if (!nr.rowCount) return res.status(404).json({ message: 'client not found' });
    const exists = await pool.query('SELECT 1 FROM team_members WHERE email = $1', [email.trim().toLowerCase()]);
    if (exists.rowCount) return res.status(409).json({ message: 'a user with that email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO team_members (name, email, password_hash, role, tracker_access, is_active, newsroom_id)
       VALUES ($1,$2,$3,'member',true,true,$4) RETURNING id, name, email, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), hash, req.params.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error('[beaiready/admin/clients/users/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Admin · Models (provider config + per-function model choice) ────────────
router.get('/admin/settings', requireRole('admin'), async (req, res) => {
  try {
    res.json({
      providers: await providerStatus(),     // configured booleans + source, no secrets
      functions: FUNCTIONS,                   // the configurable functions + defaults
      config: await getModelConfig(),         // current per-function choices
    });
  } catch (err) { console.error('[beaiready/admin/settings]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/admin/settings', requireRole('admin'), async (req, res) => {
  try {
    const incoming = req.body?.config || {};
    const clean = {};
    for (const f of FUNCTIONS) {
      if (!(f.key in incoming)) continue;
      const v = incoming[f.key];
      if (f.multi) clean[f.key] = (Array.isArray(v) ? v : []).filter((p) => PROVIDERS[p]);
      else if (PROVIDERS[v]) clean[f.key] = v;
    }
    await saveModelConfig({ ...(await getModelConfig()), ...clean }, req.user?.id);
    res.json(await getModelConfig());
  } catch (err) { console.error('[beaiready/admin/settings/put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Save a provider key / endpoint (write-only — never returned).
router.put('/admin/provider-key', requireRole('admin'), async (req, res) => {
  try {
    const { provider, value } = req.body || {};
    if (!PROVIDERS[provider]) return res.status(400).json({ message: 'unknown provider' });
    if (!value || !String(value).trim()) return res.status(400).json({ message: 'value required' });
    await saveProviderSecret(provider, String(value).trim(), req.user?.id);
    res.json({ ok: true, provider });
  } catch (err) { console.error('[beaiready/admin/provider-key]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Client self-serve extraction (Tier 1 — private to the member) ────────────
// A client team member uploads their OWN documents and gets text + an AI summary +
// structured data back, in a space that is THEIRS. It does NOT flow into the company
// knowledge the AI reasons over — only an admin promotion (the Gate-1 pattern) lifts a
// doc to the company tier. Reuses the shared engine (processUpload), which skips the
// knowledge-base step for this entity_type. Tenant-scoped + owner-scoped.
const CLIENT_EXTRACTION = 'bair_client_extraction';

router.post('/extraction', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const newsroomId = await resolveNewsroomId(req);
    const { rows: [doc] } = await pool.query(
      `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, uploaded_by, newsroom_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, original_name, mime_type, file_size, extraction_status, created_at`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, CLIENT_EXTRACTION, newsroomId, req.user.id, newsroomId]);
    // Extract + summarise in the background; the client polls GET /extraction/:id.
    processUpload(doc.id).catch((e) => console.error('[bair/extraction processUpload]', e.message));
    res.status(201).json(doc);
  } catch (err) { console.error('[beaiready/extraction:post]', err); res.status(500).json({ message: err.message || 'Upload failed' }); }
});

router.get('/extraction', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows } = await pool.query(
      `SELECT id, original_name, mime_type, file_size, extraction_status, ai_analysis_status, ai_summary, created_at
         FROM uploaded_documents
        WHERE entity_type = $1 AND newsroom_id = $2 AND uploaded_by = $3
        ORDER BY created_at DESC LIMIT 100`, [CLIENT_EXTRACTION, newsroomId, req.user.id]);
    res.json(rows);
  } catch (err) { console.error('[beaiready/extraction:list]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.get('/extraction/:id', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows: [doc] } = await pool.query(
      `SELECT id, original_name, mime_type, file_size, extraction_status, ai_analysis_status,
              extracted_text, ai_summary, ai_extracted_data, created_at
         FROM uploaded_documents
        WHERE id = $1 AND newsroom_id = $2 AND entity_type = $3 AND uploaded_by = $4`,
      [req.params.id, newsroomId, CLIENT_EXTRACTION, req.user.id]);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json(doc);
  } catch (err) { console.error('[beaiready/extraction:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.delete('/extraction/:id', async (req, res) => {
  try {
    const newsroomId = await resolveNewsroomId(req);
    const { rows: [doc] } = await pool.query(
      `DELETE FROM uploaded_documents WHERE id = $1 AND newsroom_id = $2 AND entity_type = $3 AND uploaded_by = $4 RETURNING file_path`,
      [req.params.id, newsroomId, CLIENT_EXTRACTION, req.user.id]);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    if (doc.file_path) fs.unlink(doc.file_path, () => {});
    res.json({ deleted: true });
  } catch (err) { console.error('[beaiready/extraction:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
