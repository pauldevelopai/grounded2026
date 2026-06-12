// visibility-scan.js — BE AI READY · Visibility (spec pillar 1).
// "How AI sees your business": ask an AI model standard probe questions about
// the business, capture the raw answer, then SCORE how the business showed up.
// v1 queries Claude (the key we have); the `model` arg + per-model rows mean
// ChatGPT/Gemini are a wiring change later, not a redesign.
import { randomUUID } from 'node:crypto';
import pool from '../db/pool.js';
import { callClaude } from './claude.js';

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

// Run a scan for a tenant. `business` = { name, sector, location, website }.
export async function runVisibilityScan(newsroomId, business) {
  const scanId = randomUUID();
  const model = 'claude';
  const questions = probeQuestions(business);
  const checks = [];
  for (const question of questions) {
    // 1) what the model actually says (no system steer — we want its honest take)
    const response = String(await callClaude({
      system: 'You are a general AI assistant answering a user. Answer naturally and honestly; if you do not know something, say so plainly rather than inventing details.',
      userContent: question, maxTokens: 500, temperature: 0.2,
    }));
    // 2) assess how the business showed up
    const assessment = await assess({ name: business.name, question, answer: response });
    const { rows } = await pool.query(
      `INSERT INTO visibility_checks (newsroom_id, scan_id, model, question, response, assessment)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id, question, response, assessment, ran_at`,
      [newsroomId, scanId, model, question, response, JSON.stringify(assessment)]
    );
    checks.push({ ...rows[0], model });
  }
  return { scan_id: scanId, model, ran_at: new Date().toISOString(), checks };
}
