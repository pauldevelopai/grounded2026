// Seed ~20 RSS/Atom sources for the AI legal ingestion pipeline.
//
// Each source has been chosen for relevance to AI law/policy and RSS stability.
// After seeding, run the dispatcher once and check the admin UI (Phase C1g) for
// any that fail — disable those or adjust config.
//
// Safe to re-run: ON CONFLICT (kind, url) DO NOTHING.
//
// Run: node server/db/scripts/seed_legal_sources_rss.js

import pool from '../pool.js';

const SOURCES = [
  // ── US regulators / enforcement ─────────────────────────────────────────
  { name: 'FTC Press Releases',               kind: 'rss', url: 'https://www.ftc.gov/feeds/press-release.xml',                                jurisdiction: 'US Federal',   tags: ['regulator', 'enforcement', 'official'], frequency: 12 },
  { name: 'FTC Competition Press Releases',   kind: 'rss', url: 'https://www.ftc.gov/feeds/press-release-competition.xml',                    jurisdiction: 'US Federal',   tags: ['regulator', 'competition', 'official'], frequency: 12 },
  { name: 'FTC Consumer Protection Releases', kind: 'rss', url: 'https://www.ftc.gov/feeds/press-release-consumer-protection.xml',            jurisdiction: 'US Federal',   tags: ['regulator', 'consumer', 'official'],    frequency: 12 },

  // ── UK government (AI/data/justice departments) ─────────────────────────
  { name: 'UK DSIT (AI policy lead)',         kind: 'rss', url: 'https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology.atom', jurisdiction: 'UK', tags: ['regulator', 'official', 'ai-policy'], frequency: 12 },
  { name: 'UK Ministry of Justice',           kind: 'rss', url: 'https://www.gov.uk/government/organisations/ministry-of-justice.atom',       jurisdiction: 'UK',           tags: ['government', 'official'], frequency: 24 },

  // ── International AI / policy trackers ──────────────────────────────────
  { name: 'Stanford HAI News',                kind: 'rss', url: 'https://hai.stanford.edu/news/rss.xml',                                      jurisdiction: 'International', tags: ['academic', 'tracker', 'ai-policy'], frequency: 24 },
  { name: 'Algorithm Watch',                  kind: 'rss', url: 'https://algorithmwatch.org/en/feed/',                                        jurisdiction: 'International', tags: ['ngo', 'ai-accountability'],         frequency: 24 },
  { name: 'Electronic Frontier Foundation',   kind: 'rss', url: 'https://www.eff.org/rss/updates.xml',                                        jurisdiction: 'International', tags: ['ngo', 'digital-rights'],            frequency: 12 },
  { name: 'TechPolicy.Press',                 kind: 'rss', url: 'https://www.techpolicy.press/feed/',                                         jurisdiction: 'International', tags: ['news', 'ai-policy'],                frequency: 12 },

  // ── Legal / law news ────────────────────────────────────────────────────
  { name: 'JURIST News',                      kind: 'rss', url: 'https://www.jurist.org/news/feed/',                                          jurisdiction: 'International', tags: ['news', 'legal'],                    frequency: 12 },
  { name: 'Lawfare',                          kind: 'rss', url: 'https://www.lawfaremedia.org/rss.xml',                                       jurisdiction: 'International', tags: ['news', 'legal', 'national-security'], frequency: 12 },

  // ── Tech/AI news with strong policy coverage ────────────────────────────
  { name: 'Ars Technica — Tech Policy',       kind: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/tech-policy',                      jurisdiction: 'International', tags: ['news', 'tech-policy'],              frequency: 12 },
  { name: 'TechCrunch — AI',                  kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/',              jurisdiction: 'International', tags: ['news', 'ai'],                       frequency: 12 },
  { name: 'The Verge — Policy',               kind: 'rss', url: 'https://www.theverge.com/rss/policy/index.xml',                              jurisdiction: 'International', tags: ['news', 'policy'],                   frequency: 12 },
  { name: 'MIT Technology Review',            kind: 'rss', url: 'https://www.technologyreview.com/feed/',                                     jurisdiction: 'International', tags: ['news', 'ai'],                       frequency: 24 },

  // ── Specialist AI lawsuit tracker (original Tracker seed source) ──────────
  { name: 'ChatGPT Is Eating The World',      kind: 'rss', url: 'https://chatgptiseatingtheworld.com/feed/',                                  jurisdiction: 'International', tags: ['tracker', 'lawsuits', 'ai-copyright'], frequency: 24 },

  // ── EU / EC news channels ───────────────────────────────────────────────
  { name: 'Politico EU',                      kind: 'rss', url: 'https://www.politico.eu/feed/',                                              jurisdiction: 'EU',           tags: ['news', 'eu-policy'],                frequency: 12 },
  { name: 'EDPB News',                        kind: 'rss', url: 'https://www.edpb.europa.eu/news/news_en/rss.xml',                            jurisdiction: 'EU',           tags: ['regulator', 'official', 'data-protection'], frequency: 24 },

  // ── Reddit via its built-in RSS endpoints ───────────────────────────────
  // Reddit exposes every listing as .rss — no API key needed. Tagged as
  // social so we can treat signal differently during triage.
  { name: 'Reddit — r/law',                   kind: 'rss', url: 'https://www.reddit.com/r/law/.rss',                                          jurisdiction: 'International', tags: ['social', 'legal', 'reddit'],        frequency: 6 },
  { name: 'Reddit — r/artificial',            kind: 'rss', url: 'https://www.reddit.com/r/artificial/.rss',                                   jurisdiction: 'International', tags: ['social', 'ai', 'reddit'],           frequency: 12 },
  { name: 'Reddit — r/MachineLearning',       kind: 'rss', url: 'https://www.reddit.com/r/MachineLearning/.rss',                              jurisdiction: 'International', tags: ['social', 'ai', 'reddit'],           frequency: 12 },
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
        [s.name, s.kind, s.url, s.jurisdiction, s.tags, s.frequency || 12]
      );
      if (res.rowCount > 0) {
        inserted++;
        console.log(`  inserted: ${s.name}`);
      } else {
        skipped++;
        console.log(`  skipped (exists): ${s.name}`);
      }
    }
    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}, total input ${SOURCES.length}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
