// Seed cyber-security RSS sources for the daily newsletter's Cyber pillar.
//
// The existing ai_legal_sources are governance/legal only, so the newsletter's
// Cyber Security section (breaches, cyberattacks, AI-enabled scams, deepfake
// fraud) had no feed. These fill that gap. They flow through the SAME scrape ->
// ai_legal_raw_items -> newsletter-classify pipeline as every other source; the
// classifier decides which are in scope, so a broad security feed is fine.
//
// Safe to re-run: ON CONFLICT (kind, url) DO NOTHING.
// After seeding, run `npm run scrape` then check /legal-sources for any feed
// that errors and disable it there (URLs rot; that's expected).
//
// Run: node server/db/scripts/seed_cyber_sources.js

import pool from '../pool.js';

const SOURCES = [
  // ── General cyber-security / breach reporting ───────────────────────────
  { name: 'BleepingComputer',        kind: 'rss', url: 'https://www.bleepingcomputer.com/feed/',        jurisdiction: 'International', tags: ['news', 'cyber', 'breach'],            frequency: 8  },
  { name: 'The Record (Recorded Future)', kind: 'rss', url: 'https://therecord.media/feed/',            jurisdiction: 'International', tags: ['news', 'cyber', 'breach'],            frequency: 8  },
  { name: 'Krebs on Security',       kind: 'rss', url: 'https://krebsonsecurity.com/feed/',             jurisdiction: 'International', tags: ['news', 'cyber', 'fraud'],             frequency: 24 },
  { name: 'The Hacker News',         kind: 'rss', url: 'https://feeds.feedburner.com/TheHackersNews',   jurisdiction: 'International', tags: ['news', 'cyber', 'cyberattack'],       frequency: 8  },
  { name: 'Dark Reading',            kind: 'rss', url: 'https://www.darkreading.com/rss.xml',           jurisdiction: 'International', tags: ['news', 'cyber'],                      frequency: 12 },
  { name: 'SecurityWeek',            kind: 'rss', url: 'https://www.securityweek.com/feed/',            jurisdiction: 'International', tags: ['news', 'cyber'],                      frequency: 12 },

  // ── AI-enabled scams / deepfake fraud focus ─────────────────────────────
  { name: 'Graham Cluley',           kind: 'rss', url: 'https://grahamcluley.com/feed/',                jurisdiction: 'International', tags: ['news', 'cyber', 'scam', 'deepfake'],  frequency: 24 },

  // ── Official cyber agencies ─────────────────────────────────────────────
  { name: 'CISA Cybersecurity Advisories', kind: 'rss', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', jurisdiction: 'US Federal', tags: ['official', 'cyber', 'advisory'], frequency: 12 },
  { name: 'ENISA News',              kind: 'rss', url: 'https://www.enisa.europa.eu/media/news-items/news-wires/RSS', jurisdiction: 'EU',   tags: ['official', 'cyber'],                  frequency: 24 },

  // ── African lens ────────────────────────────────────────────────────────
  { name: 'ITWeb Security (South Africa)', kind: 'rss', url: 'https://www.itweb.co.za/rss/security.xml', jurisdiction: 'South Africa', tags: ['news', 'cyber', 'africa'],           frequency: 12 },
];

async function run() {
  const client = await pool.connect();
  let inserted = 0, skipped = 0;
  try {
    for (const s of SOURCES) {
      const res = await client.query(
        `INSERT INTO ai_legal_sources (name, kind, url, jurisdiction, tags, run_frequency_hours, config)
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)
         ON CONFLICT (kind, url) DO NOTHING
         RETURNING id`,
        [s.name, s.kind, s.url, s.jurisdiction, s.tags, s.frequency || 12],
      );
      if (res.rowCount > 0) { inserted++; console.log(`  inserted: ${s.name}`); }
      else { skipped++; console.log(`  skipped (exists): ${s.name}`); }
    }
    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}, total input ${SOURCES.length}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
