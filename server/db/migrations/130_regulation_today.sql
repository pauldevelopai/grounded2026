-- 130_regulation_today.sql
-- Daily "Regulation" briefing — split out from the "AI Law" briefing so law and
-- regulation each get their own heading on the Be AI Ready home. Mirrors
-- governance_today_history; also schedules the regulation_today_digest job.
-- Additive + reversible.

CREATE TABLE IF NOT EXISTS regulation_today_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digest_date  DATE NOT NULL UNIQUE,
  summary      TEXT NOT NULL,
  headlines    JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_regulation_today_history_date ON regulation_today_history(digest_date DESC);

-- Schedule the regulation digest (05:30 daily — after the 05:00 AI-Law digest, and after
-- the weekly TechieRay harvest that refreshes ai_regulations). Idempotent.
INSERT INTO background_jobs (name, description, cron_expression, is_enabled)
SELECT 'regulation_today_digest',
       'Regenerate the "Regulation" digest (regulations only) from the curated tracker',
       '30 5 * * *', true
WHERE NOT EXISTS (SELECT 1 FROM background_jobs WHERE name = 'regulation_today_digest');

-- ROLLBACK:
--   DELETE FROM background_jobs WHERE name = 'regulation_today_digest';
--   DROP TABLE IF EXISTS regulation_today_history;
--   DELETE FROM app_settings WHERE key = 'regulation_today';
--   DELETE FROM migrations WHERE name='130_regulation_today.sql';
