// Newsletter email fallback (Component 6): email today's draft (or a loud
// failure notice) to NEWSLETTER_EMAIL_TO. Nothing here sends to subscribers —
// this is Paul's own copy so silence at 06:30 is impossible.
//
// Run manually:  npm run newsletter:email
// Run from cron:  05:45 SAST — `45 5 * * *` with CRON_TZ=Africa/Johannesburg.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendIssueEmail } from '../../newsletter/lib/email.js';
import pool from '../pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, '../../../logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });

const dateArg = (process.argv.slice(2).find((a) => a.startsWith('--date=')) || '').split('=')[1] || null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logStream = fs.createWriteStream(path.join(LOGS_DIR, `nl-email-${stamp}.log`), { flags: 'a' });
const log = (m = '') => { const line = `${new Date().toISOString()}  ${m}`; console.log(line); logStream.write(line + '\n'); };

async function main() {
  log(`newsletter-email: starting (date=${dateArg || 'today'})`);
  const r = await sendIssueEmail({ date: dateArg, log });
  log(`newsletter-email: done ok=${r.ok} status=${r.status} to=${r.to}`);
  if (!r.ok) process.exitCode = 1;
}

main()
  .catch((err) => { log(`FATAL: ${err.message}\n${err.stack}`); process.exitCode = 1; })
  .finally(async () => { try { await pool.end(); } catch {} logStream.end(); });
