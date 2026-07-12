// claims-verify.js — EnviroPress Claims Verifier engine. For a mine (collection):
// extract the concrete claims from its OWN documents (role='claim'), then verdict each
// against the newsroom's reporting + independent external sources (role in
// reporting/external) — supported / contradicted / misleading / unverified, with
// citations. Verdicts persist and are re-computed as evidence is added; each run writes
// a snapshot for the trend. Reuses KnowHow's retrieval, the tenant persona, callClaude.
import pool from '../db/pool.js';
import { decryptFor, encryptFor } from './crypto.js';
import { callClaude } from './claude.js';
import { retrieveCompanyChunks } from './company-knowledge-index.js';
import { generateEmbedding, toPgVector } from './embeddings.js';
import { assistantInstructionsFor } from './knowhow-presets.js';

const VERDICTS = ['supported', 'contradicted', 'misleading', 'unverified'];
const EMPTY_COUNTS = { supported: 0, contradicted: 0, misleading: 0, unverified: 0, pending: 0 };
const DEDUPE_DIST = 0.18;   // cosine distance ≤ this ⇒ the same claim re-phrased (collapse, don't duplicate).
                            // Calibrated: near-exact rewrites ~0.04, clear paraphrases ~0.16, distinct claims ≥0.5.
                            // Kept conservative — over-merging would silently drop a real claim.

