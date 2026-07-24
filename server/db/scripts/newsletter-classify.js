// Newsletter classifier: tag every not-yet-classified raw item with the
// 8-category newsletter scheme (Component 1). Meant to run as a post-step
// after the scrape.
//
// Run manually:  npm run newsletter:classify
// Run from cron: right after scrape-only, e.g. `10 2 * * *` on the box
//                (SAST via CRON_TZ=Africa/Johannesburg; see docs/NEWSLETTER.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyNewsletterItems } from '../../newsletter/classify.js';
import pool from '../pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, '../../../logs');
fs.mkdirSync(LOGS_DIR, { recursive: true });

const LIMIT = parseInt(process.env.NEWSLETTER_CLASSIFY_LIMIT || '300', 10);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logStream = fs.createWriteStream(path.join(LOGS_DIR, `nl-classify-${stamp}.log`), { flags: 'a' });
const log = (m = '') => { const line = `${new Date().toISOString()}  ${m}`; console.log(line); logStream.write(line + '\n'); };

async function main() {
  log(`newsletter-classify: starting (limit=${LIMIT})`);
  const r = await classifyNewsletterItems({ limit: LIMIT, log });
  log(`newsletter-classify: done seen=${r.seen} classified=${r.classified} in_scope=${r.inScope} errors=${r.errors}`);
}

main()
  .catch((err) => { log(`FATAL: ${err.message}\n${err.stack}`); process.exitCode = 1; })
  .finally(async () => { try { await pool.end(); } catch {} logStream.end(); });
