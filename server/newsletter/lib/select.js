// select.js — Component 2, steps 1-2: select, dedupe, group, rank.
//
// Produces the ordered plan the writer works from. No LLM calls here — this is
// deterministic ranking so the writer's job is purely to write, not to decide
// what's important (keeps the two concerns separable and cheap to reason about).

import pool from '../../db/pool.js';
import {
  CATEGORY_PILLAR, PILLARS, scoreStory, pillarScore,
} from './pillars.js';

// Stopwords stripped before comparing titles for near-duplicate detection.
const STOP = new Set(('a an the of to in on for and or but with without over under after '
  + 'as at by from into about is are was were be been being this that these those it its '
  + 'ai artificial intelligence new says say said report reports amid could would may will')
  .split(' '));

function titleTokens(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Dedupe near-identical stories (same event, multiple outlets). Keep the
 * highest-scored representative of each cluster. O(n^2) but n is a day's
 * in-scope items (tens), so it's fine.
 */
function dedupe(stories, threshold = 0.6) {
  const withTokens = stories.map((s) => ({ s, tok: titleTokens(s.title), score: scoreStory(s) }));
  withTokens.sort((a, b) => b.score - a.score); // best first, so it wins its cluster
  const kept = [];
  for (const cand of withTokens) {
    const dup = kept.find((k) => jaccard(k.tok, cand.tok) >= threshold);
    if (dup) {
      dup.s._duped = (dup.s._duped || 0) + 1; // note how many outlets covered it
    } else {
      kept.push(cand);
    }
  }
  return kept.map((k) => k.s);
}

/**
 * Build the ranked, grouped plan for a given day.
 *
 * @returns {{
 *   pillars: Array<{ pillar, label, score, stories, treatment }>,
 *   allStories: Array,   // flat, deduped, for the sources list
 *   quiet: boolean,
 * }}
 */
export async function selectStories({ sinceHours = 24, leadFull = 2, otherPerPillar = 2 } = {}) {
  const { rows } = await pool.query(
    `SELECT r.id, r.title, r.url, r.content, r.published_at, r.fetched_at,
            r.nl_category, r.nl_severity, r.nl_africa_relevance, r.nl_one_line,
            s.name AS source_name
       FROM ai_legal_raw_items r
       LEFT JOIN ai_legal_sources s ON s.id = r.source_id
      WHERE r.nl_in_scope = true
        AND r.nl_category IS NOT NULL
        AND r.fetched_at > NOW() - ($1 || ' hours')::interval
        AND r.url IS NOT NULL AND r.url <> ''
      ORDER BY r.fetched_at DESC`,
    [String(sinceHours)],
  );

  const deduped = dedupe(rows);

  // Group by pillar.
  const byPillar = new Map(PILLARS.map((p) => [p, []]));
  for (const s of deduped) {
    const p = CATEGORY_PILLAR[s.nl_category];
    if (p && byPillar.has(p)) byPillar.get(p).push(s);
  }

  // Rank within pillar, then rank pillars by their best story.
  const pillars = PILLARS.map((pillar) => {
    const stories = byPillar.get(pillar).sort((a, b) => scoreStory(b) - scoreStory(a));
    return { pillar, stories, score: pillarScore(stories) };
  })
    .filter((p) => p.stories.length > 0)
    .sort((a, b) => b.score - a.score);

  // Assign treatment: lead pillar gets up to `leadFull` full stories; every
  // other pillar gets up to `otherPerPillar` compressed items.
  pillars.forEach((p, idx) => {
    if (idx === 0) {
      p.treatment = 'lead';
      p.stories = p.stories.slice(0, Math.max(leadFull, 1));
    } else {
      p.treatment = 'compressed';
      p.stories = p.stories.slice(0, Math.max(otherPerPillar, 1));
    }
  });

  return {
    pillars,
    allStories: pillars.flatMap((p) => p.stories),
    quiet: pillars.length === 0,
  };
}
