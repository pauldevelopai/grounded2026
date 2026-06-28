// briefings.js — admin controls for the two "Today" briefings shown on the BE AI
// READY home: AI News (from the newsletters) and AI Law (governance). Lets an admin
// edit a briefing's text by hand or regenerate it. Mounted admin-only under /api.
//   PUT  /briefings/:which          — save an edited summary (which = ai-news | governance)
//   POST /briefings/:which/refresh  — regenerate now (uses AI credit; ai-news also pulls Gmail first)
import { Router } from 'express';
import pool from '../db/pool.js';
import { generateGovernanceToday } from '../services/governance-today.js';
import { runAINewsTodayDigest } from '../services/background-jobs.js';
import { getBriefingSettings, setBriefingSettings } from '../services/briefing-settings.js';

const router = Router();

// which → { app_settings key, history table }. Table names are hardcoded here
// (never user input), so interpolating them into SQL below is safe.
const CONF = {
  'ai-news':    { key: 'ai_news_today',    history: 'ai_news_today_history' },
  'governance': { key: 'governance_today', history: 'governance_today_history' },
};

// Save an edited briefing summary. Keeps the existing headlines + generated_at and
// mirrors the edit into today's history row so the archive stays in sync.
router.put('/:which', async (req, res) => {
  const conf = CONF[req.params.which];
  if (!conf) return res.status(404).json({ message: 'Unknown briefing' });
  const summary = (req.body?.summary || '').trim();
  if (!summary) return res.status(400).json({ message: 'summary required' });
  try {
    const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [conf.key]);
    const value = rows[0]?.value || { headlines: [], generated_at: new Date().toISOString() };
    value.summary = summary;
    value.edited_at = new Date().toISOString();
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [conf.key, JSON.stringify(value)]
    );
    const day = (value.generated_at || new Date().toISOString()).slice(0, 10);
    await pool.query(
      `INSERT INTO ${conf.history} (digest_date, summary, headlines, generated_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (digest_date) DO UPDATE SET summary = EXCLUDED.summary`,
      [day, summary, JSON.stringify(value.headlines || []), value.generated_at || new Date().toISOString()]
    ).catch((e) => console.error('[briefings:put:history]', e.message));
    res.json(value);
  } catch (err) {
    console.error('[briefings:put]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Regenerate a briefing now. AI News runs the full job (pull today's newsletters,
// then synthesise); governance runs the web-search-backed generator.
router.post('/:which/refresh', async (req, res) => {
  const which = req.params.which;
  if (!CONF[which]) return res.status(404).json({ message: 'Unknown briefing' });
  try {
    if (which === 'ai-news') {
      await runAINewsTodayDigest();
      const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'ai_news_today'");
      return res.json(rows[0]?.value || { summary: null, message: 'No recent newsletter items — briefing is empty.' });
    }
    const v = await generateGovernanceToday();
    res.json(v || { summary: null, message: 'Nothing generated.' });
  } catch (err) {
    console.error('[briefings:refresh]', err);
    res.status(500).json({ message: err.message || 'Refresh failed' });
  }
});

// Source oversight: read + edit where each briefing draws from and its parameters.
router.get('/settings', async (req, res) => {
  try { res.json(await getBriefingSettings()); }
  catch (err) { console.error('[briefings:settings:get]', err); res.status(500).json({ message: 'Internal server error' }); }
});

router.put('/settings', async (req, res) => {
  try { res.json(await setBriefingSettings(req.body || {})); }
  catch (err) { console.error('[briefings:settings:put]', err); res.status(500).json({ message: 'Internal server error' }); }
});

export default router;