function safeJson(t) { if (!t) return null; const m = String(t).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
function stanceFor(verdict) { return verdict === 'supported' ? 'supports' : (verdict === 'contradicted' || verdict === 'misleading') ? 'contradicts' : 'context'; }

// Is there already a claim in this bucket that means the same thing? (semantic dedupe)
async function findSimilarClaim(newsroomId, collection, vec) {
  if (!vec) return null;
  const { rows } = await pool.query(
    `SELECT id, (embedding <=> $3::vector) AS dist FROM beaiready_claim_checks
      WHERE newsroom_id=$1 AND collection=$2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $3::vector LIMIT 1`, [newsroomId, collection, toPgVector(vec)]).catch(() => ({ rows: [] }));
  return rows[0] && Number(rows[0].dist) <= DEDUPE_DIST ? rows[0] : null;
}

async function verdictCounts(newsroomId, collection) {
  const { rows } = await pool.query(
    'SELECT verdict, count(*)::int c FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2 GROUP BY verdict', [newsroomId, collection]);
  const m = { ...EMPTY_COUNTS };
  for (const r of rows) if (m[r.verdict] != null) m[r.verdict] = r.c;
  return m;
}

// Extract discrete, checkable claims from the mine's own (role='claim') documents.
export async function extractClaims(newsroomId, collection) {
  const { rows } = await pool.query(
    `SELECT title, extracted_text FROM beaiready_company_sources
      WHERE newsroom_id=$1 AND collection=$2 AND role='claim' AND extracted_text IS NOT NULL`, [newsroomId, collection]);
  if (!rows.length) return { extracted: 0 };
  const persona = await assistantInstructionsFor(newsroomId).catch(() => '');
  let added = 0;
  for (const r of rows) {
    const text = (decryptFor(newsroomId, r.extracted_text) || '').slice(0, 8000);
    if (!text) continue;
    const system = (persona ? persona + '\n\n' : '')
      + 'Extract the concrete, checkable factual CLAIMS this mining company makes about itself in the document — '
      + 'each a single verifiable assertion (environmental compliance, rehabilitation, pollution/water, community '
      + 'benefits, safety, production, employment, etc.). Return STRICT JSON: {"claims": string[]}. Each claim '
      + '≤200 chars, self-contained, prefixed with the mine name if helpful. Skip opinions and vague aspirations.';
    let out;
    try { out = await callClaude({ system, userContent: `Document: ${r.title || ''}\n\n${text}\n\nReturn the JSON.`, maxTokens: 1200, temperature: 0.1 }); }
    catch (e) { console.error('[claims extract]', e.message); continue; }
    for (const raw of (safeJson(out)?.claims || [])) {
      const c = String(raw).trim().slice(0, 400);
      if (!c) continue;
      const { rowCount } = await pool.query(
        'SELECT 1 FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2 AND lower(claim_text)=lower($3)', [newsroomId, collection, c]);
      if (rowCount) continue;                                     // exact duplicate
      const vec = await generateEmbedding(c).catch(() => null);
      if (await findSimilarClaim(newsroomId, collection, vec)) continue;   // same claim, re-phrased
      const { rows: [ins] } = await pool.query(
        'INSERT INTO beaiready_claim_checks (newsroom_id, collection, claim_text, verdict, embedding) VALUES ($1,$2,$3,\'pending\',$4) RETURNING id',
        [newsroomId, collection, c, vec ? toPgVector(vec) : null]);
      await pool.query(
        'INSERT INTO beaiready_claim_events (newsroom_id, claim_id, event_type, new_verdict, detail) VALUES ($1,$2,\'created\',\'pending\',$3::jsonb)',
        [newsroomId, ins.id, JSON.stringify({ from: r.title || 'a company document' })]);
      added++;
    }
  }
  return { extracted: added };
}

// Verdict every claim against reporting + external evidence. Idempotent; snapshots counts.
export async function verifyClaims(newsroomId, collection) {
  await extractClaims(newsroomId, collection);
  const { rows: claims } = await pool.query(
    'SELECT id, claim_text, verdict AS prev FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2', [newsroomId, collection]);
  const persona = await assistantInstructionsFor(newsroomId).catch(() => '');
  let done = 0;
  for (const cl of claims) {
    const evidence = await retrieveCompanyChunks(newsroomId, cl.claim_text, { collection, roles: ['reporting', 'external'], limit: 8 });
    let verdict = 'unverified', rationale = 'No independent evidence has been added yet to test this claim.', citations = [], used = [];
    if (evidence.length) {
      const ctx = evidence.map((e, i) => `[${i + 1}] (${e.kind}) ${e.title || ''}: ${e.text.replace(/\s+/g, ' ').slice(0, 1200)}`).join('\n\n');
      const system = (persona ? persona + '\n\n' : '')
        + 'You are testing a single claim a mining company made about itself, using ONLY the numbered EVIDENCE below '
        + '(the newsroom’s own reporting and independent sources). Decide a verdict and cite the evidence you used. '
        + 'Return STRICT JSON: {"verdict":"supported"|"contradicted"|"misleading"|"unverified","rationale":string(<=400 chars, cite [n]),"citations":number[]}. '
        + 'supported = evidence backs it; contradicted = evidence shows it false; misleading = technically true but creates a false '
        + 'impression; unverified = the evidence does not settle it. Go strictly on the evidence — never assume.';
      try {
        const p = safeJson(await callClaude({ system, userContent: `CLAIM: ${cl.claim_text}\n\nEVIDENCE:\n${ctx}\n\nReturn the JSON.`, maxTokens: 500, temperature: 0.1 }));
        if (p && VERDICTS.includes(p.verdict)) {
          verdict = p.verdict;
          rationale = String(p.rationale || '').slice(0, 600);
          used = (Array.isArray(p.citations) ? p.citations : []).map((n) => evidence[n - 1]).filter(Boolean);
          citations = used.map((e) => ({ title: e.title, kind: e.kind }));
        }
      } catch (e) { console.error('[claims verify]', e.message); }
    }
    await pool.query('UPDATE beaiready_claim_checks SET verdict=$1, rationale=$2, citations=$3::jsonb, updated_at=NOW(), verified_at=NOW() WHERE id=$4',
      [verdict, rationale, JSON.stringify(citations), cl.id]);
    // Frozen evidence links: the exact passages this verdict rests on (encrypted, immutable to later source edits).
    await pool.query('DELETE FROM beaiready_claim_evidence WHERE claim_id=$1', [cl.id]);
    const stance = stanceFor(verdict);
    for (const e of used) {
      await pool.query(
        'INSERT INTO beaiready_claim_evidence (newsroom_id, claim_id, source_id, role, stance, quote, title) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [newsroomId, cl.id, e.source_id || null, e.role || null, stance, encryptFor(newsroomId, (e.text || '').slice(0, 1200)), e.title || null]);
    }
    // Append-only history: record every verdict change (incl. the first, from 'pending').
    if (cl.prev !== verdict) {
      await pool.query(
        'INSERT INTO beaiready_claim_events (newsroom_id, claim_id, event_type, old_verdict, new_verdict, rationale, detail) VALUES ($1,$2,\'verdict_changed\',$3,$4,$5,$6::jsonb)',
        [newsroomId, cl.id, cl.prev, verdict, rationale, JSON.stringify({ citations, evidence: used.length })]);
    }
    done++;
  }
  const counts = await verdictCounts(newsroomId, collection);
  await pool.query('INSERT INTO beaiready_claim_snapshots (newsroom_id, collection, counts) VALUES ($1,$2,$3::jsonb)', [newsroomId, collection, JSON.stringify(counts)]);
  return { verified: done, counts };
}

// ── Mines (collections) ──
async function mineNames(newsroomId) {
  const { rows } = await pool.query('SELECT collections FROM beaiready_knowhow_settings WHERE newsroom_id=$1', [newsroomId]);
  return Array.isArray(rows[0]?.collections) ? rows[0].collections : [];
}

export async function listMines(newsroomId) {
  const names = await mineNames(newsroomId);
  const mines = [];
  for (const name of names) {
    const counts = await verdictCounts(newsroomId, name);
    const { rows: sc } = await pool.query('SELECT role, count(*)::int c FROM beaiready_company_sources WHERE newsroom_id=$1 AND collection=$2 GROUP BY role', [newsroomId, name]);
    const sources = { claim: 0, reporting: 0, external: 0 };
    for (const r of sc) if (sources[r.role] != null) sources[r.role] = r.c;
    const { rows: lv } = await pool.query('SELECT max(updated_at) mx FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2', [newsroomId, name]);
    mines.push({ name, counts, sources, claims: Object.values(counts).reduce((a, b) => a + b, 0), last_verified: lv[0]?.mx || null });
  }
  return mines;
}

export async function addMine(newsroomId, name) {
  const clean = String(name || '').trim().slice(0, 120);
  if (!clean) return listMines(newsroomId);
  const names = await mineNames(newsroomId);
  if (!names.some((n) => n.toLowerCase() === clean.toLowerCase())) names.push(clean);
  await pool.query(
    `INSERT INTO beaiready_knowhow_settings (newsroom_id, collections, updated_at) VALUES ($1,$2::jsonb,NOW())
     ON CONFLICT (newsroom_id) DO UPDATE SET collections=$2::jsonb, updated_at=NOW()`, [newsroomId, JSON.stringify(names)]);
  return listMines(newsroomId);
}

export async function removeMine(newsroomId, name) {
  const names = (await mineNames(newsroomId)).filter((n) => n !== name);
  await pool.query('UPDATE beaiready_knowhow_settings SET collections=$2::jsonb, updated_at=NOW() WHERE newsroom_id=$1', [newsroomId, JSON.stringify(names)]);
  return listMines(newsroomId);
}

export async function getMine(newsroomId, collection) {
  const { rows: claims } = await pool.query(
    'SELECT id, claim_text, verdict, rationale, citations, updated_at, verified_at FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2 ORDER BY updated_at DESC', [newsroomId, collection]);
  const { rows: sources } = await pool.query(
    'SELECT id, title, role, url FROM beaiready_company_sources WHERE newsroom_id=$1 AND collection=$2 ORDER BY created_at DESC', [newsroomId, collection]);
  const ids = claims.map((c) => c.id);
  const evByClaim = {}, evtByClaim = {};
  if (ids.length) {
    const { rows: ev } = await pool.query(
      'SELECT claim_id, source_id, role, stance, quote, title FROM beaiready_claim_evidence WHERE claim_id = ANY($1) ORDER BY created_at', [ids]);
    for (const e of ev) (evByClaim[e.claim_id] ||= []).push({ source_id: e.source_id, role: e.role, stance: e.stance, title: e.title, quote: (decryptFor(newsroomId, e.quote) || '').slice(0, 400) });
    const { rows: evt } = await pool.query(
      'SELECT claim_id, event_type, old_verdict, new_verdict, created_at FROM beaiready_claim_events WHERE claim_id = ANY($1) ORDER BY created_at DESC', [ids]);
    for (const e of evt) (evtByClaim[e.claim_id] ||= []).push({ event_type: e.event_type, old_verdict: e.old_verdict, new_verdict: e.new_verdict, created_at: e.created_at });
  }
  const enriched = claims.map((c) => ({ ...c, evidence: evByClaim[c.id] || [], events: evtByClaim[c.id] || [] }));
  return { collection, claims: enriched, sources, counts: await verdictCounts(newsroomId, collection) };
}

export async function claimsReport(newsroomId) {
  const mines = await listMines(newsroomId);
  const { rows: snapshots } = await pool.query(
    'SELECT collection, taken_at, counts FROM beaiready_claim_snapshots WHERE newsroom_id=$1 ORDER BY taken_at ASC', [newsroomId]);
  return { mines, snapshots };
}
