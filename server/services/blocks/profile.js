// Newsroom Profile loader + prompt formatter. Shared enrichment read by every
// tool and agent so their output is grounded in this specific newsroom.
import pool from '../../db/pool.js';

export async function loadProfile() {
  try {
    const { rows } = await pool.query('SELECT * FROM newsroom_profile ORDER BY created_at LIMIT 1');
    return rows[0] || null;
  } catch { return null; }
}

export function formatProfileForPrompt(p) {
  if (!p) return '';
  const parts = [];
  if (p.about) parts.push(`About this newsroom: ${p.about}`);
  if (p.beats) parts.push(`Beats covered: ${p.beats}`);
  if (p.audience) parts.push(`Audience: ${p.audience}`);
  if (p.strengths) parts.push(`Strengths: ${p.strengths}`);
  if (p.style_notes) parts.push(`House style: ${p.style_notes}`);
  if (p.trusted_sources) parts.push(`Trusted sources: ${p.trusted_sources}`);
  return parts.join('\n');
}
