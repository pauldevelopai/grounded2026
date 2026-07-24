// Newsletter synthesis: build today's draft issue (Component 2 + 3).
// Nothing sends here — this only produces the draft for the review desk.
//
// Run manually:  npm run newsletter:synthesis         (today, with image)
//                npm run newsletter:synthesis -- --no-image --date=2026-07-24
// Run from cron:  05:15 SAST — `15 5 * * *` with CRON_TZ=Africa/Johannesburg.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSynthesis } from '../../newsletter/lib/pipeline.js';
import pool from '../pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, '../../../logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });

const argv = process.argv.slice(2);
const dateArg = (argv.find((a) => a.startsWith('--date=')) || '').split('=')[1] || null;
const skipImage = argv.includes('--no-image');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logStream = fs.createWriteStream(path.join(LOGS_DIR, `nl-synthesis-${stamp}.log`), { flags: 'a' });
const log = (m = '') => { const line = `${new Date().toISOString()}  ${m}`; console.log(line); logStream.write(line + '\n'); };

async function main() {
  log(`newsletter-synthesis: starting (date=${dateArg || 'today'}, image=${!skipImage})`);
  const r = await runSynthesis({ date: dateArg, skipImage, log });
  log(`newsletter-synthesis: done status=${r.status}${r.error ? ` error=${r.error}` : ''}`);
  if (r.status === 'failed') process.exitCode = 1;
}

main()
  .catch((err) => { log(`FATAL: ${err.message}\n${err.stack}`); process.exitCode = 1; })
  .finally(async () => { try { await pool.end(); } catch {} logStream.end(); });
