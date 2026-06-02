// AI Ethics triage — reads pending content_raw_items (domain 'ethics'), asks
// Claude to judge relevance + classify each into one of the six ethics
// principles used by the public Ethics page, write a short summary, and emit a
// compiled ethics_items row (status 'review') for admin to publish. Mirrors
// triage-data-security (batched, cached system block, Haiku, low temperature).

import pool from '../../db/pool.js';
import { classifyInChunks } from '../claude.js';

const BATCH = 20;
const TEMP = 0.1;
// MUST match the principle ids on client PublicEthics.jsx (+ 'general').
const TOPICS = ['transparency', 'accuracy', 'sources', 'bias', 'labour', 'accountability', 'general'];

const SYSTEM = `You are a precise triage agent building a high-quality knowledge base on
AI ETHICS FOR NEWSROOMS — using AI responsibly in journalism. Your job is to surface
PRACTICAL GUIDANCE, PUBLISHED AI-USE POLICIES, SERIOUS RESEARCH, and REAL CASES — not hype.

For each item decide relevance, then classify into ONE principle:
- "transparency"   — disclosing AI use to the audience; labelling AI-assisted work; published AI-use policies
- "accuracy"       — verification, hallucinations, fact-checking AI output, editorial standards for AI
- "sources"        — protecting sources & sensitive data when using AI tools; data leakage/training concerns
- "bias"           — bias, representation, fairness, under-served languages/contexts, stereotyping
- "labour"         — jobs, skills, training, the newsroom workforce and AI
- "accountability" — editorial responsibility, corrections, governance, who answers when AI errs
- "general"        — newsroom AI ethics broadly, not fitting one principle above

Rate relevance STRICTLY (0–1). Reserve 0.8+ for substantive material an editor would act on:
named newsroom AI policies, original research/reports, concrete guidance/checklists, or
significant cases. Score generic opinion, press releases, vendor marketing, and unrelated
tech/AI news BELOW 0.4 and mark relevant:false.

Set item_type to reflect WHAT it is:
  "policy" (a published AI-use policy/guideline), "guide" (actionable how-to), "report" (research/study),
  "news" (an announcement/event), "tool" (a product/service), "article" (analysis).

Return ONLY a JSON array, one object per input item IN ORDER:
[{"i":0,"relevant":true,"topic":"transparency","item_type":"policy","summary":"<=240 chars, factual, lead with the concrete guidance/finding","relevance":0.0-1.0},
 {"i":1,"relevant":false}]`;

export async function triageEthicsPending({ limit = BATCH } = {}) {
  const { rows: items } = await pool.query(
    `SELECT id, title, content, url, author, published_at, source_id
       FROM content_raw_items
      WHERE domain = 'ethics' AND triage_status = 'pending'
      ORDER BY fetched_at ASC
      LIMIT $1`,
    [limit]
  );
  if (items.length === 0) return { triaged: 0, promoted: 0, rejected: 0 };

  const results = await classifyInChunks({
    system: SYSTEM,
    items,
    buildUserContent: (slice) => '# Items\n' + slice.map((it, i) =>
      `## ${i}\nTitle: ${it.title || '(none)'}\nText: ${(it.content || '').slice(0, 1200)}`
    ).join('\n\n'),
    perItemOutTokens: 180,
    temperature: TEMP,
    label: 'ethics-triage',
  });

  let promoted = 0, rejected = 0, triaged = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = results[i];
    if (!r) continue;   // chunk failed → leave pending, retry next run
    triaged++;
    const validTopic = TOPICS.includes(r.topic);
    if (r.relevant && validTopic) {
      const src = await pool.query('SELECT name FROM content_sources WHERE id = $1', [it.source_id]);
      const sourceName = src.rows[0]?.name || null;
      const ins = await pool.query(
        `INSERT INTO ethics_items
           (raw_item_id, topic, item_type, title, summary, url, source_name, author, published_at, relevance, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'review') RETURNING id`,
        [it.id, r.topic, (r.item_type || 'article').slice(0, 30), (it.title || 'Untitled').slice(0, 500),
         (r.summary || '').slice(0, 1000), it.url, sourceName, it.author, it.published_at,
         Number.isFinite(r.relevance) ? r.relevance : 0.5]
      );
      await pool.query(
        `UPDATE content_raw_items SET triage_status='promoted', triage_result=$1::jsonb, triaged_at=NOW(), promoted_id=$2 WHERE id=$3`,
        [JSON.stringify(r), ins.rows[0].id, it.id]
      );
      promoted++;
    } else {
      await pool.query(
        `UPDATE content_raw_items SET triage_status='rejected', triage_result=$1::jsonb, triaged_at=NOW() WHERE id=$2`,
        [JSON.stringify(r), it.id]
      );
      rejected++;
    }
  }
  return { triaged, promoted, rejected };
}
