-- 094_governance_today_job.sql
-- Register the "Today" AI-governance digest job: a web-search-backed conversational
-- summary written into app_settings (key 'governance_today'), shown atop the BE AI
-- READY tracker. Created DISABLED (is_enabled=false) → MANUAL-ONLY: it only runs when
-- triggered from the admin (BE AI READY → Data → "Refresh Today digest"), so there's
-- zero ambient API spend. A cron is kept on the row for if you choose to enable it.
INSERT INTO background_jobs (name, description, cron_expression, is_enabled)
VALUES ('governance_today_digest',
        'Regenerate the "Today in AI governance" digest (web-search-backed) for the tracker',
        '0 6 * * *', false)
ON CONFLICT (name) DO NOTHING;
