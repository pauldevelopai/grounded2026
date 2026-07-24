// pillars.js — shared vocabulary + ranking for the daily newsletter.
//
// The editorial frame (spec Part 2 / Part 6) is authoritative: three pillars,
// eight categories, order set daily by news weight. Everything here is the
// machine-readable version of that frame. Tune the knobs (models, image style,
// weights) via env without touching the pipeline code.

// The 8 categories the classifier may assign (Component 1).
export const CATEGORIES = [
  'lawsuit', 'fine', 'regulation', 'enforcement',
  'breach', 'cyberattack', 'scam', 'policy',
];

// Category → pillar. This is the ONLY place the mapping lives.
export const CATEGORY_PILLAR = {
  breach:      'cyber',
  cyberattack: 'cyber',
  scam:        'cyber',      // AI-enabled fraud incl. deepfake fraud
  regulation:  'governance',
  enforcement: 'governance',
  policy:      'governance', // government OR corporate AI policy moves
  lawsuit:     'legal',
  fine:        'legal',
};

// Display order of pillars is dynamic (by news weight), but each pillar has a
// fixed key, human label, and section header.
export const PILLARS = ['cyber', 'governance', 'legal'];
export const PILLAR_LABEL = {
  cyber:      'Cyber Security',
  governance: 'Governance',
  legal:      'Legal',
};

// Models. Spec is explicit: Haiku for classification + image concept (cheap),
// Sonnet for the writer. Overridable via env for tuning/rollback.
export const MODELS = {
  classify:     process.env.NEWSLETTER_CLASSIFY_MODEL || 'claude-haiku-4-5-20251001',
  write:        process.env.NEWSLETTER_WRITE_MODEL    || 'claude-sonnet-4-6',
  imageConcept: process.env.NEWSLETTER_IMAGE_CONCEPT_MODEL || 'claude-haiku-4-5-20251001',
};

// Fixed style prefix so every header image reads as the same publication
// (Component 3). Editable knob — keep the "no text / no real people / no logos"
// clauses, they are guardrails not styling.
export const IMAGE_STYLE_PREFIX = process.env.NEWSLETTER_IMAGE_STYLE ||
  'Editorial illustration, flat graphic style, bold limited palette of deep navy, ' +
  'warm ochre and off-white, strong simple shapes, generous negative space, ' +
  'no text, no words, no letters, no real people’s faces, no logos.';

export const pillarOf = (category) => CATEGORY_PILLAR[category] || null;

/**
 * Story score = severity + africa_relevance + recency bonus.
 *
 * africa_relevance is a RANKING factor ONLY — it lifts African-relevant stories
 * up the running order, it NEVER excludes a global story (spec guardrail). A
 * story fetched in the last 6h gets the full recency bonus, decaying to 0 at 24h.
 */
export function scoreStory(s, now = Date.now()) {
  const severity = Number(s.nl_severity ?? s.severity ?? 1);
  const africa   = Number(s.nl_africa_relevance ?? s.africa_relevance ?? 1);
  const fetched  = new Date(s.fetched_at || s.published_at || now).getTime();
  const ageHours = Math.max(0, (now - fetched) / 3.6e6);
  const recency  = Math.max(0, 2 * (1 - Math.min(ageHours, 24) / 24)); // 0..2
  return severity + africa + recency;
}

// A pillar's weight = its best story's score. Empty pillar = -Infinity so it
// sinks to the bottom (or is dropped) in the running order.
export function pillarScore(stories) {
  if (!stories || !stories.length) return -Infinity;
  return Math.max(...stories.map((s) => scoreStory(s)));
}
