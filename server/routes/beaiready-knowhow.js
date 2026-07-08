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
    const { rows } = await pool.query(
      `SELECT id, kind, title, url, file_id, extracted_text, created_at
         FROM beaiready_company_sources WHERE newsroom_id = $1 ORDER BY created_at DESC`, [newsroomId]);
    res.json(rows.map((r) => {
      const text = decryptFor(newsroomId, r.extracted_text) || '';
      return { id: r.id, kind: r.kind, title: r.title, url: r.url, file_id: r.file_id, created_at: r.created_at, snippet: text.slice(0, 220), has_text: text.length > 0 };
    }));
  } catch (err) { console.error('[beaiready-knowhow/sources:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

// Upload one or more files → extract text → store as company knowledge.
router.post('/sources/upload', upload.array('files'), async (req, res) => {
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
      added.push({ ...src, has_text: (text || '').length > 0 });
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
    res.status(201).json(src);
  } catch (err) { console.error('[beaiready-knowhow/sources:note]', err); res.status(500).json({ message: 'Internal server error' }); }
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

export default router;
