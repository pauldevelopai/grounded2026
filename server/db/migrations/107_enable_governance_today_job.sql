-- 107_enable_governance_today_job.sql
-- Turn ON the daily "Today in AI governance" digest.
--
-- It was created DISABLED (manual-only) in migration 094 to avoid ambient API spend,
-- so it never auto-refreshed — the briefing froze at the last manual run (June 12).
-- Paul (2026-06-23): it should update daily. Enabling it makes startScheduler load it
-- (it only loads `is_enabled = true` rows) and run it on its cron ('0 6 * * *',
-- Europe/London). The server restart in deploy.sh reloads the scheduler and picks it
-- up; trigger one run now from BE AI READY → Data → "Refresh Today digest" to get a
-- current briefing immediately rather than waiting for the next 06:00.
UPDATE background_jobs
   SET is_enabled = true, updated_at = NOW()
 WHERE name = 'governance_today_digest';
