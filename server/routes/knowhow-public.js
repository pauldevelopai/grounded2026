// KnowHow — public (unauthenticated) answer routes, mounted at /api/knowhow/public.
// The employee-facing surface: no login, mobile-first, gated only by the unguessable
// token in the link (mirrors pulse-public.js). One token covers a batch of capture
// questions. On submit we write a response + a derived corpus_item per answer, and
// capture consent first if the person hasn't consented yet — knowledge is never
// stored without consent.
import { Router } from 'express';
import pool from '../db/pool.js';
import { addCorpusItem, corpusSummary } from '../knowhow/corpus.js';
import { askCorpus } from '../knowhow/agent.js';

const router = Router();
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[knowhow-public]', err);
  res.status(500).json({ message: 'Something went wrong' });
});

// Light per-token hourly throttle for the public ask surface (each ask is a model
// call). In-memory; resets on restart — fine at this scale. The token is the gate.
const askThrottle = new Map();
function askTooMany(token, cap = 60) {
  const hour = Math.floor(Date.now() / 3600000);
  const e = askThrottle.get(token);
  if (!e || e.hour !== hour) { askThrottle.set(token, { hour, count: 1 }); return false; }
  e.count += 1;
  return e.count > cap;
}

async function promptsForToken(token) {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.text, pr.kind, pr.status, pr.tenant_id, pr.topic_id, pr.person_id,
            tn.name AS tenant_name, pe.name AS person_name, pe.consent_at
       FROM knowhow.prompts pr
       JOIN knowhow.tenants tn ON tn.id = pr.tenant_id
       LEFT JOIN knowhow.people pe ON pe.id = pr.person_id
      WHERE pr.public_token = $1 ORDER BY pr.created_at`, [token]);
  return rows;
}

// Load the questions for a token (only public-safe fields).
router.get('/prompt/:token', wrap(async (req, res) => {
  const prompts = await promptsForToken(req.params.token);
  if (!prompts.length) return res.status(404).json({ message: 'This link is not valid.' });
  const alreadyAnswered = prompts.every((p) => p.status === 'answered' || p.status === 'archived');
  const hasPerson = prompts.some((p) => p.person_id);
  const consentNeeded = hasPerson && prompts.some((p) => p.person_id && p.consent_at == null);
  res.json({
    tenant: prompts[0].tenant_name || '',
    person: prompts[0].person_name || '',
    consentNeeded,
    alreadyAnswered,
    questions: prompts.map((p) => ({ id: p.id, text: p.text, kind: p.kind })),
  });
}));

// Accept a submission: { token, answers:[{prompt_id, body}], name, consent }.
router.post('/answer', wrap(async (req, res) => {
  const { token, answers, name, consent } = req.body || {};
  const prompts = await promptsForToken(token);
  if (!prompts.length) return res.status(404).json({ message: 'This link is not valid.' });
  if (prompts.every((p) => p.status === 'answered' || p.status === 'archived')) {
    return res.status(409).json({ message: 'These questions have already been answered. Thank you!' });
  }
  const byId = new Map(prompts.map((p) => [p.id, p]));
  const given = (Array.isArray(answers) ? answers : []).filter((a) => a && a.prompt_id && String(a.body || '').trim());
  if (!given.length) return res.status(400).json({ message: 'Please answer at least one question.' });

  // Consent: if any targeted person hasn't consented, require it before storing.
  const personId = prompts.find((p) => p.person_id)?.person_id || null;
  const needConsent = prompts.some((p) => p.person_id && p.consent_at == null);
  if (needConsent && consent !== true) {
    return res.status(400).json({ message: 'Please give consent so your knowledge can be saved.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (personId && needConsent && consent === true) {
      await client.query('UPDATE knowhow.people SET consent_at = NOW() WHERE id = $1 AND consent_at IS NULL', [personId]);
    }
    const consentOk = personId ? true : (consent === true);   // person consented just now / already, or anon checkbox
    let stored = 0;
    for (const a of given) {
      const pr = byId.get(a.prompt_id);
      if (!pr || pr.status === 'answered' || pr.status === 'archived') continue;
      const body = String(a.body).trim();
      const { rows: [resp] } = await client.query(
        `INSERT INTO knowhow.responses (prompt_id, person_id, body, source)
         VALUES ($1,$2,$3,'pulse') RETURNING id`,
        [pr.id, pr.person_id || null, body]);
      await addCorpusItem(client, {
        tenant_id: pr.tenant_id, topic_id: pr.topic_id, person_id: pr.person_id || null,
        origin: 'response', origin_id: resp.id, text: body, consent_ok: consentOk,
      });
      await client.query("UPDATE knowhow.prompts SET status='answered' WHERE id=$1", [pr.id]);
      stored++;
    }
    await client.query('COMMIT');
    res.json({ ok: true, stored });
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}));

// ── Junior-facing ASK surface (login-free, token-gated) ──────────────────────
async function tenantByAskToken(token) {
  const { rows } = await pool.query('SELECT id, name FROM knowhow.tenants WHERE ask_token = $1', [token]);
  return rows[0] || null;
}

// Validate a team ask-link + report whether there's anything to draw on.
router.get('/ask/:token', wrap(async (req, res) => {
  const t = await tenantByAskToken(req.params.token);
  if (!t) return res.status(404).json({ message: 'This link is not valid.' });
  const sum = await corpusSummary(pool, t.id);
  res.json({ tenant: t.name, hasCorpus: sum.pieces > 0 });
}));

// Ask the corpus from the junior surface. Defaults to coaching mode; grounded +
// cited, honest decline when not covered (same agent as the admin ask).
router.post('/ask', wrap(async (req, res) => {
  const { token, question, mode } = req.body || {};
  if (!token) return res.status(400).json({ message: 'This link is not valid.' });
  const t = await tenantByAskToken(token);
  if (!t) return res.status(404).json({ message: 'This link is not valid.' });
  if (askTooMany(token)) return res.status(429).json({ message: 'That’s a lot of questions in a short time — give it a minute and try again.' });
  const q = String(question || '').trim();
  if (!q) return res.status(400).json({ message: 'Ask a question first.' });
  if (q.length > 1000) return res.status(400).json({ message: 'That question is a bit long — try shortening it.' });
  const out = await askCorpus({ id: t.id, name: t.name }, { question: q, mode: mode === 'answer' ? 'answer' : 'coach' });
  res.json(out);
}));

export default router;
