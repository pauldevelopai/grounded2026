// insights.js — the anonymised cross-business insight engine.
//
// Privacy is the whole point. We aggregate ONLY from businesses that have opted in
// (newsrooms.shares_anonymised_insights), require at least MIN_ORGS distinct
// businesses behind any pattern (k-anonymity), feed the model only DE-IDENTIFIED
// aggregates (counts, category distributions, pooled+shuffled task phrases — never a
// company name or which business did what), and instruct it to output patterns only.
// Published patterns are written into knowledge_entries as visibility='pattern', which
// the org-scoped retrieval is allowed to surface to everyone — because they carry no
// tenant specifics.
import pool from '../db/pool.js';
import { callClaude } from './claude.js';
import { createKnowledgeEntry } from './knowledge.js';

const MIN_ORGS = 2;   // k-anonymity floor — no pattern is ever built from a single business

// Pull a de-identified aggregate for a sector, from consenting businesses only.
// Returns null if fewer than MIN_ORGS consent — there is nothing we can safely share.
export async function gatherSectorAggregate(sectorId) {
  const { rows: orgs } = await pool.query(
    `SELECT n.id AS newsroom_id, n.organisation_id
       FROM newsrooms n JOIN organisations o ON o.id = n.organisation_id
      WHERE n.shares_anonymised_insights = true
        AND ($1::uuid IS NULL OR o.sector_id = $1)`, [sectorId || null]);
  const newsroomIds = orgs.map((o) => o.newsroom_id);
  const orgCount = new Set(orgs.map((o) => o.organisation_id)).size;
  if (orgCount < MIN_ORGS || !newsroomIds.length) return null;

  // What businesses are pursuing with AI — pooled across orgs, shuffled, UNATTRIBUTED.
  const { rows: strat } = await pool.query(
    `SELECT kind, effort, payoff, title FROM training_strategy_items
      WHERE newsroom_id = ANY($1) ORDER BY md5(id::text)`, [newsroomIds]).catch(() => ({ rows: [] }));
  // Effort/payoff distribution for automation items.
  const dist = {};
  for (const s of strat) { const k = `${s.kind}/${s.effort || '—'}/${s.payoff || '—'}`; dist[k] = (dist[k] || 0) + 1; }
  // Measurement: aggregate only (sum/avg + how many orgs reported), never per-business.
  const { rows: metrics } = await pool.query(
    `SELECT metric, round(sum(value))::int AS total, round(avg(value))::int AS avg, count(DISTINCT newsroom_id)::int AS orgs
       FROM business_metrics WHERE newsroom_id = ANY($1) AND value IS NOT NULL
      GROUP BY metric HAVING count(DISTINCT newsroom_id) >= ${MIN_ORGS}`, [newsroomIds]).catch(() => ({ rows: [] }));
  // Where the consultants' recommendations cluster, by pillar.
  const { rows: recs } = await pool.query(
    `SELECT pillar, count(*)::int AS n FROM recommendations WHERE newsroom_id = ANY($1) GROUP BY pillar ORDER BY n DESC`, [newsroomIds]).catch(() => ({ rows: [] }));

  return {
    orgCount,
    automations: strat.filter((s) => s.kind === 'automation').map((s) => s.title).slice(0, 40),
    goals: strat.filter((s) => s.kind === 'goal').map((s) => s.title).slice(0, 40),
    effortPayoff: dist,
    metrics,
    recsByPillar: recs,
  };
}

