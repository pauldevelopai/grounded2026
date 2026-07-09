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

const router = Router();

async function ctx(req) {
  const newsroomId = await resolveNewsroomId(req);
  const { rows: [n] } = await pool.query('SELECT name FROM newsrooms WHERE id = $1', [newsroomId]);
  return { newsroomId, name: n?.name || null };
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
        `SELECT id, kind, title, url, file_id, extracted_text, included, sensitive, publish, created_at
           FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]),
      sourceChunkStats(newsroomId),
    ]);
    res.json(rows.map((r) => {
      const text = decryptFor(newsroomId, r.extracted_text) || '';
      const st = stats[r.id] || { chunks: 0, embedded: 0 };
      return { id: r.id, kind: r.kind, title: r.title, url: r.url, file_id: r.file_id, created_at: r.created_at,
        snippet: text.slice(0, 220), has_text: text.length > 0,
        included: r.included, sensitive: r.sensitive, publish: r.publish, chunks: st.chunks, embedded: st.embedded };
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

// Per-document controls: include/exclude from the AI, flag sensitive.
router.patch('/sources/:id', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    const fields = [], vals = [];
    if (typeof req.body?.included === 'boolean') { fields.push(`included = $${fields.length + 1}`); vals.push(req.body.included); }
    if (typeof req.body?.sensitive === 'boolean') { fields.push(`sensitive = $${fields.length + 1}`); vals.push(req.body.sensitive); }
    if (typeof req.body?.publish === 'boolean') { fields.push(`publish = $${fields.length + 1}`); vals.push(req.body.publish); }
    if (!fields.length) return res.status(400).json({ message: 'Nothing to update.' });
    vals.push(req.params.id, newsroomId);
    const { rows } = await pool.query(
      `UPDATE beaiready_company_sources SET ${fields.join(', ')}
        WHERE id = $${vals.length - 1} AND newsroom_id = $${vals.length}
        RETURNING id, included, sensitive, publish`, vals);
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
        `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, file_id, extracted_text, created_by)
         VALUES ($1,'doc',$2,$3,$4,$5) RETURNING id, kind, title, file_id, created_at`,
        [newsroomId, f.originalname, doc.id, encryptFor(newsroomId, (text || '').slice(0, 20000)), req.user.id]);
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
    const scraped = await scrapeArticle(url.trim());
    if (!scraped.success || !scraped.text) return res.status(400).json({ message: `Couldn't read that page${scraped.error ? `: ${scraped.error}` : ''}` });
    const { rows: [src] } = await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, url, extracted_text, created_by)
       VALUES ($1,'website',$2,$3,$4,$5) RETURNING id, kind, title, url, created_at`,
      [newsroomId, scraped.title || url.trim(), url.trim(), encryptFor(newsroomId, scraped.text), req.user.id]);
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
    const { rows: [src] } = await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, extracted_text, created_by)
       VALUES ($1,'note',$2,$3,$4) RETURNING id, kind, title, created_at`,
      [newsroomId, (title || 'Note').trim(), encryptFor(newsroomId, text.trim()), req.user.id]);
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
    const r = await ingestUrls(newsroomId, req.user.id, req.body?.urls);
    return r.total === 0 ? res.status(400).json({ message: r.message || 'No usable URLs.' }) : res.status(201).json(r);
  } catch (err) { console.error('[beaiready-knowhow/sources:urls]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Crawl a sitemap.xml → ingest every page it lists.
router.post('/sources/sitemap', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const r = await ingestSitemap(newsroomId, req.user.id, req.body?.sitemap);
    return r.total === 0 ? res.status(400).json({ message: r.message || 'No pages found.' }) : res.status(201).json(r);
  } catch (err) { console.error('[beaiready-knowhow/sources:sitemap]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Import a public "anyone with the link" Google Drive folder.
router.post('/sources/drive', async (req, res) => {
  try {
    const { newsroomId } = await ctx(req);
    if (newsroomId === OFFICE_NEWSROOM_ID) return res.status(400).json({ message: 'KnowHow is for client businesses.' });
    const r = await ingestDriveFolder(newsroomId, req.user.id, req.body?.folder);
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

export default router;
