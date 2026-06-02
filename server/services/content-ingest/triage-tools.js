// Open-source tools AI triage — reads pending content_raw_items (domain
// 'tools'), asks Claude whether each item is about a genuinely useful
// open-source tool / module / library a newsroom could adopt, and if so emits a
// compiled oss_tools row (status 'review'). Mirrors the monetisation triage.

import pool from '../../db/pool.js';
import { classifyInChunks } from '../claude.js';

const BATCH = 20;
const TEMP = 0.1;

const SYSTEM = `You are a precise triage agent building a directory of OPEN-SOURCE tools, modules and
libraries that newsrooms can actually use or download. For each item, decide whether it describes
a specific, real, open-source (or free) tool/library/project — not general tech news, not a paid
SaaS, not commentary.

If it IS such a tool, extract its details. Pick a category:
  "transcription"|"data"|"scraping"|"cms"|"security"|"ai"|"audio"|"visualisation"|"verification"|"mapping"|"other".

Rate relevance STRICTLY (0–1): 0.8+ only for tools clearly useful in journalism/newsroom work
(reporting, data, audio/video, publishing, verification, security). Score unrelated dev tools,
paid-only products, and non-tool articles BELOW 0.4 and mark relevant:false.

Return ONLY a JSON array, one object per input item IN ORDER:
[{"i":0,"relevant":true,"name":"Whisper","category":"transcription","description":"<=200 chars, what it does",
  "newsroom_use":"<=160 chars, how a newsroom would use it","language":"Python","license":"MIT","url":"https://...","relevance":0.0-1.0},
 {"i":1,"relevant":false}]
Use the item's own URL if no better repo URL is evident. Omit fields you can't determine.`;

export async function triageToolsPending({ limit = BATCH } = {}) {
  const { rows: items } = await pool.query(
    `SELECT id, title, content, url, source_id
       FROM content_raw_items
      WHERE domain = 'tools' AND triage_status = 'pending'
      ORDER BY fetched_at ASC
      LIMIT $1`,
    [limit]
  );
  if (items.length === 0) return { triaged: 0, promoted: 0, rejected: 0 };

  const results = await classifyInChunks({
    system: SYSTEM,
    items,
    buildUserContent: (slice) => '# Items\n' + slice.map((it, i) =>
      `## ${i}\nTitle: ${it.title || '(none)'}\nURL: ${it.url || ''}\nText: ${(it.content || '').slice(0, 1200)}`
    ).join('\n\n'),
    perItemOutTokens: 200,
    temperature: TEMP,
    label: 'tools-triage',
  });

  let promoted = 0, rejected = 0, triaged = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = results[i];
    if (!r) continue;   // chunk failed → leave pending, retry next run
    triaged++;
    if (r.relevant && r.name) {
      const ins = await pool.query(
        `INSERT INTO oss_tools
           (raw_item_id, name, category, description, newsroom_use, url, language, license, relevance, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'review') RETURNING id`,
        [it.id, String(r.name).slice(0, 300), (r.category || 'other').slice(0, 60),
         (r.description || '').slice(0, 1000), (r.newsroom_use || '').slice(0, 600),
         r.url || it.url, (r.language || '').slice(0, 60) || null, (r.license || '').slice(0, 60) || null,
         Number.isFinite(r.relevance) ? r.relevance : 0.5]
      );
      await pool.query(
        `UPDATE content_raw_items SET triage_status='promoted', triage_result=$1::jsonb, triaged_at=NOW(), promoted_id=$2 WHERE id=$3`,
        [JSON.stringify(r), ins.rows[0].id, it.id]
      );
      promoted++;
    } else {
      await pool.query(
        `UPDATE content_raw_items SET triage_status='rejected', triage_result=$1::jsonb, triaged_at=NOW() WHERE id=$2`,
        [JSON.stringify(r), it.id]
      );
      rejected++;
    }
  }
  return { triaged, promoted, rejected };
}
