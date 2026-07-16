// claims-verify.js — EnviroPress Claims Verifier engine. For a mine (collection):
// extract the concrete claims from its OWN documents (role='claim'), then verdict each
// against the newsroom's reporting + independent external sources (role in
// reporting/external) — supported / contradicted / misleading / unverified, with
// citations. Verdicts persist and are re-computed as evidence is added; each run writes
// a snapshot for the trend. Reuses KnowHow's retrieval, the tenant persona, callClaude.
import pool from '../db/pool.js';
import { decryptFor, encryptFor } from './crypto.js';
import { callClaude } from './claude.js';
import { retrieveCompanyChunks, retrieveCriteriaChunks } from './company-knowledge-index.js';
import { generateEmbedding, toPgVector } from './embeddings.js';
import { assistantInstructionsFor } from './knowhow-presets.js';

const VERDICTS = ['supported', 'contradicted', 'misleading', 'unverified'];
const CLAIM_STATUSES = ['open', 'needs_reporting', 'disputed', 'resolved'];
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
// `since` (incremental) limits extraction to claim docs added after a mine's last run.
export async function extractClaims(newsroomId, collection, { since = null } = {}) {
  const { rows } = await pool.query(
    `SELECT title, extracted_text FROM beaiready_company_sources
      WHERE newsroom_id=$1 AND collection=$2 AND role='claim' AND extracted_text IS NOT NULL
        AND ($3::timestamptz IS NULL OR created_at > $3)`, [newsroomId, collection, since]);
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

// Verdict claims against reporting + external evidence. Idempotent; snapshots counts.
// `incremental` re-verifies only stale claims (verified_at IS NULL) — new claims plus any
// the mine's fresh evidence flagged — so the nightly job never re-runs the model on a
// claim whose evidence didn't move. `since` scopes extraction to newly-added claim docs.
export async function verifyClaims(newsroomId, collection, { incremental = false, since = null } = {}) {
  await extractClaims(newsroomId, collection, { since });
  const { rows: claims } = await pool.query(
    `SELECT id, claim_text, verdict AS prev FROM beaiready_claim_checks
      WHERE newsroom_id=$1 AND collection=$2 AND locked = false ${incremental ? 'AND verified_at IS NULL' : ''}`, [newsroomId, collection]);
  const persona = await assistantInstructionsFor(newsroomId).catch(() => '');
  let done = 0;
  for (const cl of claims) {
    const evidence = await retrieveCompanyChunks(newsroomId, cl.claim_text, { collection, roles: ['reporting', 'external'], limit: 8 });
    let verdict = 'unverified', rationale = 'No independent evidence has been added yet to test this claim.', citations = [], used = [], confidence = null, themes = [];
    if (evidence.length) {
      const ctx = evidence.map((e, i) => `[${i + 1}] (${e.kind}) ${e.title || ''}: ${e.text.replace(/\s+/g, ' ').slice(0, 1200)}`).join('\n\n');
      const criteria = await retrieveCriteriaChunks(newsroomId, cl.claim_text, collection, 4);
      const criteriaBlock = criteria.length
        ? '\n\nJUDGING CRITERIA — apply these standards when deciding (the newsroom’s own yardstick):\n'
          + criteria.map((c) => `- ${c.title ? c.title + ': ' : ''}${c.text.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n')
        : '';
      const system = (persona ? persona + '\n\n' : '')
        + 'You are testing a single claim a mining company made about itself, using ONLY the numbered EVIDENCE below '
        + '(the newsroom’s own reporting and independent sources). Decide a verdict and cite the evidence you used. '
        + 'Return STRICT JSON: {"verdict":"supported"|"contradicted"|"misleading"|"unverified","rationale":string(<=400 chars, cite [n]),"citations":number[],"confidence":number 0..1,"themes":string[]}. '
        + 'supported = evidence backs it; contradicted = evidence shows it false; misleading = technically true but creates a false '
        + 'impression; unverified = the evidence does not settle it. confidence = how strongly the evidence settles it. '
        + 'themes = 1–3 short lowercase topic tags (e.g. "rehabilitation","water pollution","employment"). Go strictly on the evidence — never assume.'
        + criteriaBlock;
      try {
        const p = safeJson(await callClaude({ system, userContent: `CLAIM: ${cl.claim_text}\n\nEVIDENCE:\n${ctx}\n\nReturn the JSON.`, maxTokens: 500, temperature: 0.1 }));
        if (p && VERDICTS.includes(p.verdict)) {
          verdict = p.verdict;
          rationale = String(p.rationale || '').slice(0, 600);
          used = (Array.isArray(p.citations) ? p.citations : []).map((n) => evidence[n - 1]).filter(Boolean);
          citations = used.map((e) => ({ title: e.title, kind: e.kind }));
          if (typeof p.confidence === 'number') confidence = Math.max(0, Math.min(1, p.confidence));
          if (Array.isArray(p.themes)) themes = p.themes.slice(0, 3).map((t) => String(t).toLowerCase().slice(0, 40)).filter(Boolean);
        }
      } catch (e) { console.error('[claims verify]', e.message); }
    }
    await pool.query(
      `UPDATE beaiready_claim_checks SET verdict=$1, rationale=$2, citations=$3::jsonb, confidence=$4,
         themes = CASE WHEN jsonb_array_length(themes) = 0 THEN $5::jsonb ELSE themes END,
         updated_at=NOW(), verified_at=NOW() WHERE id=$6`,
      [verdict, rationale, JSON.stringify(citations), confidence, JSON.stringify(themes), cl.id]);
    // Frozen evidence links: the exact passages this verdict rests on. Only AI-retrieved rows
    // are refreshed — human counterclaims (manual=true) are preserved across re-verification.
    await pool.query('DELETE FROM beaiready_claim_evidence WHERE claim_id=$1 AND manual = false', [cl.id]);
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
  // Only snapshot when something actually changed — keeps the trend free of empty nightly points.
  if (done > 0) await pool.query('INSERT INTO beaiready_claim_snapshots (newsroom_id, collection, counts) VALUES ($1,$2,$3::jsonb)', [newsroomId, collection, JSON.stringify(counts)]);
  await pool.query('UPDATE beaiready_claim_mines SET last_run_at=NOW() WHERE newsroom_id=$1 AND name=$2', [newsroomId, collection]);
  return { verified: done, counts };
}

// Mark a mine's claims as needing re-verification (its evidence changed). Locked (human-
// set) verdicts are left alone — see Phase 3.
async function markMineStale(newsroomId, collection) {
  await pool.query('UPDATE beaiready_claim_checks SET verified_at=NULL WHERE newsroom_id=$1 AND collection=$2 AND locked = false', [newsroomId, collection]);
}

// Nightly job body: for every claims-verification tenant's mines, re-verify only those that
// gained evidence since their last run — and then only the stale claims. No change ⇒ no model calls.
export async function reverifyStaleMines() {
  const { rows: mines } = await pool.query(
    `SELECT m.newsroom_id, m.name, m.last_run_at
       FROM beaiready_claim_mines m
       JOIN beaiready_knowhow_settings s ON s.newsroom_id = m.newsroom_id
      WHERE s.use_case = 'claims-verification'`);
  let minesRun = 0, claimsVerified = 0;
  for (const m of mines) {
    const { rows: [chg] } = await pool.query(
      `SELECT MAX(created_at) FILTER (WHERE role='claim') AS claim_changed,
              MAX(created_at) FILTER (WHERE role IN ('reporting','external')) AS evid_changed
         FROM beaiready_company_sources WHERE newsroom_id=$1 AND collection=$2`, [m.newsroom_id, m.name]);
    const since = m.last_run_at;
    const claimNew = chg.claim_changed && (!since || chg.claim_changed > since);
    const evidNew = chg.evid_changed && (!since || chg.evid_changed > since);
    if (!claimNew && !evidNew) continue;                          // nothing changed → skip (no model calls)
    if (evidNew) await markMineStale(m.newsroom_id, m.name);      // new evidence may flip existing verdicts
    const r = await verifyClaims(m.newsroom_id, m.name, { incremental: true, since });
    claimsVerified += r.verified; minesRun++;
  }
  return { minesRun, claimsVerified };
}

// ── Mines (now first-class rows, backfilled from settings.collections in migration 142) ──
async function mineNames(newsroomId) {
  const { rows } = await pool.query('SELECT name FROM beaiready_claim_mines WHERE newsroom_id=$1 ORDER BY created_at', [newsroomId]);
  return rows.map((r) => r.name);
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
  if (clean) await pool.query(
    'INSERT INTO beaiready_claim_mines (newsroom_id, name) VALUES ($1,$2) ON CONFLICT (newsroom_id, name) DO NOTHING', [newsroomId, clean]);
  return listMines(newsroomId);
}

// Removes the bucket from the list; its documents and verdicts stay under the collection
// name (re-adding a mine of the same name re-attaches them).
export async function removeMine(newsroomId, name) {
  await pool.query('DELETE FROM beaiready_claim_mines WHERE newsroom_id=$1 AND name=$2', [newsroomId, name]);
  return listMines(newsroomId);
}

export async function getMine(newsroomId, collection) {
  const { rows: claims } = await pool.query(
    `SELECT id, claim_text, verdict, rationale, citations, confidence, status, locked, notes, themes, updated_at, verified_at
       FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2 ORDER BY updated_at DESC`, [newsroomId, collection]);
  const { rows: sources } = await pool.query(
    'SELECT id, title, role, url FROM beaiready_company_sources WHERE newsroom_id=$1 AND collection=$2 ORDER BY created_at DESC', [newsroomId, collection]);
  const ids = claims.map((c) => c.id);
  const evByClaim = {}, evtByClaim = {};
  if (ids.length) {
    const { rows: ev } = await pool.query(
      'SELECT id, claim_id, source_id, role, stance, quote, title, manual FROM beaiready_claim_evidence WHERE claim_id = ANY($1) ORDER BY manual, created_at', [ids]);
    for (const e of ev) (evByClaim[e.claim_id] ||= []).push({ id: e.id, source_id: e.source_id, role: e.role, stance: e.stance, title: e.title, manual: e.manual, quote: (decryptFor(newsroomId, e.quote) || '').slice(0, 400) });
    const { rows: evt } = await pool.query(
      'SELECT claim_id, event_type, old_verdict, new_verdict, created_at FROM beaiready_claim_events WHERE claim_id = ANY($1) ORDER BY created_at DESC', [ids]);
    for (const e of evt) (evtByClaim[e.claim_id] ||= []).push({ event_type: e.event_type, old_verdict: e.old_verdict, new_verdict: e.new_verdict, created_at: e.created_at });
  }
  const enriched = claims.map((c) => ({ ...c, notes: c.notes ? (decryptFor(newsroomId, c.notes) || '') : '', evidence: evByClaim[c.id] || [], events: evtByClaim[c.id] || [] }));
  return { collection, claims: enriched, sources, counts: await verdictCounts(newsroomId, collection) };
}

// ── Editorial control (Phase 3): manual claims, verdict override/lock, status, counterclaims ──

// Manually log a claim (dedup-checked like extracted ones).
export async function addManualClaim(newsroomId, collection, text) {
  const c = String(text || '').trim().slice(0, 400);
  if (!c) return null;
  const { rowCount } = await pool.query('SELECT 1 FROM beaiready_claim_checks WHERE newsroom_id=$1 AND collection=$2 AND lower(claim_text)=lower($3)', [newsroomId, collection, c]);
  if (rowCount) return null;
  const vec = await generateEmbedding(c).catch(() => null);
  if (await findSimilarClaim(newsroomId, collection, vec)) return null;
  const { rows: [ins] } = await pool.query(
    'INSERT INTO beaiready_claim_checks (newsroom_id, collection, claim_text, verdict, embedding) VALUES ($1,$2,$3,\'pending\',$4) RETURNING id',
    [newsroomId, collection, c, vec ? toPgVector(vec) : null]);
  await pool.query('INSERT INTO beaiready_claim_events (newsroom_id, claim_id, event_type, new_verdict, detail) VALUES ($1,$2,\'created\',\'pending\',\'{"from":"manual"}\'::jsonb)', [newsroomId, ins.id]);
  return ins.id;
}

// Editor edits: override verdict (+lock so the verifier won't touch it), set status, add notes.
export async function updateClaim(newsroomId, claimId, patch = {}) {
  const { rows: [cur] } = await pool.query('SELECT verdict FROM beaiready_claim_checks WHERE id=$1 AND newsroom_id=$2', [claimId, newsroomId]);
  if (!cur) return null;
  const set = ['updated_at=NOW()']; const vals = [claimId, newsroomId]; const p = (v) => { vals.push(v); return `$${vals.length}`; };
  let newVerdict = null;
  if (patch.verdict && [...VERDICTS, 'pending'].includes(patch.verdict)) { newVerdict = patch.verdict; set.push(`verdict=${p(patch.verdict)}`, 'verified_at=NOW()'); }
  if (typeof patch.locked === 'boolean') set.push(`locked=${p(patch.locked)}`);
  if (patch.status && CLAIM_STATUSES.includes(patch.status)) set.push(`status=${p(patch.status)}`);
  if (patch.notes !== undefined) set.push(`notes=${p(patch.notes ? encryptFor(newsroomId, String(patch.notes).slice(0, 4000)) : null)}`);
  if (Array.isArray(patch.themes)) set.push(`themes=${p(JSON.stringify(patch.themes.slice(0, 6).map((t) => String(t).toLowerCase().slice(0, 40)).filter(Boolean)))}::jsonb`);
  await pool.query(`UPDATE beaiready_claim_checks SET ${set.join(', ')} WHERE id=$1 AND newsroom_id=$2`, vals);
  if (newVerdict && newVerdict !== cur.verdict) {
    await pool.query(
      'INSERT INTO beaiready_claim_events (newsroom_id, claim_id, event_type, old_verdict, new_verdict, detail) VALUES ($1,$2,\'verdict_overridden\',$3,$4,\'{"by":"editor"}\'::jsonb)',
      [newsroomId, claimId, cur.verdict, newVerdict]);
  }
  return true;
}

// A counterclaim: a human-authored opposing statement logged against a claim. Stored as a
// manual evidence row (stance='counterclaim') so it shows with the evidence and survives re-verify.
export async function addCounterclaim(newsroomId, claimId, text, attribution, userId) {
  const t = String(text || '').trim().slice(0, 1200);
  if (!t) return null;
  await pool.query(
    'INSERT INTO beaiready_claim_evidence (newsroom_id, claim_id, source_id, role, stance, quote, title, manual, created_by) VALUES ($1,$2,NULL,NULL,\'counterclaim\',$3,$4,true,$5)',
    [newsroomId, claimId, encryptFor(newsroomId, t), String(attribution || '').slice(0, 200) || 'Counterclaim', userId || null]);
  await pool.query('INSERT INTO beaiready_claim_events (newsroom_id, claim_id, event_type, detail) VALUES ($1,$2,\'counterclaim_added\',$3::jsonb)', [newsroomId, claimId, JSON.stringify({ attribution: attribution || null })]);
  return true;
}

// Remove a human-added evidence row (counterclaim/note). Won't touch AI-retrieved evidence.
export async function deleteManualEvidence(newsroomId, evidenceId) {
  await pool.query('DELETE FROM beaiready_claim_evidence WHERE id=$1 AND newsroom_id=$2 AND manual = true', [evidenceId, newsroomId]);
  return true;
}

export async function claimsReport(newsroomId) {
  const mines = await listMines(newsroomId);
  const { rows: snapshots } = await pool.query(
    'SELECT collection, taken_at, counts FROM beaiready_claim_snapshots WHERE newsroom_id=$1 ORDER BY taken_at ASC', [newsroomId]);
  return { mines, snapshots };
}

// ── The output: what doesn't match, and what's missing on each side ──
//
// Three things a newsroom actually needs out of this:
//  1. the INCONSISTENCIES — claims the evidence contradicts, with the quote that does it;
//  2. the CLAIM-SIDE GAP — claims nothing in your files can test yet (a reporting to-do);
//  3. the REPORTING-SIDE GAP — your reporting/independent sources that no claim rests on
//     (what the mine stays silent about — often the story).
export async function claimsAnalysis(newsroomId) {
  const { rows: inc } = await pool.query(
    `SELECT id, collection, claim_text, verdict, rationale, confidence, themes, status
       FROM beaiready_claim_checks
      WHERE newsroom_id=$1 AND verdict IN ('contradicted','misleading')
      ORDER BY confidence DESC NULLS LAST, updated_at DESC LIMIT 50`, [newsroomId]);
  const ids = inc.map((r) => r.id);
  const evByClaim = {};
  if (ids.length) {
    const { rows: ev } = await pool.query(
      `SELECT claim_id, title, role, quote, stance FROM beaiready_claim_evidence
        WHERE claim_id = ANY($1) AND stance IN ('contradicts','counterclaim') ORDER BY manual, created_at`, [ids]);
    for (const e of ev) (evByClaim[e.claim_id] ||= []).push({ title: e.title, role: e.role, stance: e.stance, quote: (decryptFor(newsroomId, e.quote) || '').slice(0, 300) });
  }
  const inconsistencies = inc.map((c) => ({ ...c, evidence: evByClaim[c.id] || [] }));

  // Claim-side gap: a claim with no evidence attached at all — nothing on file can test it.
  const { rows: untested } = await pool.query(
    `SELECT c.id, c.collection, c.claim_text, c.verdict, c.themes
       FROM beaiready_claim_checks c
      WHERE c.newsroom_id=$1 AND c.verdict IN ('unverified','pending')
        AND NOT EXISTS (SELECT 1 FROM beaiready_claim_evidence e WHERE e.claim_id = c.id)
      ORDER BY c.collection, c.updated_at DESC LIMIT 100`, [newsroomId]);

  // Reporting-side gap: your reporting/external that no verdict has ever rested on.
  const { rows: unused } = await pool.query(
    `SELECT s.id, s.collection, s.title, s.role
       FROM beaiready_company_sources s
      WHERE s.newsroom_id=$1 AND s.role IN ('reporting','external') AND s.collection IS NOT NULL
        AND s.inclusion <> 'exclude' AND s.sensitivity <> 'withdrawn'
        AND NOT EXISTS (SELECT 1 FROM beaiready_claim_evidence e WHERE e.source_id = s.id)
      ORDER BY s.collection, s.created_at DESC LIMIT 100`, [newsroomId]);

  // Balance: a mine missing a whole side of the comparison.
  const mines = await listMines(newsroomId);
  const balance = mines.map((m) => ({
    name: m.name,
    sources: m.sources,
    missing: [
      !m.sources.claim ? 'nothing the mine itself claims' : null,
      !m.sources.reporting ? 'none of your own reporting' : null,
      !m.sources.external ? 'no independent sources' : null,
    ].filter(Boolean),
    untested: untested.filter((u) => u.collection === m.name).length,
    unused: unused.filter((u) => u.collection === m.name).length,
  }));

  return { inconsistencies, untested, unused, balance };
}

// ── Phase 4: the cross-mine claims database — search, themes, export ──

// Filterable search across ALL of a tenant's claims (claim_text is stored in the clear).
export async function searchClaims(newsroomId, { q = '', verdict = '', theme = '', status = '', mine = '' } = {}) {
  const where = ['newsroom_id = $1']; const vals = [newsroomId]; const p = (v) => { vals.push(v); return `$${vals.length}`; };
  if (String(q).trim()) where.push(`claim_text ILIKE ${p('%' + String(q).trim() + '%')}`);
  if ([...VERDICTS, 'pending'].includes(verdict)) where.push(`verdict = ${p(verdict)}`);
  if (CLAIM_STATUSES.includes(status)) where.push(`status = ${p(status)}`);
  if (String(mine).trim()) where.push(`collection = ${p(String(mine).trim())}`);
  if (String(theme).trim()) where.push(`themes @> ${p(JSON.stringify([String(theme).trim().toLowerCase()]))}::jsonb`);
  const { rows } = await pool.query(
    `SELECT id, collection, claim_text, verdict, confidence, status, themes, rationale, verified_at
       FROM beaiready_claim_checks WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 500`, vals);
  return rows;
}

// Org-wide judging criteria (role='criteria', not tied to a mine) — the standards applied
// to every mine's claims. Per-mine criteria live on the mine (collection set) instead.
export async function listOrgCriteria(newsroomId) {
  const { rows } = await pool.query(
    "SELECT id, title, kind, created_at FROM beaiready_company_sources WHERE newsroom_id=$1 AND role='criteria' AND collection IS NULL ORDER BY created_at DESC", [newsroomId]);
  return rows;
}

// Distinct themes across the tenant, for the filter dropdown.
export async function listThemes(newsroomId) {
  const { rows } = await pool.query(
    'SELECT DISTINCT jsonb_array_elements_text(themes) AS theme FROM beaiready_claim_checks WHERE newsroom_id=$1 ORDER BY theme', [newsroomId]).catch(() => ({ rows: [] }));
  return rows.map((r) => r.theme).filter(Boolean);
}

// Structured export of every claim (CSV for a spreadsheet/story, JSON for a public tracker feed).
export async function exportClaims(newsroomId, format = 'csv') {
  const { rows } = await pool.query(
    `SELECT c.collection, c.claim_text, c.verdict, c.confidence, c.status, c.themes, c.rationale, c.verified_at,
            (SELECT count(*)::int FROM beaiready_claim_evidence e WHERE e.claim_id = c.id) AS evidence_count
       FROM beaiready_claim_checks c WHERE c.newsroom_id = $1 ORDER BY c.collection, c.updated_at DESC`, [newsroomId]);
  if (format === 'json') return { type: 'application/json', body: JSON.stringify(rows, null, 2) };
  const esc = (v) => { const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = ['collection', 'claim_text', 'verdict', 'confidence', 'status', 'themes', 'rationale', 'evidence_count', 'verified_at'];
  const header = ['Mine', 'Claim', 'Verdict', 'Confidence', 'Status', 'Themes', 'Rationale', 'Evidence', 'Last verified'].join(',');
  return { type: 'text/csv', body: [header, ...rows.map((r) => cols.map((k) => esc(r[k])).join(','))].join('\n') };
}
