// Per-tool reference library loader + prompt formatter.
import pool from '../../db/pool.js';

export async function loadReferences(toolSlug) {
  try {
    const { rows } = await pool.query('SELECT name, content FROM reference_items WHERE tool = $1 ORDER BY name LIMIT 50', [toolSlug]);
    return rows;
  } catch { return []; }
}

export function formatReferences(rows, label = 'Reference library') {
  if (!rows || !rows.length) return '';
  return `## ${label}\n` + rows.map((r) => `- ${r.name}: ${r.content || ''}`).join('\n');
}
