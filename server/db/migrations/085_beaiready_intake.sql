-- 085_beaiready_intake.sql
-- BE AI READY — intake data in (spec Part D). Existing Google Forms stay; each
-- response Sheet is "Publish to web" → CSV. A config row per form + a responses
-- table + an hourly sync job (upsert by row-hash). No Google API keys.
-- Reversible.

CREATE TABLE IF NOT EXISTS intake_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  csv_url TEXT NOT NULL,             -- the published-to-web CSV URL of the response Sheet
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intake_forms_tenant ON intake_forms(newsroom_id);

CREATE TABLE IF NOT EXISTS intake_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  response JSONB NOT NULL,           -- { header: value, … } for one Sheet row
  row_hash TEXT NOT NULL,            -- sha256 of the raw row → idempotent upsert
  submitted_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id, form_name, row_hash)
);
CREATE INDEX IF NOT EXISTS idx_intake_responses_tenant ON intake_responses(newsroom_id, form_name);

-- Register the hourly sync on the existing background-jobs scheduler.
INSERT INTO background_jobs (name, description, cron_expression, is_enabled)
SELECT 'forms_sheet_sync', 'BE AI READY: pull published Google-Form response CSVs into intake_responses (hourly).', '0 * * * *', true
WHERE NOT EXISTS (SELECT 1 FROM background_jobs WHERE name = 'forms_sheet_sync');

-- ROLLBACK:
--   DELETE FROM background_jobs WHERE name='forms_sheet_sync';
--   DROP TABLE IF EXISTS intake_responses; DROP TABLE IF EXISTS intake_forms;
--   DELETE FROM migrations WHERE name='085_beaiready_intake.sql';
