-- 113_purge_stale_briefing_cache.sql
-- The "Today in AI" home briefings are cached in app_settings and served verbatim.
-- The cached rows were generated BEFORE the fabrication fixes (open web search for
-- AI News; unvetted auto-added rows feeding AI Law), so they still show invented
-- items — e.g. the bogus "Claude Fable 5 export-control / double pricing" story and
-- a fabricated "export-control suspension" regulation headline. Clearing the cache
-- removes them immediately on deploy: the home page simply hides "Today in AI" until
-- the briefings are regenerated (scheduled job, or admin → Briefings → Regenerate),
-- which now run against reliable sources only.
--
-- Only the current cached value is cleared. The per-day history tables are left as
-- they are. Safe + idempotent (a no-op if the keys are already gone).

DELETE FROM app_settings WHERE key IN ('ai_news_today', 'governance_today');

-- ROLLBACK: none — the cache simply repopulates on the next regeneration.
