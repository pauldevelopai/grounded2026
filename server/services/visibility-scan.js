// visibility-scan.js — BE AI READY · Visibility (spec pillar 1).
// "How AI sees your business": ask an AI model standard probe questions about
// the business, capture the raw answer, then SCORE how the business showed up.
// v1 queries Claude (the key we have); the `model` arg + per-model rows mean
// ChatGPT/Gemini are a wiring change later, not a redesign.
import { randomUUID } from 'node:crypto';
import pool from '../db/pool.js';
import { callClaude } from './claude.js';
import { askModel, providerStatus, getModelConfig, PROVIDERS } from '../lib/models.js';

// The standard probe set — what a real customer would ask an assistant.
function probeQuestions({ name, sector, location, website }) {
  const where = location || 'South Africa';
  return [
    `What do you know about the company "${name}"${website ? ` (${website})` : ''}? Be specific about what they do, and say plainly if you don't know them.`,
    `I'm looking for ${sector || 'a provider in their field'} in ${where}. Who are the leading options I should consider? List them with a one-line reason each.`,
    `Why might a customer choose "${name}" over competitors for ${sector || 'their services'}? If you can't tell, say so.`,
  ];
}

// Score how the business showed up in one answer (structured JSON).
async function assess({ name, question, answer }) {
  const system = `You assess how a business appears in an AI assistant's answer — for the business's own visibility audit. Be honest and strict; do not flatter. Return ONLY a single-line JSON object:
{"present": true|false,  // was "${name}" actually named/described in the answer?
 "sentiment": "positive"|"neutral"|"negative"|"absent",
 "accuracy": "accurate"|"partly_accurate"|"inaccurate"|"unknown",
 "summary": "one short sentence on how they showed up",
 "missing": "one short sentence on what's wrong or absent that matters"}`;
  const raw = String(await callClaude({
    system,
    userContent: `Business: ${name}\n\nThe question asked of the AI:\n${question}\n\nThe AI's answer:\n${answer}`,
    maxTokens: 300, temperature: 0,
  }));
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  try { return JSON.parse(raw.slice(a, b + 1)); }
  catch { return { present: null, sentiment: 'unknown', accuracy: 'unknown', summary: raw.slice(0, 160), missing: '' }; }
}

const ANSWER_SYSTEM = 'You are a general AI assistant answering a user. Answer naturally and honestly; if you do not know something, say so plainly rather than inventing details.';

// Which assistants to query: the admin's configured visibility_models, filtered
// to those actually configured (key present). Always at least Anthropic.
async function scanProviders() {
  const cfg = await getModelConfig();
  const status = await providerStatus();
  const ok = new Set(status.filter((p) => p.configured).map((p) => p.id));
  const want = (cfg.visibility_models || ['anthropic']).filter((p) => ok.has(p));
  return want.length ? want : ['anthropic'];
}

// Run a scan for a tenant across every configured assistant.
// `business` = { name, sector, location, website }.
export async function runVisibilityScan(newsroomId, business) {
  const scanId = randomUUID();
  const providers = await scanProviders();
  const questions = probeQuestions(business);
  const checks = [];
  for (const provider of providers) {
    const label = provider === 'anthropic' ? 'claude' : provider; // store a friendly name
    for (const question of questions) {
      let response;
      try {
        response = String(await askModel({ provider, system: ANSWER_SYSTEM, prompt: question, maxTokens: 500, temperature: 0.2 }));
      } catch (e) {
        response = `(could not query ${PROVIDERS[provider]?.label || provider}: ${e.message})`;
      }
      const assessment = await assess({ name: business.name, question, answer: response });
      const { rows } = await pool.query(
        `INSERT INTO visibility_checks (newsroom_id, scan_id, model, question, response, assessment)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id, question, response, assessment, ran_at`,
        [newsroomId, scanId, label, question, response, JSON.stringify(assessment)]
      );
      checks.push({ ...rows[0], model: label });
    }
  }
  return { scan_id: scanId, model: checks[0]?.model || 'claude', ran_at: new Date().toISOString(), checks };
}
