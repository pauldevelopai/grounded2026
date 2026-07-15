// beaiready-knowhow.js — the MEMBER-facing KnowHow surface (mounted behind
// requireAuth + resolveTenant). Two things a team member can do for themselves:
//   • see their OWN Tier-1 knowledge & workflows (private to them), and add a workflow;
//   • ask the new-staff coach, grounded only in COMPANY-tier knowledge.
// Everything is scoped to the caller's own newsroom + own KnowHow person. Promotion to
// company tier stays admin-only (Gate 1) and lives in the admin router — never here.
import { Router } from 'express';
import pool from '../db/pool.js';
import { resolveNewsroomId, OFFICE_NEWSROOM_ID } from '../lib/tenancy.js';
import { ensureKnowhowTenantForNewsroom, ensureKnowhowPerson, knowhowTenantIdForNewsroom, knowhowPersonId } from '../knowhow/identity.js';
import { askCompanyCoach } from '../services/company-coach.js';
import { upload } from '../middleware/upload.js';
import { scrapeArticle } from '../services/web-scraper.js';
import { extractText } from '../services/document-processor.js';
import { encryptFor, decryptFor } from '../services/crypto.js';
import { indexSource, searchCompanyChunks, sourceChunkStats } from '../services/company-knowledge-index.js';
import { ingestUrls, ingestSitemap, ingestDriveFolder, driveAvailable } from '../services/company-knowledge-ingest.js';
import { getSettings, saveSettings, buildBundle, bundleStats } from '../services/company-knowledge-bundle.js';
import { applyRules, applyRulesAll, countMatches, isPublishable, RULE_TARGET_FIELDS, RULE_WHEN_FIELDS, OPS } from '../services/company-knowledge-rules.js';
import { generateSummaries, buildJsonLd, jsonLdScript } from '../services/company-knowledge-generate.js';
import { PRESETS } from '../services/knowhow-presets.js';
import { listMines, addMine, removeMine, getMine, verifyClaims, claimsReport, addManualClaim, updateClaim, addCounterclaim, deleteManualEvidence, searchClaims, listThemes, exportClaims, listOrgCriteria } from '../services/claims-verify.js';

const router = Router();

async function ctx(req) {
  const newsroomId = await resolveNewsroomId(req);
  const { rows: [n] } = await pool.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
  return { newsroomId, name: n?.name || null };
}

// Optional Claims-Verifier tagging on a source: which mine (collection) + its role.
function sourceMeta(body = {}) {
  const collection = body.collection ? String(body.collection).trim().slice(0, 120) || null : null;
  const role = ['claim', 'reporting', 'external', 'criteria'].includes(body.role) ? body.role : 'reporting';
  return { collection, role };
}

