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

// Generate a business AI-use policy draft from a short brief (does NOT save —
// the client reviews, edits and saves with PUT). Business-framed, ZA/POPIA aware.
router.post('/policy/generate', async (req, res) => {
  try {
    const body = req.body || {};
    const existingPolicy = body.existingPolicy || '';
    if (existingPolicy.length > 20000) {
      return res.status(400).json({ message: 'Policy text is too long (max ~20,000 characters).' });
    }

    // Ground the policy in what we actually know about THIS business (tenant-scoped),
    // so it's specific, not boilerplate. Body fields stay as optional overrides.
    const newsroomId = await resolveNewsroomId(req);
    const knownLines = [];
    let tName = '', tSector = '';
    try {
      const { rows: [t] } = await pool.query(
        `SELECT o.name AS org, o.country, s.name AS sector FROM newsrooms n
           LEFT JOIN organisations o ON o.id = n.organisation_id
           LEFT JOIN sectors s ON s.id = o.sector_id WHERE n.id = $1`, [newsroomId]);
      tName = t?.org || ''; tSector = t?.sector || '';
      if (t?.org) knownLines.push(`Business: ${t.org}${t.sector ? ` (sector: ${t.sector})` : ''}${t.country ? `, ${t.country}` : ''}`);
      const { rows: tools } = await pool.query(
        `SELECT tool_name, data_shared FROM ai_tool_inventory WHERE newsroom_id = $1 ORDER BY created_at DESC LIMIT 30`, [newsroomId]).catch(() => ({ rows: [] }));
      if (tools.length) knownLines.push(`AI tools the team actually uses: ${tools.map((x) => `${x.tool_name}${x.data_shared ? ` (data put in: ${x.data_shared})` : ''}`).join('; ')}`);
      const { rows: intake } = await pool.query(
        `SELECT response FROM intake_responses WHERE newsroom_id = $1 ORDER BY submitted_at DESC NULLS LAST LIMIT 20`, [newsroomId]).catch(() => ({ rows: [] }));
      if (intake.length) {
        const ans = intake.map((r) => Object.entries(r.response || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')).filter(Boolean);
        knownLines.push(`Staff AI-readiness survey (${intake.length} responses):\n${ans.join('\n').slice(0, 3500)}`);
      }
    } catch (e) { console.error('[policy/generate context]', e.message); }
    const businessName = body.businessName || tName || '';
    const sector = body.sector || tSector || '';
    const aiUses = body.aiUses || '';
    // Auto-grounding is for the tenant's OWN policy. Suppress it ONLY when the caller
    // names a DIFFERENT business than this tenant (an explicit override for someone
    // else) — injecting this tenant's identity/intake would then contradict the brief.
    // If they leave it blank, OR type their own business name, keep the grounding so an
    // L2B member who fills in "Leads 2 Business" still gets a policy specific to them.
    const overrideName = (body.businessName || '').trim();
    const namesOwnBusiness = overrideName && tName && overrideName.toLowerCase() === tName.trim().toLowerCase();
    const suppressGrounding = overrideName && !namesOwnBusiness;
    const known = (!suppressGrounding && knownLines.length)
      ? `\n\nWHAT WE KNOW ABOUT THIS BUSINESS (ground the policy in this — be specific to them, never generic):\n${knownLines.join('\n')}`
      : '';

    const system = `You are an AI-governance adviser helping a SMALL OR MEDIUM BUSINESS (not a newsroom) write its AI-use policy. Be concrete and practical for a business — covering: acceptable AI use by staff, what company/client/personal data may and may not be put into AI tools, approved vs unapproved tools, accountability (who approves AI use, who answers when something goes wrong), POPIA and emerging AI-regulation alignment, and review cadence. Plain language a manager can adopt and defend — never generic boilerplate.

Respond in TWO parts, in this exact order:

PART 1 — a single-line JSON object (NO code fence, NO newlines inside it) with keys:
  "title": string,
  "summary": "1-2 sentence overview",
  "checklist": ["short adoptable action items the business should do to put this policy in place"]

PART 2 — a line containing exactly:
---POLICY---
…then the full policy as markdown (clear sections, concrete rules a business can actually follow). Put NO JSON here.`;

    const brief = (existingPolicy && existingPolicy.trim().length >= 40
      ? `MODE: review and improve this existing policy for a business.\nBusiness: ${businessName || '(unspecified)'}\nSector: ${sector || '(unspecified)'}\n\nEXISTING POLICY:\n${existingPolicy}`
      : `MODE: draft a new AI-use policy from this brief.\nBusiness: ${businessName || 'a small/medium business'}\nSector: ${sector || '(unspecified)'}\nHow they use (or plan to use) AI: ${aiUses || '(unspecified — cover common SME uses: drafting, summarising, customer comms, analysis)'}\nJurisdiction: South Africa (POPIA).`) + known;

    const raw = String(await callClaude({ system, userContent: brief, maxTokens: 3000, temperature: 0.3 }));
    const [metaPart, ...rest] = raw.split('---POLICY---');
    const policyMarkdown = rest.join('---POLICY---').trim();
    let meta = {};
    const jsonStr = metaPart.replace(/```json|```/g, '');
    const a = jsonStr.indexOf('{'), b = jsonStr.lastIndexOf('}');
    if (a >= 0 && b > a) { try { meta = JSON.parse(jsonStr.slice(a, b + 1)); } catch { /* defaults */ } }
    res.json({
      title: meta.title || 'AI-use policy',
      summary: meta.summary || '',
      checklist: Array.isArray(meta.checklist) ? meta.checklist : [],
      content: policyMarkdown || raw.replace('---POLICY---', '').trim(),
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
