// company-ai.js — the pooled company AI workspace (the reinforcing loop).
//
// A team member asks their company's AI. The answer is grounded in the company's
// OWN knowledge — its documents, its training, and the team's earlier answers — never
// invented, and never another company's private content (the retrieval is org-scoped).
// Every interaction is then captured back into the shared corpus, so the next ask is
// a little smarter. That feedback loop is the point: pooled tool use IS knowledge
// capture.
import pool from '../db/pool.js';
import { callClaude } from './claude.js';
import { generateEmbedding, toPgVector } from './embeddings.js';
import { getRelevantKnowledge } from './knowledge.js';
import { retrieveCompanyChunks } from './company-knowledge-index.js';

// Prior team interactions most relevant to this question — hybrid (vector when an
// embedding service is configured, else full-text). Scoped to the company; shared only.
async function priorInteractions(newsroomId, question, limit = 5) {
  let emb = null;
  try { emb = await generateEmbedding(question); } catch { emb = null; }
  if (emb) {
    const { rows } = await pool.query(
      `SELECT id, question, answer
         FROM bair_interactions
        WHERE newsroom_id = $2 AND is_shared = true AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3`, [toPgVector(emb), newsroomId, limit]).catch(() => ({ rows: [] }));
    if (rows.length) return rows;
  }
  const fts = await pool.query(
    `SELECT id, question, answer
       FROM bair_interactions
      WHERE newsroom_id = $1 AND is_shared = true
        AND to_tsvector('english', coalesce(question,'') || ' ' || coalesce(answer,'')) @@ plainto_tsquery('english', $2)
      ORDER BY created_at DESC
      LIMIT $3`, [newsroomId, question, limit]).catch(() => ({ rows: [] }));
  if (fts.rows.length) return fts.rows;
  // No lexical match and no embedding service — fall back to the team's most recent
  // asks so the pooled history is always part of the context (the loop stays live).
  const recent = await pool.query(
    `SELECT id, question, answer FROM bair_interactions
      WHERE newsroom_id = $1 AND is_shared = true
      ORDER BY created_at DESC LIMIT $2`, [newsroomId, Math.min(limit, 3)]).catch(() => ({ rows: [] }));
  return recent.rows;
}

// Everything the company AI may ground an answer in, plus a parallel list of the
// sources it actually drew on (for honest citation in the UI).
async function gatherCorpus({ newsroomId, organisationId, sectorId, question }) {
  const parts = [];
  const sources = [];

  // 1. The company's captured knowledge — the best-matching PASSAGES across ALL of the
  //    company's documents/website/notes (chunk + embedding retrieval), so a long PDF is
  //    searched end to end, not truncated to the first page of the newest few sources.
  const chunks = await retrieveCompanyChunks(newsroomId, question, { limit: 12 });
  const seenSrc = new Set();
  for (const c of chunks) {
    parts.push(`[Company ${c.kind}] ${c.title || ''}:\n${c.text}`);
    const key = c.title || c.kind;
    if (!seenSrc.has(key)) { seenSrc.add(key); sources.push({ type: 'document', title: c.title || c.kind }); }
  }

  // 2. The company's private knowledge entries + platform-global + anonymised patterns.
  //    org-scoped retrieval — never another company's private content.
  let kb = [];
  try { kb = await getRelevantKnowledge({ orgId: organisationId, sectorId, searchTerms: question, limit: 6 }); } catch { kb = []; }
  for (const k of kb) {
    parts.push(`[Knowledge: ${k.category}] ${k.title}:\n${(k.content || '').slice(0, 1200)}`);
    sources.push({ type: k.visibility === 'pattern' ? 'pattern' : 'knowledge', title: k.title });
  }

  // 3. The team's earlier answers (the loop) — most relevant first.
  const prior = await priorInteractions(newsroomId, question, 5);
  for (const p of prior) {
    parts.push(`[Earlier team Q&A] Q: ${p.question}\nA: ${(p.answer || '').slice(0, 900)}`);
    sources.push({ type: 'team_history', title: p.question.slice(0, 80) });
  }

  return { context: parts.join('\n\n').slice(0, 18000), sources };
}

// Ask the company's AI. Grounded, cited, captured. Returns { answer, sources, id }.
export async function askCompanyAI({ newsroomId, organisationId, sectorId, userId, question }) {
  const { context, sources } = await gatherCorpus({ newsroomId, organisationId, sectorId, question });

  const system =
    'You are the shared AI assistant for ONE small/medium business on the Be AI Ready platform. Answer the team ' +
    "member's question using ONLY the company's own knowledge provided below — their documents, their training, " +
    'and the team\'s earlier answers — plus any clearly-marked general guidance. Ground every claim in that ' +
    'material. If the answer is not covered by the provided knowledge, say so plainly and suggest what the team ' +
    'should capture or ask their Be AI Ready consultant — do NOT invent facts, figures, policies or specifics. ' +
    'Tone: plain, practical, for a non-technical team. Keep it tight (under ~180 words unless detail is needed).';
  const userContent = context
    ? `The company's knowledge:\n\n${context}\n\nTeam member's question: ${question}\n\nAnswer now, grounded only in the above.`
    : `There is no captured company knowledge yet.\n\nTeam member's question: ${question}\n\nSay honestly that the company hasn't captured knowledge on this yet, give only safe general guidance if any, and suggest what to capture. Do not invent company specifics.`;

  const answer = (await callClaude({ system, userContent, maxTokens: 700, temperature: 0.3 })).trim();

  // Dedupe sources by title for a clean citation list.
  const seen = new Set();
  const citedSources = sources.filter((s) => { const k = `${s.type}:${s.title}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);

  const { rows: [ins] } = await pool.query(
    `INSERT INTO bair_interactions (newsroom_id, user_id, question, answer, model, sources)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, question, answer, sources, is_pinned, created_at`,
    [newsroomId, userId || null, question, answer, 'claude', JSON.stringify(citedSources)]);

  // Embed in the background so the next ask can retrieve this one (best-effort).
  generateEmbedding(`${question}\n${answer}`.slice(0, 2000))
    .then((emb) => { if (emb) return pool.query('UPDATE bair_interactions SET embedding = $1 WHERE id = $2', [toPgVector(emb), ins.id]); })
    .catch(() => {});

  return { id: ins.id, answer, sources: citedSources, created_at: ins.created_at };
}
