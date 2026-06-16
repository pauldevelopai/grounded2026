-- 102_governance_today_history.sql
-- The daily "Today in AI governance" briefing (services/governance-today.js) was
-- built but left DISABLED and only cached its latest run in app_settings (no
-- history). Paul's ask: run it daily at 05:00, keep ~100 words, and store past
-- briefings so they can live under a third tab on the tracker.
--   1. A history table — one row per day (upsert by date), so old briefings persist.
--   2. Turn the job ON and move it to 05:00 (was disabled, 06:00).
-- Additive + reversible.

CREATE TABLE IF NOT EXISTS governance_today_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digest_date  DATE NOT NULL UNIQUE,            -- one briefing per calendar day (re-runs upsert)
  summary      TEXT NOT NULL,
  headlines    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{title,url}] cited sources
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_governance_today_history_date ON governance_today_history(digest_date DESC);

-- Enable the daily briefing and run it at 05:00 (NULL next_run_at → scheduler recomputes).
UPDATE background_jobs
   SET is_enabled = true, cron_expression = '0 5 * * *', next_run_at = NULL
 WHERE name = 'governance_today_digest';

-- ROLLBACK:
--   UPDATE background_jobs SET is_enabled=false, cron_expression='0 6 * * *' WHERE name='governance_today_digest';
--   DROP TABLE IF EXISTS governance_today_history;
--   DELETE FROM migrations WHERE name='102_governance_today_history.sql';