function parseJsonArray(text) {
  const m = (text || '').match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Derive + persist anonymised patterns for a sector. Returns the created insights.
// Replaces this sector's prior generated set so re-running doesn't pile up duplicates.
export async function deriveSectorInsights(sectorId) {
  const agg = await gatherSectorAggregate(sectorId);
  if (!agg) return { ok: false, reason: `Need at least ${MIN_ORGS} consenting businesses${sectorId ? ' in this sector' : ''}.` };

  const sectorName = sectorId
    ? (await pool.query('SELECT name FROM sectors WHERE id = $1', [sectorId])).rows[0]?.name || null
    : null;

  const system =
    'You analyse DE-IDENTIFIED, aggregated data pooled across multiple businesses to find shared patterns in how ' +
    'they adopt AI. STRICT PRIVACY: you are never told which business did what, and you must NEVER name, describe, ' +
    'or single out any individual business — write only in aggregate ("businesses like yours tend to…", "a common ' +
    'pitfall is…", "what works…"). Output ONLY a JSON array, 3–5 elements, each ' +
    '{"pattern_type":"automation"|"goal"|"pitfall"|"adoption"|"measurement","title":string,"insight":string}. ' +
    'Ground every insight in the provided aggregate; if the data is thin, return fewer items rather than inventing.';
  const userContent =
    `De-identified aggregate across ${agg.orgCount} ${sectorName ? sectorName + ' ' : ''}businesses that have opted in:\n\n` +
    `Automations they're pursuing (pooled, unattributed):\n${agg.automations.join('; ') || '(none)'}\n\n` +
    `Goals they've set (pooled, unattributed):\n${agg.goals.join('; ') || '(none)'}\n\n` +
    `Automation sizing distribution (kind/effort/payoff → count): ${JSON.stringify(agg.effortPayoff)}\n\n` +
    `Measurement (aggregate only): ${JSON.stringify(agg.metrics)}\n\n` +
    `Where recommendations cluster (pillar → count): ${JSON.stringify(agg.recsByPillar)}\n\n` +
    `Write the anonymised patterns now as a JSON array.`;
  const raw = await callClaude({ system, userContent, maxTokens: 1200, temperature: 0.4 });
  const patterns = parseJsonArray(raw).filter((p) => p && p.title && p.insight).slice(0, 6);
  if (!patterns.length) return { ok: false, reason: 'No patterns could be derived from the current data.' };

  // Clear the prior generated set for this sector (and its pattern knowledge entries).
  const { rows: old } = await pool.query('SELECT knowledge_id FROM bair_insights WHERE sector_id IS NOT DISTINCT FROM $1', [sectorId || null]);
  for (const o of old) if (o.knowledge_id) await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [o.knowledge_id]).catch(() => {});
  await pool.query('DELETE FROM bair_insights WHERE sector_id IS NOT DISTINCT FROM $1', [sectorId || null]);

  const evidence = { org_count: agg.orgCount, effort_payoff: agg.effortPayoff, metrics: agg.metrics, recs_by_pillar: agg.recsByPillar };
  const created = [];
  for (const p of patterns) {
    const { rows: [ins] } = await pool.query(
      `INSERT INTO bair_insights (sector_id, pattern_type, title, insight, supporting_orgs, evidence)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
      [sectorId || null, p.pattern_type || 'adoption', p.title.slice(0, 300), p.insight, agg.orgCount, JSON.stringify(evidence)]);
    created.push({ id: ins.id, ...p });
  }
  return { ok: true, sector_id: sectorId || null, supporting_orgs: agg.orgCount, count: created.length, insights: created };
}

// Publish (or unpublish) an insight. Publishing ingests it as an anonymised 'pattern'
// knowledge entry so it informs every client's AI; unpublishing removes that entry.
export async function setInsightPublished(id, published) {
  const { rows: [it] } = await pool.query('SELECT * FROM bair_insights WHERE id = $1', [id]);
  if (!it) return null;
  if (published && !it.knowledge_id) {
    const knowledgeId = await createKnowledgeEntry({
      category: 'industry_trend', title: it.title, content: it.insight,
      sectorId: it.sector_id, organisationId: null, visibility: 'pattern',
      sourceType: 'bair_insight', sourceId: it.id,
      sourceDescription: `Anonymised pattern across ${it.supporting_orgs} businesses`,
      confidence: Math.min(0.5 + it.supporting_orgs * 0.05, 0.85),
    });
    await pool.query('UPDATE bair_insights SET is_published = true, knowledge_id = $1 WHERE id = $2', [knowledgeId, id]);
    return { ...it, is_published: true, knowledge_id: knowledgeId };
  }
  if (!published) {
    if (it.knowledge_id) await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [it.knowledge_id]).catch(() => {});
    await pool.query('UPDATE bair_insights SET is_published = false, knowledge_id = NULL WHERE id = $1', [id]);
    return { ...it, is_published: false, knowledge_id: null };
  }
  return it;
}
