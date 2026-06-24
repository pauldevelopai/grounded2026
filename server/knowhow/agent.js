// KnowHow agent — Part C, C.2 + C.3. The corpus becomes useful: a per-business
// agent that answers questions FROM the captured knowledge (with citations back to
// the person/document), and a coaching mode that answers a junior the way the
// seniors here would. Strictly grounded — if the corpus doesn't cover it, it says
// so plainly and never invents (the no-fake-data discipline). Reuses callClaude
// (server key); retrieval is the pluggable seam for vectors later.
import { callClaude } from '../services/claude.js';
import { retrieveCorpus, sourceLabel } from './retrieve.js';

const ANSWER_SYSTEM =
  'You are KnowHow — the institutional memory of {TENANT}. You answer ONLY from the captured knowledge ' +
  'below: the real, hard-won judgement of this business\'s own people. Rules: (1) Use only the numbered ' +
  'pieces provided — never outside or general knowledge. (2) Cite the pieces you draw on inline as [n]. ' +
  '(3) If the captured knowledge does not contain the answer, say so plainly — e.g. "The team hasn\'t ' +
  'captured anything on that yet" — and do not guess or fill the gap. (4) Be concrete, practical and in the ' +
  'team\'s own voice; no preamble, no restating the question.';

const COACH_SYSTEM =
  'You are KnowHow — coaching a junior colleague at {TENANT} using the captured knowledge below: the real ' +
  'judgement of the senior people here. Rules: (1) Walk them through it the way those seniors would — their ' +
  'rules of thumb, the specific mistakes to avoid, what "good" looks like — grounded ONLY in the numbered ' +
  'pieces. (2) Cite the pieces you draw on inline as [n]. (3) If the captured knowledge doesn\'t cover their ' +
  'question, say so plainly and suggest who to ask; do not invent. (4) Warm, direct, concrete — like a ' +
  'good senior taking five minutes to explain.';

// Pull the [n] citations the model actually used, mapped back to their sources.
function citationsUsed(answer, pieces) {
  const used = new Set();
  for (const m of (answer || '').matchAll(/\[(\d+)\]/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= pieces.length) used.add(n);
  }
  return [...used].sort((a, b) => a - b).map((n) => {
    const p = pieces[n - 1];
    return { n, source: sourceLabel(p), origin: p.origin, snippet: p.text.length > 220 ? p.text.slice(0, 217) + '…' : p.text };
  });
}

// Ask the corpus. mode: 'answer' (default) | 'coach'. tenant = { id, name }.
export async function askCorpus(tenant, { question, mode = 'answer', topicId = null } = {}) {
  const q = (question || '').trim();
  if (!q) throw new Error('question required');

  const pieces = await retrieveCorpus(tenant.id, { query: q, topicId, limit: 40 });
  if (!pieces.length) {
    return { answer: null, empty: true, citations: [], usedPieces: 0,
      message: 'No knowledge has been captured for this business yet — capture some answers first, then ask again.' };
  }

  const corpus = pieces.map((p, i) => `[${i + 1}] (${sourceLabel(p)}) ${p.text}`).join('\n\n');
  const system = (mode === 'coach' ? COACH_SYSTEM : ANSWER_SYSTEM).replace('{TENANT}', tenant.name || 'this business');
  const userContent = `Captured knowledge:\n\n${corpus}\n\n---\n${mode === 'coach' ? 'Junior\'s question' : 'Question'}: ${q}\n\nAnswer now, citing [n].`;

  const answer = await callClaude({ system, userContent, maxTokens: 900 });
  return {
    answer: (answer || '').trim(),
    empty: false,
    mode,
    citations: citationsUsed(answer, pieces),
    usedPieces: pieces.length,
  };
}
