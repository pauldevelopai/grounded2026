// KnowHow — admin (authed) routes. Mounted under the admin router
// (requireAuth + requireRole('admin')) at /api/knowhow. Manages the capture slice:
// tenants, people, topics, Pulse capture questions (generate → vet → send), and
// document ingest. Every read/write is tenant-scoped; product lives on the tenant.
// The existing Airtable Node-Pulse (server/pulse/*) is untouched.
import { Router } from 'express';
import pool from '../db/pool.js';
import { publicToken } from '../pulse/ids.js';
import { generateCaptureQuestions } from '../knowhow/generate.js';
import { extractDocumentText, splitIntoPieces } from '../knowhow/extract.js';
import { addCorpusItem, corpusSummary, corpusForTopic } from '../knowhow/corpus.js';
import { askCorpus } from '../knowhow/agent.js';
import { encryptFor } from '../services/crypto.js';

const router = Router();
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[knowhow]', err);
  res.status(500).json({ message: err.message || 'Something went wrong' });
});

async function tenant(tid) {
  const { rows } = await pool.query('SELECT * FROM knowhow.tenants WHERE id = $1', [tid]);
  return rows[0] || null;
}

// ── Tenants ──────────────────────────────────────────────────────────────────
router.get('/tenants', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.product, t.created_at, t.newsroom_id, n.name AS newsroom_name
       FROM knowhow.tenants t LEFT JOIN newsrooms n ON n.id = t.newsroom_id
      ORDER BY t.created_at`);
  res.json(rows);
}));

// Link a KnowHow tenant to the BAIR client it's about, so its promoted knowledge can
// flow into that client's company knowledge. newsroom_id: null unlinks.
router.post('/tenants/:tid/link', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const newsroomId = req.body?.newsroom_id || null;
  const { rows } = await pool.query('UPDATE knowhow.tenants SET newsroom_id=$2 WHERE id=$1 RETURNING id, newsroom_id', [t.id, newsroomId]);
  res.json(rows[0]);
}));

router.post('/tenants', wrap(async (req, res) => {
  const name = (req.body?.name || '').trim();
  const product = req.body?.product === 'grounded' ? 'grounded' : 'bair';
  if (!name) return res.status(400).json({ message: 'name required' });
  const { rows } = await pool.query(
    'INSERT INTO knowhow.tenants (name, product) VALUES ($1,$2) RETURNING id, name, product, created_at', [name, product]);
  res.status(201).json(rows[0]);
}));

// Generate (or rotate) the login-free team ask-link token, so juniors can ask the
// corpus without an admin login. One link per tenant; rotating invalidates the old.
router.post('/tenants/:tid/ask-token', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const token = publicToken();
  const { rows } = await pool.query('UPDATE knowhow.tenants SET ask_token=$2 WHERE id=$1 RETURNING ask_token', [t.id, token]);
  res.json({ ask_token: rows[0].ask_token, path: `/knowhow/ask/${rows[0].ask_token}` });
}));

// A tenant's full capture picture: people, topics, prompts, responses count, corpus summary.
router.get('/tenants/:tid/overview', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const [{ rows: people }, { rows: topics }, { rows: prompts }, summary] = await Promise.all([
    pool.query('SELECT id, name, role, seniority, email_or_handle, consent_at, active FROM knowhow.people WHERE tenant_id=$1 ORDER BY created_at', [t.id]),
    pool.query('SELECT id, label, description, priority FROM knowhow.topics WHERE tenant_id=$1 ORDER BY priority DESC, label', [t.id]),
    pool.query(`SELECT pr.id, pr.text, pr.kind, pr.status, pr.public_token, pr.topic_id, pr.person_id,
                       tp.label AS topic_label, pe.name AS person_name,
                       (SELECT COUNT(*)::int FROM knowhow.responses r WHERE r.prompt_id = pr.id) AS response_count
                  FROM knowhow.prompts pr
                  LEFT JOIN knowhow.topics tp ON tp.id = pr.topic_id
                  LEFT JOIN knowhow.people pe ON pe.id = pr.person_id
                 WHERE pr.tenant_id=$1 ORDER BY pr.created_at DESC`, [t.id]),
    corpusSummary(pool, t.id),
  ]);
  res.json({ tenant: t, people, topics, prompts, corpus: summary });
}));

// ── People ───────────────────────────────────────────────────────────────────
router.post('/tenants/:tid/people', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const { name, role, seniority, email_or_handle } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ message: 'name required' });
  const { rows } = await pool.query(
    `INSERT INTO knowhow.people (tenant_id, name, role, seniority, email_or_handle)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, name, role, seniority, email_or_handle, consent_at, active`,
    [t.id, name.trim(), role || null, seniority || null, email_or_handle || null]);
  res.status(201).json(rows[0]);
}));

// ── Topics ───────────────────────────────────────────────────────────────────
router.post('/tenants/:tid/topics', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const { label, description, priority } = req.body || {};
  if (!label?.trim()) return res.status(400).json({ message: 'label required' });
  const { rows } = await pool.query(
    `INSERT INTO knowhow.topics (tenant_id, label, description, priority)
     VALUES ($1,$2,$3,$4) RETURNING id, label, description, priority`,
    [t.id, label.trim(), description || null, Number.isFinite(+priority) ? +priority : 0]);
  res.status(201).json(rows[0]);
}));

// ── Prompts: generate (AI) → vet → send ──────────────────────────────────────
// AI-generate capture questions for a topic + person, saved as draft prompts.
router.post('/tenants/:tid/prompts/generate', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const { topic_id, person_id } = req.body || {};
  if (!topic_id) return res.status(400).json({ message: 'topic_id required' });
  const { rows: [topic] } = await pool.query('SELECT * FROM knowhow.topics WHERE id=$1 AND tenant_id=$2', [topic_id, t.id]);
  if (!topic) return res.status(404).json({ message: 'Unknown topic' });
  let person = null;
  if (person_id) {
    const { rows } = await pool.query('SELECT * FROM knowhow.people WHERE id=$1 AND tenant_id=$2', [person_id, t.id]);
    person = rows[0] || null;
  }
  const existingCorpus = await corpusForTopic(pool, t.id, topic_id);
  const { questions, tip } = await generateCaptureQuestions({
    tenantName: t.name,
    topicLabel: topic.label, topicDescription: topic.description,
    personName: person?.name, personRole: person?.role, personSeniority: person?.seniority,
    existingCorpus,
  });
  const created = [];
  for (const q of questions) {
    const { rows } = await pool.query(
      `INSERT INTO knowhow.prompts (tenant_id, topic_id, person_id, text, kind, status)
       VALUES ($1,$2,$3,$4,$5,'draft') RETURNING id, text, kind, status, topic_id, person_id`,
      [t.id, topic_id, person_id || null, q.text, q.kind]);
    created.push(rows[0]);
  }
  res.status(201).json({ created, tip });
}));

// Manually add a capture question (draft).
router.post('/tenants/:tid/prompts', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const { text, topic_id, person_id, kind } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ message: 'text required' });
  const { rows } = await pool.query(
    `INSERT INTO knowhow.prompts (tenant_id, topic_id, person_id, text, kind, status)
     VALUES ($1,$2,$3,$4,$5,'draft') RETURNING id, text, kind, status, topic_id, person_id`,
    [t.id, topic_id || null, person_id || null, text.trim(), kind === 'scenario' ? 'scenario' : (kind === 'mcq' ? 'mcq' : 'open')]);
  res.status(201).json(rows[0]);
}));

// Lifecycle transitions: draft → vetted → sent → (answered) → archived.
async function setStatus(id, from, to, extraSet = '', extraVals = []) {
  const sets = [`status = '${to}'`, ...(extraSet ? [extraSet] : [])];
  const { rows } = await pool.query(
    `UPDATE knowhow.prompts SET ${sets.join(', ')} WHERE id = $1 AND status = ANY($2) RETURNING id, text, kind, status, public_token`,
    [id, from, ...extraVals]);
  return rows[0] || null;
}

router.post('/prompts/:id/vet', wrap(async (req, res) => {
  const r = await setStatus(req.params.id, ['draft'], 'vetted');
  if (!r) return res.status(409).json({ message: 'Only a draft prompt can be vetted.' });
  res.json(r);
}));

// Send a BATCH of prompts under ONE shared token, so the employee answers them
// all on a single login-free link (one Pulse = several questions, like a cycle).
router.post('/tenants/:tid/prompts/send', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const ids = Array.isArray(req.body?.prompt_ids) ? req.body.prompt_ids : [];
  if (!ids.length) return res.status(400).json({ message: 'prompt_ids required' });
  const token = publicToken();
  const { rows } = await pool.query(
    `UPDATE knowhow.prompts SET status='sent', public_token=$3
       WHERE tenant_id=$1 AND id = ANY($2) AND status IN ('draft','vetted')
     RETURNING id`, [t.id, ids, token]);
  if (!rows.length) return res.status(409).json({ message: 'No sendable prompts in that set.' });
  res.json({ token, path: `/knowhow/${token}`, count: rows.length });
}));

router.post('/prompts/:id/archive', wrap(async (req, res) => {
  const r = await setStatus(req.params.id, ['draft', 'vetted', 'sent', 'answered'], 'archived');
  if (!r) return res.status(409).json({ message: 'Cannot archive.' });
  res.json(r);
}));

// ── Responses (read) ─────────────────────────────────────────────────────────
router.get('/tenants/:tid/responses', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const { rows } = await pool.query(
    `SELECT r.id, r.body, r.source, r.created_at, r.promoted_source_id IS NOT NULL AS promoted,
            pr.text AS prompt_text, pe.name AS person_name, tp.label AS topic_label
       FROM knowhow.responses r
       JOIN knowhow.prompts pr ON pr.id = r.prompt_id
       LEFT JOIN knowhow.people pe ON pe.id = r.person_id
       LEFT JOIN knowhow.topics tp ON tp.id = pr.topic_id
      WHERE pr.tenant_id = $1 ORDER BY r.created_at DESC LIMIT 100`, [t.id]);
  res.json(rows);
}));

// Promote a vetted response into the LINKED client's company knowledge — the store the
// workspace + strategy AI already read. Consultant-gated (this whole router is admin),
// a deliberate per-response act so the corpus stays truthful + relevant, and tracked
// so the same response isn't promoted twice.
router.post('/tenants/:tid/responses/:rid/promote', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  if (!t.newsroom_id) return res.status(400).json({ message: 'Link this KnowHow tenant to a client first.' });
  const { rows: [r] } = await pool.query(
    `SELECT r.id, r.body, r.promoted_source_id, pr.text AS prompt_text, tp.label AS topic_label
       FROM knowhow.responses r JOIN knowhow.prompts pr ON pr.id = r.prompt_id
       LEFT JOIN knowhow.topics tp ON tp.id = pr.topic_id
      WHERE r.id = $1 AND pr.tenant_id = $2`, [req.params.rid, t.id]);
  if (!r) return res.status(404).json({ message: 'Response not found' });
  if (r.promoted_source_id) return res.json({ already: true, source_id: r.promoted_source_id });
  if (!r.body || !r.body.trim()) return res.status(400).json({ message: 'Empty response — nothing to promote.' });
  const title = `KnowHow — ${(r.topic_label || r.prompt_text || 'captured knowledge').slice(0, 160)}`;
  const { rows: [src] } = await pool.query(
    `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, extracted_text, created_by)
     VALUES ($1,'note',$2,$3,$4) RETURNING id`,
    [t.newsroom_id, title, encryptFor(t.newsroom_id, r.body), req.user.id]);
  await pool.query('UPDATE knowhow.responses SET promoted_source_id = $1 WHERE id = $2', [src.id, r.id]);
  res.json({ source_id: src.id });
}));

// ── Documents: ingest text → document + corpus_items ─────────────────────────
router.post('/tenants/:tid/documents', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const { title, text, topic_id, source } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ message: 'title required' });
  const { text: clean, flags } = extractDocumentText({ text, name: source });
  if (!clean) return res.status(400).json({ message: flags[0] || 'No readable text.', flags });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [doc] } = await client.query(
      `INSERT INTO knowhow.documents (tenant_id, topic_id, title, source_path_or_url, text, meta)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [t.id, topic_id || null, title.trim(), source || null, clean, JSON.stringify({ flags })]);
    const pieces = splitIntoPieces(clean);
    for (const piece of pieces) {
      await addCorpusItem(client, { tenant_id: t.id, topic_id: topic_id || null, origin: 'document', origin_id: doc.id, text: piece, consent_ok: true });
    }
    await client.query('COMMIT');
    res.status(201).json({ id: doc.id, pieces: pieces.length, flags });
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}));

// ── Ask the corpus (Part C agent: answer + coach modes, grounded + cited) ─────
router.post('/tenants/:tid/ask', wrap(async (req, res) => {
  const t = await tenant(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Unknown tenant' });
  const { question, mode, topic_id } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ message: 'question required' });
  const out = await askCorpus({ id: t.id, name: t.name }, { question: question.trim(), mode: mode === 'coach' ? 'coach' : 'answer', topicId: topic_id || null });
  res.json(out);
}));

export default router;