// My own Tier-1 knowledge & workflows — only my rows, only individual tier.
router.get('/mine', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.json({ knowledge: [], workflows: [] });
    const tenantId = await knowhowTenantIdForNewsroom(pool, newsroomId);
    if (!tenantId) return res.json({ knowledge: [], workflows: [] });
    const personId = await knowhowPersonId(pool, { tenantId, teamMemberId: req.user.id });
    if (!personId) return res.json({ knowledge: [], workflows: [] });
    const [{ rows: knowledge }, { rows: workflows }] = await Promise.all([
      pool.query(
        `SELECT id, text, origin, created_at FROM knowhow.corpus_items
          WHERE tenant_id = $1 AND person_id = $2 AND tier = 'individual'
          ORDER BY created_at DESC LIMIT 100`, [tenantId, personId]),
      pool.query(
        `SELECT id, title, steps, created_at FROM knowhow.workflows
          WHERE tenant_id = $1 AND person_id = $2 AND tier = 'individual'
          ORDER BY created_at DESC LIMIT 100`, [tenantId, personId]),
    ]);
    res.json({ knowledge, workflows });
  } catch (err) { console.error('[beaiready-knowhow/mine]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Author one of my own workflows (Tier 1). Steps are ordered [{ step, detail }].
router.post('/workflows', async (req, res) => {
  try {
    const { newsroomId, name } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const { title, steps } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ message: 'A title is required.' });
    const clean = (Array.isArray(steps) ? steps : [])
      .map((s) => ({ step: String(s?.step || '').trim(), detail: String(s?.detail || '').trim() }))
      .filter((s) => s.step);
    if (!clean.length) return res.status(400).json({ message: 'Add at least one step.' });
    const tenantId = await ensureKnowhowTenantForNewsroom(pool, { newsroomId, name });
    const personId = await ensureKnowhowPerson(pool, { tenantId, teamMemberId: req.user.id, name: req.user.name });
    const { rows: [w] } = await pool.query(
      `INSERT INTO knowhow.workflows (tenant_id, person_id, title, steps)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING id, title, steps, created_at`,
      [tenantId, personId, title.trim(), JSON.stringify(clean)]);
    res.status(201).json(w);
  } catch (err) { console.error('[beaiready-knowhow/workflows:post]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Delete one of my own Tier-1 workflows (never a promoted/company one).
router.delete('/workflows/:id', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const tenantId = await knowhowTenantIdForNewsroom(pool, newsroomId);
    if (!tenantId) return res.status(404).json({ message: 'Not found' });
    const personId = await knowhowPersonId(pool, { tenantId, teamMemberId: req.user.id });
    if (!personId) return res.status(404).json({ message: 'Not found' });
    const { rowCount } = await pool.query(
      `DELETE FROM knowhow.workflows WHERE id = $1 AND tenant_id = $2 AND person_id = $3 AND tier = 'individual'`,
      [req.params.id, tenantId, personId]);
    if (!rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[beaiready-knowhow/workflows:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// The new-staff coach — grounded ONLY in company-tier knowledge.
router.post('/coach', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'The coach is for client businesses.' });
    const { question } = req.body || {};
    if (!question || !question.trim()) return res.status(400).json({ message: 'A question is required.' });
    if (question.length > 2000) return res.status(400).json({ message: 'Question is too long (max 2000 characters).' });
    const result = await askCompanyCoach({ newsroomId, question: question.trim() });
    res.json(result);
  } catch (err) { console.error('[beaiready-knowhow/coach]', err); res.status(500).json({ message: err.message || 'Coach failed' }); }
});

// ── Your knowledge sources — the business's OWN documents / website / notes that
// ground its company AI. Business-self-serve (member-facing), scoped to the caller's
// own newsroom. These land in beaiready_company_sources — the same substrate the Team
// AI assistant and the coach already read — so uploads feed the AI immediately.
// Mirrors the admin /training/company-knowledge/* routes, minus the admin gate, and
// takes the newsroom from the token (never a body param).
router.get('/sources', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.json([]);
    const [{ rows }, stats] = await Promise.all([
      pool.query(
        `SELECT id, kind, title, url, file_id, extracted_text, inclusion, sensitivity, created_at,
                out_clean_markdown, out_json_ld, out_mirror_md, in_llms_txt, in_llms_full
           FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]),
      sourceChunkStats(newsroomId),
    ]);
    res.json(rows.map((r) => {
      const text = decryptFor(newsroomId, r.extracted_text) || '';
      const st = stats[r.id] || { chunks: 0, embedded: 0 };
      const publish = r.out_clean_markdown && r.out_json_ld && r.out_mirror_md && r.in_llms_txt && r.in_llms_full;
      return { id: r.id, kind: r.kind, title: r.title, url: r.url, file_id: r.file_id, created_at: r.created_at,
        snippet: text.slice(0, 220), has_text: text.length > 0,
        included: r.inclusion !== 'exclude', sensitive: r.sensitivity !== 'none', publish, chunks: st.chunks, embedded: st.embedded };
    }));
  } catch (err) { console.error('[beaiready-knowhow/sources:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Search your knowledge — the best-matching passages across your documents.
router.get('/sources/search', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.json({ results: [] });
    const results = await searchCompanyChunks(newsroomId, req.query.q, { limit: 8 });
    res.json({ results });
  } catch (err) { console.error('[beaiready-knowhow/sources:search]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// "Your knowledge" quick controls — map the simple Include / Sensitive / Publish
// toggles onto the manifest columns (inclusion / sensitivity / the five out_* toggles)
// and mark them as manual so bulk rules never overwrite a hand edit.
router.patch('/sources/:id', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const b = req.body || {};
    const sets = [], vals = [], touched = [];
    const OUTS = ['out_clean_markdown', 'out_json_ld', 'out_mirror_md', 'in_llms_txt', 'in_llms_full'];
    if (typeof b.included === 'boolean') { sets.push(`inclusion = $${vals.length + 1}`); vals.push(b.included ? 'include' : 'exclude'); touched.push('inclusion'); }
    if (typeof b.sensitive === 'boolean') { sets.push(`sensitivity = $${vals.length + 1}`); vals.push(b.sensitive ? 'source-protected' : 'none'); }
    if (typeof b.publish === 'boolean') { for (const c of OUTS) { sets.push(`${c} = $${vals.length + 1}`); vals.push(b.publish); touched.push(c); } }
    if (!sets.length) return res.status(400).json({ message: 'Nothing to update.' });
    if (touched.length) { sets.push(`manual_overrides = (SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb) FROM jsonb_array_elements_text(manual_overrides || $${vals.length + 1}::jsonb) e)`); vals.push(JSON.stringify(touched)); }
    vals.push(req.params.id, newsroomId);
    const { rows } = await pool.query(
      `UPDATE beaiready_company_sources SET ${sets.join(', ')}
        WHERE id = $${vals.length - 1} AND newsroom_id = $${vals.length}
        RETURNING id, inclusion, sensitivity`, vals);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { console.error('[beaiready-knowhow/sources:patch]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Wrap multer so a rejected file (unsupported type / too large) returns a clean
// message instead of crashing into a generic 500.
function uploadFiles(req, res, next) {
  upload.array('files')(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is over the size limit (100 MB).'
      : /not supported/i.test(err.message || '')
        ? 'That file type isn’t supported yet. Use PDF, Word (.docx), a spreadsheet, CSV or text.'
        : (err.message || 'That file could not be uploaded.');
    res.status(400).json({ message: msg });
  });
}

// Upload one or more files → extract text → store as company knowledge.
router.post('/sources/upload', uploadFiles, async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const { collection, role } = sourceMeta(req.body);
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'Choose a file to add first.' });
    const added = [];
    for (const f of files) {
      const { rows: [doc] } = await pool.query(
        `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,'company_knowledge',$6,$7) RETURNING id`,
        [f.filename, f.originalname, f.mimetype, f.size, f.path, newsroomId, req.user.id]);
      let text = '';
      try { text = await extractText(f.path, f.mimetype); } catch (e) { console.error('[knowhow sources extract]', e.message); }
      const { rows: [src] } = await pool.query(
        `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, file_id, extracted_text, created_by, collection, role)
         VALUES ($1,'doc',$2,$3,$4,$5,$6,$7) RETURNING id, kind, title, file_id, created_at`,
        [newsroomId, f.originalname, doc.id, encryptFor(newsroomId, (text || '').slice(0, 20000)), req.user.id, collection, role]);
      let ix = { chunks: 0, embedded: 0 };
      try { ix = await indexSource(src.id, newsroomId, text); } catch (e) { console.error('[knowhow index upload]', e.message); }
      added.push({ ...src, has_text: (text || '').length > 0, ...ix });
    }
    res.status(201).json({ added });
  } catch (err) { console.error('[beaiready-knowhow/sources:upload]', err); res.status(500).json({ message: err.message || 'Upload failed' }); }
});

// Add a public web page → scrape → store as company knowledge.
router.post('/sources/website', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const { url } = req.body || {};
    if (!url || !url.trim()) return res.status(400).json({ message: 'A URL is required.' });
    const { collection, role } = sourceMeta(req.body);
    const scraped = await scrapeArticle(url.trim());
    if (!scraped.success || !scraped.text) return res.status(400).json({ message: `Couldn't read that page${scraped.error ? `: ${scraped.error}` : ''}` });
    const { rows: [src] } = await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, url, extracted_text, created_by, collection, role)
       VALUES ($1,'website',$2,$3,$4,$5,$6,$7) RETURNING id, kind, title, url, created_at`,
      [newsroomId, scraped.title || url.trim(), url.trim(), encryptFor(newsroomId, scraped.text), req.user.id, collection, role]);
    try { await indexSource(src.id, newsroomId, scraped.text); } catch (e) { console.error('[knowhow index website]', e.message); }
    res.status(201).json(src);
  } catch (err) { console.error('[beaiready-knowhow/sources:website]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Add a typed note → store as company knowledge.
router.post('/sources/note', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const { title, text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ message: 'Some text is required.' });
    const { collection, role } = sourceMeta(req.body);
    const { rows: [src] } = await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, extracted_text, created_by, collection, role)
       VALUES ($1,'note',$2,$3,$4,$5,$6) RETURNING id, kind, title, created_at`,
      [newsroomId, (title || 'Note').trim(), encryptFor(newsroomId, text.trim()), req.user.id, collection, role]);
    try { await indexSource(src.id, newsroomId, text.trim()); } catch (e) { console.error('[knowhow index note]', e.message); }
    res.status(201).json(src);
  } catch (err) { console.error('[beaiready-knowhow/sources:note]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// What bulk sources are available (Drive needs a server-side Google API key).
router.get('/sources/capabilities', async (_req, res) => {
  res.json({ drive: driveAvailable() });
});

// Add many web pages at once (multi-line list).
router.post('/sources/urls', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const r = await ingestUrls(newsroomId, req.user.id, req.body?.urls, sourceMeta(req.body));
    return r.total === 0 ? res.status(400).json({ message: r.message || 'No usable URLs.' }) : res.status(201).json(r);
  } catch (err) { console.error('[beaiready-knowhow/sources:urls]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Crawl a sitemap.xml → ingest every page it lists.
router.post('/sources/sitemap', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const r = await ingestSitemap(newsroomId, req.user.id, req.body?.sitemap, sourceMeta(req.body));
    return r.total === 0 ? res.status(400).json({ message: r.message || 'No pages found.' }) : res.status(201).json(r);
  } catch (err) { console.error('[beaiready-knowhow/sources:sitemap]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Import a public "anyone with the link" Google Drive folder.
router.post('/sources/drive', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const r = await ingestDriveFolder(newsroomId, req.user.id, req.body?.folder, sourceMeta(req.body));
    return r.error ? res.status(400).json({ message: r.message }) : res.status(201).json(r);
  } catch (err) { console.error('[beaiready-knowhow/sources:drive]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Remove a source (newsroom-scoped).
router.delete('/sources/:id', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const { rowCount } = await pool.query(
      'DELETE FROM beaiready_company_sources WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    if (!rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { console.error('[beaiready-knowhow/sources:del]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Outward publishing: the AI-ready export bundle for the business's own website ──
router.get('/settings', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.json({ settings: null, publishable: 0 });
    const [settings, stats] = await Promise.all([getSettings(newsroomId), bundleStats(newsroomId)]);
    res.json({ settings, publishable: stats.publishable });
  } catch (err) { console.error('[beaiready-knowhow/settings:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/settings', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    res.json(await saveSettings(newsroomId, req.body || {}));
  } catch (err) { console.error('[beaiready-knowhow/settings:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Download the deploy-ready zip (binary — streamed outside the JSON handlers).
router.get('/bundle', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const { buffer, filename } = await buildBundle(newsroomId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) { console.error('[beaiready-knowhow/bundle]', err); res.status(500).json({ message: 'Could not build the bundle.' }); }
});

// ── Manifest: the full per-document editorial view (aiready parity) ──
function pickEffective(a) {
  return { inclusion: a.inclusion, out_clean_markdown: a.out_clean_markdown, out_json_ld: a.out_json_ld,
    out_mirror_md: a.out_mirror_md, in_llms_txt: a.in_llms_txt, in_llms_full: a.in_llms_full };
}

router.get('/manifest', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.json({ sources: [], rules: [], counts: {}, fields: {} });
    const [{ rows }, stats, settings] = await Promise.all([
      pool.query(
        `SELECT id, kind, title, url, author, category, published_at, summary, slug, notes,
                inclusion, sensitivity, out_clean_markdown, out_json_ld, out_mirror_md, in_llms_txt, in_llms_full, manual_overrides
           FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]),
      sourceChunkStats(newsroomId),
      getSettings(newsroomId),
    ]);
    const rules = settings.rules || [];
    const effective = applyRulesAll(rows, rules);
    const sources = rows.map((r, i) => ({ ...r, chunks: stats[r.id]?.chunks || 0, embedded: stats[r.id]?.embedded || 0, _effective: pickEffective(effective[i]) }));
    const count = (p) => effective.filter(p).length;
    const counts = {
      total: rows.length,
      converted: rows.filter((r) => (stats[r.id]?.chunks || 0) > 0).length,
      embedded: rows.filter((r) => (stats[r.id]?.embedded || 0) > 0).length,
      publishable: count(isPublishable),
      excluded: count((a) => a.inclusion === 'exclude'),
      local_only: count((a) => a.inclusion === 'local_only'),
      sensitive: rows.filter((r) => r.sensitivity !== 'none').length,
      in_llms_txt: count((a) => isPublishable(a) && a.in_llms_txt),
    };
    res.json({ sources, rules, counts, fields: {
      inclusion: ['include', 'exclude', 'local_only'],
      sensitivity: ['none', 'source-protected', 'legal-hold', 'embargoed', 'withdrawn'],
      toggles: RULE_TARGET_FIELDS.filter((f) => f !== 'inclusion'),
      whenFields: RULE_WHEN_FIELDS, ops: OPS } });
  } catch (err) { console.error('[beaiready-knowhow/manifest:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/manifest/:id', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const EDITABLE = ['inclusion', 'sensitivity', 'out_clean_markdown', 'out_json_ld', 'out_mirror_md', 'in_llms_txt', 'in_llms_full', 'title', 'author', 'category', 'published_at', 'summary', 'slug', 'notes'];
    const CONTROL = new Set(['inclusion', 'out_clean_markdown', 'out_json_ld', 'out_mirror_md', 'in_llms_txt', 'in_llms_full']);
    const b = req.body || {};
    const sets = [], vals = [], touched = [];
    for (const k of EDITABLE) {
      if (!(k in b)) continue;
      sets.push(`${k} = $${vals.length + 1}`); vals.push(b[k] === '' ? null : b[k]);
      if (CONTROL.has(k)) touched.push(k);
    }
    if (!sets.length) return res.status(400).json({ message: 'Nothing to update.' });
    if (touched.length) { sets.push(`manual_overrides = (SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb) FROM jsonb_array_elements_text(manual_overrides || $${vals.length + 1}::jsonb) e)`); vals.push(JSON.stringify(touched)); }
    vals.push(req.params.id, newsroomId);
    const { rows } = await pool.query(`UPDATE beaiready_company_sources SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND newsroom_id = $${vals.length} RETURNING id`, vals);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) { console.error('[beaiready-knowhow/manifest:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Bulk rules
router.get('/rules', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json({ rules: (await getSettings(newsroomId)).rules || [] }); }
  catch (err) { console.error('[beaiready-knowhow/rules:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});
router.put('/rules', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
    await saveSettings(newsroomId, { rules });
    res.json({ rules });
  } catch (err) { console.error('[beaiready-knowhow/rules:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/rules/preview', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const { rows } = await pool.query('SELECT title, author, category, kind, published_at, inclusion FROM beaiready_company_sources WHERE newsroom_id = $1', [newsroomId]);
    res.json({ matches: countMatches(rows, req.body?.when) });
  } catch (err) { console.error('[beaiready-knowhow/rules:preview]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// AI: write summaries (feed llms.txt + JSON-LD descriptions)
router.post('/generate', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    res.json(await generateSummaries(newsroomId, { force: !!req.body?.force }));
  } catch (err) { console.error('[beaiready-knowhow/generate]', err); res.status(500).json({ message: err.message || 'Generate failed' }); }
});

// One document's schema.org JSON-LD (copy into a page's <head>)
router.get('/jsonld/:id', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const { rows: [r] } = await pool.query(
      'SELECT id, title, url, author, category, published_at, summary, slug FROM beaiready_company_sources WHERE id = $1 AND newsroom_id = $2', [req.params.id, newsroomId]);
    if (!r) return res.status(404).json({ message: 'Not found' });
    const obj = buildJsonLd(r, await getSettings(newsroomId));
    res.json({ jsonld: obj, script: jsonLdScript(obj) });
  } catch (err) { console.error('[beaiready-knowhow/jsonld]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// What the export bundle will contain
router.get('/bundle/preview', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json(await bundleStats(newsroomId)); }
  catch (err) { console.error('[beaiready-knowhow/bundle:preview]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Bespoke AI persona (consultant-picked use-case preset + editable instructions) ──
router.get('/assistant', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const { rows: [r] } = await pool.query(
      'SELECT use_case, assistant_instructions FROM beaiready_knowhow_settings WHERE newsroom_id = $1', [newsroomId]);
    res.json({ use_case: r?.use_case || '', instructions: r?.assistant_instructions || '', presets: PRESETS });
  } catch (err) { console.error('[beaiready-knowhow/assistant:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/assistant', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const use_case = req.body?.use_case || null;
    const instructions = (req.body?.instructions || '').trim() || null;
    await pool.query(
      `INSERT INTO beaiready_knowhow_settings (newsroom_id, use_case, assistant_instructions, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (newsroom_id) DO UPDATE SET use_case = EXCLUDED.use_case,
         assistant_instructions = EXCLUDED.assistant_instructions, updated_at = NOW()`,
      [newsroomId, use_case, instructions]);
    res.json({ ok: true, use_case, instructions });
  } catch (err) { console.error('[beaiready-knowhow/assistant:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// ── Claims Verifier (bespoke; the UI shows it only when use_case='claims-verification') ──
// Mines are "collections"; each source carries a role (claim / reporting / external).
router.get('/claims', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json({ mines: await listMines(newsroomId) }); }
  catch (e) { console.error('[knowhow/claims:get]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.get('/claims/report', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json(await claimsReport(newsroomId)); }
  catch (e) { console.error('[knowhow/claims:report]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/claims', async (req, res) => {
  try { const { newsroomId } = await ctx(req); if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    res.status(201).json({ mines: await addMine(newsroomId, req.body?.name) }); }
  catch (e) { console.error('[knowhow/claims:post]', e); res.status(500).json({ message: 'Internal server error' }); }
});
// Editorial (Phase 3). Literal paths registered BEFORE the :name/:collection params so they
// aren't captured. Edit a claim (override verdict/lock, status, notes); add/remove counterclaims.
router.patch('/claims/claim/:id', async (req, res) => {
  try { const { newsroomId } = await ctx(req); const ok = await updateClaim(newsroomId, req.params.id, req.body || {}); res.json({ ok: !!ok }); }
  catch (e) { console.error('[knowhow/claims:patch]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/claims/claim/:id/counter', async (req, res) => {
  try { const { newsroomId } = await ctx(req); await addCounterclaim(newsroomId, req.params.id, req.body?.text, req.body?.attribution, req.user.id); res.status(201).json({ ok: true }); }
  catch (e) { console.error('[knowhow/claims:counter]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.delete('/claims/evidence/:id', async (req, res) => {
  try { const { newsroomId } = await ctx(req); await deleteManualEvidence(newsroomId, req.params.id); res.json({ ok: true }); }
  catch (e) { console.error('[knowhow/claims:evdel]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/claims/:collection/claim', async (req, res) => {
  try { const { newsroomId } = await ctx(req); if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    await addManualClaim(newsroomId, req.params.collection, req.body?.text); res.status(201).json(await getMine(newsroomId, req.params.collection)); }
  catch (e) { console.error('[knowhow/claims:addclaim]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.delete('/claims/:name', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json({ mines: await removeMine(newsroomId, req.params.name) }); }
  catch (e) { console.error('[knowhow/claims:del]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.post('/claims/:collection/verify', async (req, res) => {
  try { const { newsroomId } = await ctx(req); if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    res.json(await verifyClaims(newsroomId, req.params.collection)); }
  catch (e) { console.error('[knowhow/claims:verify]', e); res.status(500).json({ message: e.message || 'Verify failed' }); }
});
// Cross-mine database (Phase 4). Literal /claims/db* + /claims/export before the :collection param.
router.get('/claims/db/search', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json({ claims: await searchClaims(newsroomId, req.query || {}) }); }
  catch (e) { console.error('[knowhow/claims:search]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.get('/claims/db/themes', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json({ themes: await listThemes(newsroomId) }); }
  catch (e) { console.error('[knowhow/claims:themes]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.get('/claims/criteria', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json({ criteria: await listOrgCriteria(newsroomId) }); }
  catch (e) { console.error('[knowhow/claims:criteria]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.get('/claims/export', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const format = req.query?.format === 'json' ? 'json' : 'csv';
    const { type, body } = await exportClaims(newsroomId, format);
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="claims-database.${format === 'json' ? 'json' : 'csv'}"`);
    res.send(body);
  } catch (e) { console.error('[knowhow/claims:export]', e); res.status(500).json({ message: 'Internal server error' }); }
});
router.get('/claims/:collection', async (req, res) => {
  try { const { newsroomId } = await ctx(req); res.json(await getMine(newsroomId, req.params.collection)); }
  catch (e) { console.error('[knowhow/claims:mine]', e); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
