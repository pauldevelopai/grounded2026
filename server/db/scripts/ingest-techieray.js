// One-off / manual harvest of TechieRay's Global AI Regulation Tracker into
// ai_regulations. Run on the box (needs internet + Chromium):
//   cd /home/ubuntu/tracker/server && node db/scripts/ingest-techieray.js
// New regulations land as auto_added + pending → review them in /admin/tracker.
import pool from '../pool.js';
import { harvestTechieray } from '../../services/legal-ingest/techieray.js';

try {
  console.log('Harvesting TechieRay Global AI Regulation Tracker…');
  const r = await harvestTechieray();
  console.log(`Done — ${r.considered} found · ${r.added} new (pending review) · ${r.updated} refreshed · ${r.skipped} already tracked.`);
} catch (err) {
  console.error('Harvest failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
