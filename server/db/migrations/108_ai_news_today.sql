-- 108_ai_news_today.sql
-- The daily "Today in AI" news briefing (services/ai-news-today.js) — the sister of
-- the governance "Today" briefing (094/102). It synthesises the AI-news items already
-- ingested from Paul's newsletters (newsletter_items, fed by the newsletter_digest job
-- from Gmail) into a short ~100-word briefing for the BE AI READY home page. Cached in
-- app_settings (key 'ai_news_today'); one row per day kept here for history.
-- Additive + reversible.

CREATE TABLE IF NOT EXISTS ai_news_today_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digest_date  DATE NOT NULL UNIQUE,                 -- one briefing per calendar day (re-runs upsert)
  summary      TEXT NOT NULL,
  headlines    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{title,url}] cited sources
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_news_today_history_date ON ai_news_today_history(digest_date DESC);

-- Register + ENABLE the daily job. Runs at 06:00 (after the governance digest at 05:00):
-- the runner first pulls today's newsletters from Gmail (best-effort) then writes the
-- briefing, so the BE AI READY home stays current with no manual step.
INSERT INTO background_jobs (name, description, cron_expression, is_enabled)
VALUES ('ai_news_today_digest',
        'Pull today''s AI-news newsletters and regenerate the "Today in AI" briefing for the BE AI READY home',
        '0 6 * * *', true)
ON CONFLICT (name) DO NOTHING;

-- ROLLBACK:
--   DELETE FROM background_jobs WHERE name='ai_news_today_digest';
--   DROP TABLE IF EXISTS ai_news_today_history;
--   DELETE FROM migrations WHERE name='108_ai_news_today.sql';
