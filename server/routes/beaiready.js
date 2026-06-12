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
    const { tool_name, used_by, data_shared } = req.body || {};
    if (!tool_name || !tool_name.trim()) return res.status(400).json({ message: 'tool_name required' });
    const match = await matchTool(tool_name);
    const { rows } = await pool.query(
      `INSERT INTO ai_tool_inventory (newsroom_id, tool_name, used_by, data_shared, matched_tool_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [newsroomId, tool_name.trim(), used_by || null, data_shared || null, match?.id || null]
    );
    res.status(201).json({ ...rows[0], matched_name: match?.name || null });
  } catch (err) { console.error('[beaiready/inv/post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/security/inventory/:id', async (req, res) => {
  try {
    const { newsroomId } = await tenantContext(req);
    const { used_by, data_shared, acceptability, ruling, fix } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE ai_tool_inventory SET
         used_by = COALESCE($1, used_by), data_shared = COALESCE($2, data_shared),
         acceptability = COALESCE($3, acceptability), ruling = COALESCE($4, ruling),
         fix = COALESCE($5, fix), updated_at = NOW()
       WHERE id = $6 AND newsroom_id = $7 RETURNING *`,
      [used_by ?? null, data_shared ?? null, acceptability ?? null, ruling ?? null, fix ?? null, req.params.id, newsroomId]
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

// ── Admin · manage client businesses (each business = one tenant/login) ─────
// All admin-only. A "client" is a newsrooms row with kind='business' + a linked
// organisation; its users are team_members homed in that newsroom.
router.get('/admin/clients', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.name, n.slug, n.is_active, n.created_at, o.website, o.country, s.name AS sector,
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

export default router;
