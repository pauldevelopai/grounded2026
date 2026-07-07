// LeadFinder — nightly run (build brief Phase 4). Wraps the Phase-1 engine on
// the same cron pattern as triage-nightly.js. For every business tenant with at
// least one active, approved source, it fetches new items from those sources and
// runs them through extract -> score -> route, logging a run per tenant that
// feeds each tenant's morning digest.
//
// Run manually:  cd server && node db/scripts/leadfinder-nightly.js
// Run from cron (box), e.g. 03:00 daily:  0 3 * * *  cd /home/ubuntu/tracker && npm run leadfinder:nightly
//
// Note: portal fetch adapters (html/puppeteer/rss) are wired per real source as
// tenants add them (services/leadfinder/fetch.js). Until a tenant configures a
// portal, its scheduled run simply finds nothing new — uploads are ingested at
// upload time via the surface, not here.

import pool from '../pool.js';
import { runPipeline } from '../../services/leadfinder/pipeline.js';
import { fetchSource } from '../../services/leadfinder/fetch.js';

function log(msg = '') { console.log(`${new Date().toISOString()}  ${msg}`); }

async function main() {
  // Tenants that have something to pull.
  const { rows: tenants } = await pool.query(
    `SELECT DISTINCT n.id, n.name
       FROM newsrooms n
       JOIN leadfinder.sources s ON s.newsroom_id = n.id
      WHERE n.kind = 'business' AND s.active = true AND s.approved = true`);

  log(`leadfinder-nightly: ${tenants.length} tenant(s) with active sources.`);

  for (const t of tenants) {
    try {
      const { rows: sources } = await pool.query(
        `SELECT * FROM leadfinder.sources WHERE newsroom_id = $1 AND active = true AND approved = true`, [t.id]);
      const items = [];
      for (const s of sources) {
        const { items: got, note } = await fetchSource(s);
        if (note) log(`  ${t.name} / ${s.name}: ${note}`);
        items.push(...got.map((g) => ({ ...g, sourceId: s.id })));  // attach each item to its source
        await pool.query('UPDATE leadfinder.sources SET last_run_at = NOW() WHERE id = $1', [s.id]);
      }
      if (!items.length) { log(`  ${t.name}: no new items.`); continue; }
      const out = await runPipeline({ newsroomId: t.id, sourceId: null, items });
      const d = out.digest;
      log(`  ${t.name}: ${d.new} new — green ${d.green}, amber ${d.amber}, red ${d.red}.`);
    } catch (err) {
      log(`  ${t.name}: ERROR ${err.message}`);
    }
  }
  log('leadfinder-nightly: done.');
}

main()
  .catch((err) => { log(`FATAL: ${err.message}\n${err.stack}`); process.exitCode = 1; })
  .finally(async () => { try { await pool.end(); } catch {} });
