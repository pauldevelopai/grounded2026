// classify.js — Component 1: the governance/cyber/legal classifier.
//
// Runs as a post-step after each scrape. Every not-yet-classified raw item
// (nl_classified_at IS NULL) goes through ONE batched Haiku call and gets its
// newsletter fields written back onto ai_legal_raw_items. This is INDEPENDENT
// of the legal triage_* pipeline — a story can be legal-triage 'rejected' and
// still be newsletter in_scope, and vice versa.
//
// Guardrails baked in: classification errors leave a row unclassified (retried
// next run) rather than mis-tagging it; a classifier failure can never
// fabricate a story downstream because selection reads nl_in_scope, not prose.

import pool from '../db/pool.js';
import { callClaude } from '../services/claude.js';
import { parseJsonArrayLoose } from '../services/claude.js';
import { CATEGORIES, CATEGORY_PILLAR, MODELS } from './lib/pillars.js';

const BATCH_SIZE = parseInt(process.env.NEWSLETTER_CLASSIFY_BATCH || '20', 10);

const SYSTEM = `You are a strict news classifier for a daily newsletter that tracks what is going WRONG with AI across three strands: cyber security, governance, and legal action.

You will be given a numbered list of news stories. For EACH story, decide whether it is in scope and, if so, classify it. Return ONLY a JSON array, one object per story, no prose, no code fences.

IN SCOPE = a concrete, real-world EVENT in one of these eight categories:
- "lawsuit"    — a lawsuit filed, ruling, settlement, or class action involving AI.
- "fine"       — a monetary penalty or damages imposed over AI use.
- "regulation" — a new/updated law, rule, statutory instrument, or binding standard for AI.
- "enforcement"— a regulator or authority taking action (investigation, order, ban, sanction).
- "breach"     — a data breach or security failure involving or exposing AI systems/data.
- "cyberattack"— an AI-enabled or AI-targeted cyber attack, intrusion, or exploit.
- "scam"       — AI-enabled fraud, including deepfake fraud, voice-clone scams, phishing.
- "policy"     — a GOVERNMENT, regulator, or MAJOR COMPANY adopting/announcing rules or a
                 formal policy for AI use. NOT product launches. NOT funding. NOT opinion.

OUT OF SCOPE (set in_scope=false): product launches, funding/investment news, model
releases, benchmarks, general tech news, and OPINION/ANALYSIS pieces — UNLESS the piece
reports a concrete new event above. Marketing, tutorials, and roundups are out of scope.

For each story output an object with EXACTLY these keys:
{
  "i": <the story's number, 0-based, as given>,
  "in_scope": <true|false>,
  "category": <one of the eight strings above, or null if out of scope>,
  "severity": <integer 1-5: how consequential the event is; 1 trivial, 5 major>,
  "africa_relevance": <integer 1-5: 5 = an African story (any country) or directly binding
                       on African organisations; 3 = global with a clear African implication
                       (e.g. EU AI Act, a precedent-setting US ruling); 1 = distant curiosity.
                       This score is for ranking only. NEVER lower it to exclude a story.>,
  "one_line": <a single factual sentence summarising the story, no opinion>
}

If a story is out of scope, still return its object with in_scope=false, category=null,
severity=1, africa_relevance=1, and a factual one_line. Output the array in input order.`;

function buildUserContent(rows) {
  const blocks = rows.map((r, i) => {
    const body = (r.content || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return [
      `#${i}`,
      `TITLE: ${r.title || '(untitled)'}`,
      `SOURCE: ${r.source_name || '(unknown)'}`,
      `URL: ${r.url || '(none)'}`,
      `EXCERPT: ${body || '(no body)'}`,
    ].join('\n');
  });
  return `Classify these ${rows.length} stories:\n\n${blocks.join('\n\n')}`;
}

const clampSev = (n) => Math.min(5, Math.max(1, parseInt(n, 10) || 1));

/**
 * Classify up to `limit` unclassified raw items. Returns counts.
 * Pass `{ ids }` to (re)classify specific rows regardless of nl_classified_at.
 */
export async function classifyNewsletterItems({ limit = 200, ids = null, log = console.log } = {}) {
  let rows;
  if (ids && ids.length) {
    ({ rows } = await pool.query(
      `SELECT r.id, r.title, r.content, r.url, r.fetched_at, s.name AS source_name
         FROM ai_legal_raw_items r
         LEFT JOIN ai_legal_sources s ON s.id = r.source_id
        WHERE r.id = ANY($1::uuid[])`,
      [ids],
    ));
  } else {
    ({ rows } = await pool.query(
      `SELECT r.id, r.title, r.content, r.url, r.fetched_at, s.name AS source_name
         FROM ai_legal_raw_items r
         LEFT JOIN ai_legal_sources s ON s.id = r.source_id
        WHERE r.nl_classified_at IS NULL
        ORDER BY r.fetched_at DESC
        LIMIT $1`,
      [limit],
    ));
  }

  if (!rows.length) {
    log('[nl-classify] nothing to classify');
    return { seen: 0, classified: 0, inScope: 0, errors: 0 };
  }

  let classified = 0, inScope = 0, errors = 0;

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    let parsed = [];
    try {
      const raw = await callClaude({
        model: MODELS.classify,
        system: SYSTEM,
        userContent: buildUserContent(batch),
        maxTokens: 180 * batch.length + 200,
        temperature: 0,
      });
      parsed = parseJsonArrayLoose(raw);
    } catch (err) {
      errors += batch.length;
      log(`[nl-classify] batch ${start}-${start + batch.length - 1} failed: ${err.message}`);
      continue; // leave the whole batch pending → retried next run
    }

    // Index results by the model's own `i`, falling back to array position.
    const byIndex = new Map();
    parsed.forEach((r, k) => {
      if (!r) return;
      const idx = Number.isInteger(r.i) ? r.i : k;
      if (idx >= 0 && idx < batch.length) byIndex.set(idx, r);
    });

    for (let k = 0; k < batch.length; k++) {
      const row = batch[k];
      const res = byIndex.get(k);
      if (!res) { errors++; continue; } // unparsed → leave pending

      let category = res.in_scope ? res.category : null;
      if (category && !CATEGORIES.includes(category)) category = null;
      // A story with an unknown/missing category can't be placed in a pillar,
      // so treat it as out of scope rather than guessing.
      const scoped = Boolean(res.in_scope) && category && CATEGORY_PILLAR[category];

      await pool.query(
        `UPDATE ai_legal_raw_items
            SET nl_in_scope = $1,
                nl_category = $2,
                nl_severity = $3,
                nl_africa_relevance = $4,
                nl_one_line = $5,
                nl_classified_at = NOW()
          WHERE id = $6`,
        [
          Boolean(scoped),
          scoped ? category : null,
          clampSev(res.severity),
          clampSev(res.africa_relevance),
          (res.one_line || '').toString().slice(0, 500) || null,
          row.id,
        ],
      );
      classified++;
      if (scoped) inScope++;
    }
    log(`[nl-classify] batch ${start}-${start + batch.length - 1}: ${byIndex.size}/${batch.length} parsed`);
  }

  log(`[nl-classify] seen=${rows.length} classified=${classified} in_scope=${inScope} errors=${errors}`);
  return { seen: rows.length, classified, inScope, errors };
}
