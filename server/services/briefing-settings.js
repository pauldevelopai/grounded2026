// briefing-settings.js — editable, admin-owned settings for the two home-page
// briefings, so Paul has oversight over WHERE each one draws from and can tune it
// without a deploy. Stored in app_settings (key 'briefing_settings'); merged over
// defaults so a missing/partial row is always safe. Read by the generators, edited
// from the BAIR admin Briefings page.
import pool from '../db/pool.js';

const KEY = 'briefing_settings';

export const DEFAULTS = {
  ai_news: {
    // 'websearch' (default 2026-07-07): a live, domain-restricted web search — no Gmail
    // dependency. 'auto' = your newsletters, web search only if none ingested. 'newsletters'.
    source: 'websearch',
    days: 4,          // how many days of ingested newsletters to draw on (only for newsletter modes)
    web_focus: 'major AI model and product releases, big company moves, funding, notable launches, and real-world adoption',
  },
  ai_law: {
    item_count: 10,   // how many of the most-recently-updated tracker items to brief from
  },
};

export async function getBriefingSettings() {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [KEY]).catch(() => ({ rows: [] }));
  const v = rows[0]?.value || {};
  return {
    ai_news: { ...DEFAULTS.ai_news, ...(v.ai_news || {}) },
    ai_law: { ...DEFAULTS.ai_law, ...(v.ai_law || {}) },
  };
}

export async function setBriefingSettings(patch = {}) {
  const cur = await getBriefingSettings();
  const news = { ...cur.ai_news, ...(patch.ai_news || {}) };
  // Clamp / sanitise the editable fields.
  news.source = ['auto', 'newsletters', 'websearch'].includes(news.source) ? news.source : 'auto';
  news.days = Math.min(Math.max(parseInt(news.days, 10) || 4, 1), 14);
  news.web_focus = String(news.web_focus || DEFAULTS.ai_news.web_focus).slice(0, 600);
  const law = { ...cur.ai_law, ...(patch.ai_law || {}) };
  law.item_count = Math.min(Math.max(parseInt(law.item_count, 10) || 10, 3), 20);

  const next = { ai_news: news, ai_law: law };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(next)]
  );
  return next;
}
