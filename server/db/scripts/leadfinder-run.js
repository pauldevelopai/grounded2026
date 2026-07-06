// LeadFinder — single-run CLI (build brief Phase 1 DoD).
// Runs the extract -> score -> route pipeline once, for the L2B tenant, over the
// public sample tender plus any real docs dropped in server/fixtures/real/*.txt,
// and prints the green/amber/red result so Paul can eyeball whether the bands
// land right. No scheduler here — that's Phase 4.
//
// Run:  cd server && node db/scripts/leadfinder-run.js
//       (needs ANTHROPIC_API_KEY + the DB; migration 131 applied.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../pool.js';
import { runPipeline, ensureSource } from '../../services/leadfinder/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../fixtures');
const TENANT_SLUG = process.env.LEADFINDER_TENANT || 'l2b';

function gatherItems() {
  const items = [];
  const sample = path.join(FIXTURES, 'public', 'sample-tender.txt');
  if (fs.existsSync(sample)) items.push({ text: fs.readFileSync(sample, 'utf8'), externalId: 'sample-tender', url: sample });
  const realDir = path.join(FIXTURES, 'real');
  if (fs.existsSync(realDir)) {
    for (const f of fs.readdirSync(realDir).filter((n) => /\.(txt|md)$/i.test(n))) {
      items.push({ text: fs.readFileSync(path.join(realDir, f), 'utf8'), externalId: `real:${f}`, url: path.join(realDir, f) });
    }
  }
  return items;
}

async function main() {
  const { rows: [nr] } = await pool.query('SELECT id FROM newsrooms WHERE slug = $1', [TENANT_SLUG]);
  if (!nr) throw new Error(`Tenant '${TENANT_SLUG}' not found (expected the L2B newsroom from migration 082).`);
  const newsroomId = nr.id;

  const items = gatherItems();
  if (!items.length) throw new Error(`No fixtures found under ${FIXTURES}. Expected public/sample-tender.txt.`);
  console.log(`LeadFinder run — tenant '${TENANT_SLUG}', ${items.length} document(s).\n`);

  const sourceId = await ensureSource(newsroomId, { name: 'CLI / manual samples', kind: 'upload', origin: 'seed' });
  const out = await runPipeline({ newsroomId, sourceId, items });

  const d = out.digest;
  console.log(`Criteria version: v${out.criteria_version}`);
  console.log(`Digest — seen ${d.seen} · new ${d.new} · GREEN ${d.green} · AMBER ${d.amber} · RED ${d.red}` +
              (d.duplicate ? ` · dup ${d.duplicate}` : '') + (d.error ? ` · error ${d.error}` : ''));
  console.log('');
  for (const t of out.tenders) {
    if (t.error) { console.log(`  ! ERROR (${t.item}): ${t.error}`); continue; }
    console.log(`  [${t.band.toUpperCase()}] ${(t.reference_no || '—')}  score=${t.total}  flags=${t.flags}`);
    console.log(`      ${t.title || '(no title extracted)'}`);
    console.log(`      → ${t.routing_reason}`);
  }
  console.log(`\nRun ${out.run_id} logged. Re-running is idempotent (same docs dedupe on external_id).`);
}

main()
  .catch((err) => { console.error(`FATAL: ${err.message}\n${err.stack}`); process.exitCode = 1; })
  .finally(async () => { try { await pool.end(); } catch {} });
