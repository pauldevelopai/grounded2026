// Newsroom Profile loader + prompt formatter. Shared enrichment read by every
// tool and agent so their output is grounded in this specific newsroom.
// Phase 2c: scoped to the ACTIVE newsroom (ambient tenancy — the route wraps
// the run in runWithNewsroom), so each tenant's agents ground in THEIR profile.
import pool from '../../db/pool.js';
import { currentNewsroomId } from '../../lib/tenancy.js';

export async function loadProfile() {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM newsroom_profile WHERE newsroom_id = $1 ORDER BY created_at LIMIT 1',
      [currentNewsroomId()]
    );
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
