// company-coach.js — the new-staff coach (Tier-2 payoff).
//
// Built on the workspace-AI foundation but pointed at onboarding: a hire asks, and the
// answer is grounded ONLY in COMPANY-tier knowledge — promoted Q&A/responses (tier
// 'company' corpus), the company's durable knowledge sources, and company-tier workflows
// it can walk through step by step. It NEVER reads anyone's private Tier-1 rows, so one
// person's individual base can't leak to another through the coach. When company knowledge
// is silent, it says so honestly rather than inventing onboarding facts.
import pool from '../db/pool.js';
import { callClaude } from './claude.js';
import { retrieveCompanyChunks } from './company-knowledge-index.js';
import { knowhowTenantIdForNewsroom } from '../knowhow/identity.js';

// Everything the coach may ground in — company tier ONLY — plus the sources it drew on.
async function gatherCompanyKnowledge({ newsroomId, question }) {
  const parts = [];
  const sources = [];

  // 1. Durable company knowledge sources — best-matching PASSAGES across all of them
  //    (chunk + embedding retrieval), incl. anything promoted via Gate 1. In memory only.
  const chunks = await retrieveCompanyChunks(newsroomId, question, { limit: 12 });
  const seenSrc = new Set();
  for (const c of chunks) {
    parts.push(`[Company ${c.kind}] ${c.title || ''}:\n${c.text}`);
    const key = c.title || c.kind;
    if (!seenSrc.has(key)) { seenSrc.add(key); sources.push({ type: 'company_knowledge', title: c.title || c.kind }); }
  }

  const tenantId = await knowhowTenantIdForNewsroom(pool, newsroomId);
  if (tenantId) {
    // 2. Promoted, company-tier KnowHow corpus (never tier='individual').
    const { rows: corpus } = await pool.query(
      `SELECT text FROM knowhow.corpus_items
        WHERE tenant_id = $1 AND tier = 'company' ORDER BY created_at DESC LIMIT 20`, [tenantId]).catch(() => ({ rows: [] }));
    for (const c of corpus) {
      parts.push(`[Company knowledge] ${c.text.slice(0, 1200)}`);
      sources.push({ type: 'knowhow', title: c.text.replace(/\s+/g, ' ').slice(0, 60) });
    }
    // 3. Company-tier workflows — kept as ordered steps so the coach can walk a hire through them.
    const { rows: wfs } = await pool.query(
      `SELECT title, steps FROM knowhow.workflows
        WHERE tenant_id = $1 AND tier = 'company' ORDER BY created_at DESC LIMIT 20`, [tenantId]).catch(() => ({ rows: [] }));
    for (const w of wfs) {
      const steps = Array.isArray(w.steps) ? w.steps : [];
      const body = steps.map((s, i) => `${i + 1}. ${s.step || ''}${s.detail ? ` — ${s.detail}` : ''}`).join('\n');
      parts.push(`[Workflow] ${w.title}:\n${body}`);
      sources.push({ type: 'workflow', title: w.title });
    }
  }

  return { context: parts.join('\n\n').slice(0, 18000), sources };
}

export async function askCompanyCoach({ newsroomId, question }) {
  const { context, sources } = await gatherCompanyKnowledge({ newsroomId, question });

  const system =
    'You are the onboarding coach for a NEW member of staff at ONE small/medium business on the Be AI Ready ' +
    "platform. Answer the new hire's question using ONLY the company knowledge provided below — the company's " +
    'documents, its promoted know-how, and its workflows. Ground every claim in that material. If a workflow is ' +
    "relevant, walk them through it step by step, in order. If the answer isn't covered by the provided company " +
    'knowledge, say so plainly and point them to their manager or Be AI Ready consultant — do NOT invent ' +
    'procedures, names, figures or policies. Tone: warm, plain, practical — you are helping someone find their feet.';
  const userContent = context
    ? `The company's knowledge:\n\n${context}\n\nNew hire's question: ${question}\n\nAnswer now, grounded only in the above.`
    : `There is no company-tier knowledge captured yet.\n\nNew hire's question: ${question}\n\nSay honestly that the company hasn't shared knowledge on this yet, and point them to their manager or Be AI Ready consultant. Do not invent company specifics.`;

  const answer = (await callClaude({ system, userContent, maxTokens: 800, temperature: 0.3 })).trim();
  const seen = new Set();
  const cited = sources.filter((s) => { const k = `${s.type}:${s.title}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  return { answer, sources: cited, grounded: !!context };
}
