// KnowHow question generation. Mirrors the SHAPE of Pulse's generate.js (server-
// side Opus, tolerant JSON parse) but reuses the tracker's proven callClaude
// (services/claude.js) instead of a second Anthropic client, and is pointed at the
// knowhow corpus instead of Airtable. Goal: extract the tacit, hard-won judgement
// inside a senior employee's head — the "how I actually decide" knowledge juniors
// get wrong — without re-asking what the corpus already holds.
import { callClaude } from '../services/claude.js';

const SYSTEM =
  'You are KnowHow, an institutional-knowledge capture assistant. You write a SMALL set of interview ' +
  'questions that extract the tacit, hard-won expertise inside an experienced employee\'s head: the ' +
  'judgement calls, rules of thumb, edge cases and "how I actually decide" knowledge that juniors get ' +
  'wrong and that no document captures. Ask concrete, specific questions ("walk me through how you decide ' +
  'X", "what would a junior get wrong here", "tell me about a time this went sideways") — never generic or ' +
  'leading ones. Do NOT ask what the corpus already covers. Output ONLY a JSON object, no preamble, no ' +
  'markdown fences: {"questions":[{"text":"…","kind":"open|scenario"}],"tip":"one short sentence to the ' +
  'person on why their knowledge matters"}. 3–5 questions.';

// Tolerant JSON parse — strips ``` fences and grabs the outermost {...} if the
// model wrapped the object in prose despite instructions. (From pulse/generate.js.)
function parseJson(text) {
  let t = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) return JSON.parse(t.slice(start, end + 1));
  throw new Error(`KnowHow: could not parse model JSON. Got: ${(text || '').slice(0, 200)}`);
}

// vars: { tenantName, topicLabel, topicDescription, personName, personRole,
//         personSeniority, existingCorpus: [text, …] }
export async function generateCaptureQuestions(vars) {
  const already = (vars.existingCorpus || []).slice(0, 12).map((t, i) => `${i + 1}. ${String(t).replace(/\s+/g, ' ').slice(0, 200)}`).join('\n') || '(nothing captured yet)';
  const userContent =
    `Business: ${vars.tenantName || 'a business'}\n` +
    `Topic: ${vars.topicLabel}${vars.topicDescription ? ` — ${vars.topicDescription}` : ''}\n` +
    `Person: ${vars.personName || 'an employee'}${vars.personRole ? `, ${vars.personRole}` : ''}` +
    `${vars.personSeniority ? ` (${vars.personSeniority})` : ''}\n\n` +
    `Already captured for this topic (do NOT re-ask these):\n${already}\n\n` +
    `Write the capture questions now as the specified JSON.`;
  const text = await callClaude({ system: SYSTEM, userContent, maxTokens: 1500 });
  const out = parseJson(text);
  // Normalise: guarantee an array of {text, kind}.
  const questions = (Array.isArray(out.questions) ? out.questions : [])
    .map((q) => (typeof q === 'string' ? { text: q, kind: 'open' } : { text: q.text || '', kind: q.kind === 'scenario' ? 'scenario' : 'open' }))
    .filter((q) => q.text.trim());
  return { questions, tip: out.tip || '' };
}
