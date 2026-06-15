// import-toolkit-extras.mjs — backfill the richer AIKit tool fields onto the
// `tools` table (comments, time dividend, tags, alternatives). Idempotent: matches
// existing rows by slug and UPDATEs; never inserts/deletes. Safe to re-run.
//
//   node server/scripts/import-toolkit-extras.mjs            (default AIKit path)
//   TOOLKIT_DIR=/path/to/kit/tools node server/scripts/import-toolkit-extras.mjs
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import pool from '../db/pool.js';

const here = dirname(fileURLToPath(import.meta.url)); // server/scripts
const repoRoot = resolve(here, '../..');               // grounded2026
// Mirrors start.sh's AIKIT_DIR="$DIR/../../aikit_bundle/aikit_source".
const DIR = process.env.TOOLKIT_DIR
  || resolve(repoRoot, '../../aikit_bundle/aikit_source/kit/tools');

async function run() {
  let files;
  try { files = (await readdir(DIR)).filter((f) => f.endsWith('.json')); }
  catch (e) { console.error(`Cannot read toolkit dir ${DIR}: ${e.message}`); process.exit(1); }

  let updated = 0, missing = 0;
  for (const f of files) {
    const t = JSON.parse(await readFile(join(DIR, f), 'utf8'));
    if (!t.slug) continue;
    const cdi = t.cdi_scores || {};
    const xref = t.cross_references || {};
    const td = t.time_dividend || {};
    const { rowCount } = await pool.query(
      `UPDATE tools SET
         comments              = $2,
         time_saved            = $3,
         time_reinvestment     = $4,
         tags                  = $5,
         similar_tools         = $6,
         sovereign_alternative = $7,
         purpose               = COALESCE(NULLIF($8,''), purpose),
         description           = COALESCE(NULLIF($9,''), description),
         updated_at            = NOW()
       WHERE slug = $1`,
      [t.slug,
       t.comments || null,
       td.time_saved || null,
       td.reinvestment || null,
       JSON.stringify(Array.isArray(t.tags) ? t.tags : []),
       JSON.stringify(Array.isArray(xref.similar_tools) ? xref.similar_tools : []),
       xref.sovereign_alternative || null,
       t.purpose || '',
       t.description || '']
    );
    if (rowCount) updated += 1; else { missing += 1; console.warn(`  (no tools row for slug "${t.slug}")`); }
  }
  console.log(`Toolkit extras backfilled: ${updated} updated, ${missing} not found, from ${DIR}`);
  await pool.end();
}
run();
