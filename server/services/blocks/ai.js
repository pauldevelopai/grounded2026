// Shared AI helper for tool + agent blocks: loads the Newsroom Profile, prepends
// it to the prompt (so every block is grounded in this newsroom), calls Claude,
// and parses the JSON response. One place = consistent enrichment everywhere.
import { callClaude } from '../claude.js';
import { loadProfile, formatProfileForPrompt } from './profile.js';

export function parseJson(raw) {
  const s = String(raw == null ? '' : raw);
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < 0) return { text: s.trim() };
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return { text: s.trim() }; }
}

export async function aiRun(system, userContent, maxTokens = 2000) {
  const profile = await loadProfile();
  const ctx = profile ? `## Newsroom profile (ground your answer in this)\n${formatProfileForPrompt(profile)}\n\n` : '';
  const raw = await callClaude({ system, userContent: ctx + userContent, maxTokens, temperature: 0.3 });
  return parseJson(raw);
}
