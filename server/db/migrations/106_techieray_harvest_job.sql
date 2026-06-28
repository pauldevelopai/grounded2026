-- 106_techieray_harvest_job.sql
-- Register the weekly TechieRay Global AI Regulation Tracker harvest on the
-- background-jobs scheduler (Mondays 04:30). The job (JOB_REGISTRY: techieray_harvest)
-- is idempotent — it updates existing harvested rows and skips curated ones, so a
-- weekly re-scan keeps the tracker current without creating duplicates. Reversible.
INSERT INTO background_jobs (name, description, cron_expression, is_enabled)
SELECT 'techieray_harvest',
       'Weekly: re-scan TechieRay Global AI Regulation Tracker into ai_regulations (idempotent; new entries land pending review in /admin/tracker).',
       '30 4 * * 1', true
WHERE NOT EXISTS (SELECT 1 FROM background_jobs WHERE name = 'techieray_harvest');

-- ROLLBACK:
--   DELETE FROM background_jobs WHERE name='techieray_harvest';
--   DELETE FROM migrations WHERE name='106_techieray_harvest_job.sql';
