// BE AI READY — business-tenant dashboard API (spec Part C).
// Mounted at /api/beaiready behind requireAuth. Every read is scoped to the
// CALLER'S OWN business tenant (its newsroom + linked organisation); a business
// member can only ever see their own data. Admin-only writes self-guard inline.
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { resolveNewsroomId } from '../lib/tenancy.js';
import { callClaude } from '../services/claude.js';

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

const PILLARS = ['visibility', 'governance', 'security'];

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
    const { businessName = '', sector = '', aiUses = '', existingPolicy = '' } = req.body || {};
    if (existingPolicy && existingPolicy.length > 20000) {
      return res.status(400).json({ message: 'Policy text is too long (max ~20,000 characters).' });
    }
    const system = `You are an AI-governance adviser helping a SMALL OR MEDIUM BUSINESS (not a newsroom) write its AI-use policy. Be concrete and practical for a business — covering: acceptable AI use by staff, what company/client/personal data may and may not be put into AI tools, approved vs unapproved tools, accountability (who approves AI use, who answers when something goes wrong), POPIA and emerging AI-regulation alignment, and review cadence. Plain language a manager can adopt and defend — never generic boilerplate.

Respond in TWO parts, in this exact order:

PART 1 — a single-line JSON object (NO code fence, NO newlines inside it) with keys:
  "title": string,
  "summary": "1-2 sentence overview",
  "checklist": ["short adoptable action items the business should do to put this policy in place"]

PART 2 — a line containing exactly:
---POLICY---
…then the full policy as markdown (clear sections, concrete rules a business can actually follow). Put NO JSON here.`;

    const brief = existingPolicy && existingPolicy.trim().length >= 40
      ? `MODE: review and improve this existing policy for a business.\nBusiness: ${businessName || '(unspecified)'}\nSector: ${sector || '(unspecified)'}\n\nEXISTING POLICY:\n${existingPolicy}`
      : `MODE: draft a new AI-use policy from this brief.\nBusiness: ${businessName || 'a small/medium business'}\nSector: ${sector || '(unspecified)'}\nHow they use (or plan to use) AI: ${aiUses || '(unspecified — cover common SME uses: drafting, summarising, customer comms, analysis)'}\nJurisdiction: South Africa (POPIA).`;

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

export default router;
