// claims-verify.js — EnviroPress Claims Verifier engine. For a mine (collection):
// extract the concrete claims from its OWN documents (role='claim'), then verdict each
// against the newsroom's reporting + independent external sources (role in
// reporting/external) — supported / contradicted / misleading / unverified, with
// citations. Verdicts persist and are re-computed as evidence is added; each run writes
// a snapshot for the trend. Reuses KnowHow's retrieval, the tenant persona, callClaude.
import pool from '../db/pool.js';
import { decryptFor } from './crypto.js';
import { callClaude } from './claude.js';
import { retrieveCompanyChunks } from './company-knowledge-index.js';
import { assistantInstructionsFor } from './knowhow-presets.js';

const VERDICTS = ['supported', 'contradicted', 'misleading', 'unverified'];
const EMPTY_COUNTS = { supported: 0, contradicted: 0, misleading: 0, unverified: 0, pending: 0 };

function safeJson(t) { if (!t) return null; const m = String(t).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }

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
      if (rowCount) continue;
      await pool.query('INSERT INTO beaiready_claim_checks (newsroom_id, collection, claim_text, verdict) VALUES ($1,$2,$3,\'pending\')', [newsroomId, collection, c]);
      added++;
    }
  }
  return { extracted: added };
}

// Verdict every claim against reporting + external evidence. Idempotent; snapshots counts.
export async function verifyClaims(newsroomId, collection) {
  await extractClaims(newsroomId, collection);
  const { rows: claims } = await pool.query(
    'SELECT id, claim_text FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2', [newsroomId, collection]);
  const persona = await assistantInstructionsFor(newsroomId).catch(() => '');
  let done = 0;
  for (const cl of claims) {
    const evidence = await retrieveCompanyChunks(newsroomId, cl.claim_text, { collection, roles: ['reporting', 'external'], limit: 8 });
    let verdict = 'unverified', rationale = 'No independent evidence has been added yet to test this claim.', citations = [];
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
          citations = (Array.isArray(p.citations) ? p.citations : []).map((n) => evidence[n - 1]).filter(Boolean).map((e) => ({ title: e.title, kind: e.kind }));
        }
      } catch (e) { console.error('[claims verify]', e.message); }
    }
    await pool.query('UPDATE beaiready_claim_checks SET verdict=$1, rationale=$2, citations=$3::jsonb, updated_at=NOW() WHERE id=$4',
      [verdict, rationale, JSON.stringify(citations), cl.id]);
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
    'SELECT id, claim_text, verdict, rationale, citations, updated_at FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2 ORDER BY updated_at DESC', [newsroomId, collection]);
  const { rows: sources } = await pool.query(
    'SELECT id, title, role, url FROM beaiready_company_sources WHERE newsroom_id=$1 AND collection=$2 ORDER BY created_at DESC', [newsroomId, collection]);
  return { collection, claims, sources, counts: await verdictCounts(newsroomId, collection) };
}

export async function claimsReport(newsroomId) {
  const mines = await listMines(newsroomId);
  const { rows: snapshots } = await pool.query(
    'SELECT collection, taken_at, counts FROM beaiready_claim_snapshots WHERE newsroom_id=$1 ORDER BY taken_at ASC', [newsroomId]);
  return { mines, snapshots };
}
