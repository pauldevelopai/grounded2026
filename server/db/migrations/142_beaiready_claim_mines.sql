-- 142_beaiready_claim_mines.sql — Phase 2. Promote "mines" (buckets) from a JSONB name
-- list in settings to a real table so they can carry run state (and, later, editorial
-- metadata), and register a nightly job that keeps every mine's verdicts current WITHOUT
-- re-running the model on unchanged claims (incremental: a mine is only re-processed when
-- it gained evidence since its last run, and then only its stale claims are re-verified).

CREATE TABLE IF NOT EXISTS beaiready_claim_mines (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id  UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  last_run_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id, name)
);

-- Backfill from the existing settings.collections name lists so no mine is lost.
INSERT INTO beaiready_claim_mines (newsroom_id, name)
SELECT s.newsroom_id, c.name
  FROM beaiready_knowhow_settings s
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.collections, '[]'::jsonb)) AS c(name)
ON CONFLICT (newsroom_id, name) DO NOTHING;

-- Nightly incremental re-verification (03:15 Europe/London — after the other digests).
INSERT INTO background_jobs (name, description, cron_expression, is_enabled)
VALUES ('claims_reverify', 'Re-verify claims whose mine gained new evidence (incremental)', '15 3 * * *', true)
ON CONFLICT (name) DO NOTHING;

-- ROLLBACK:
-- DROP TABLE IF EXISTS beaiready_claim_mines;
-- DELETE FROM background_jobs WHERE name = 'claims_reverify';
-- DELETE FROM migrations WHERE name = '142_beaiready_claim_mines.sql';
