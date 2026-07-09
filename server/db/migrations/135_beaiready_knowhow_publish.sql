-- 135_beaiready_knowhow_publish.sql
-- KnowHow outward publishing. A source can be opted into the public export bundle
-- (llms.txt / llms-full.txt / robots.txt / markdown mirrors / JSON-LD) that a business
-- drops onto its OWN website — SEPARATE from AI grounding (included/sensitive). Plus a
-- per-newsroom settings row for the export (site name, URL, per-crawler policy).

ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS publish BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS slug    TEXT;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS summary TEXT;

CREATE TABLE IF NOT EXISTS beaiready_knowhow_settings (
  newsroom_id UUID PRIMARY KEY REFERENCES newsrooms(id) ON DELETE CASCADE,
  org_name    TEXT,
  site_url    TEXT,
  crawlers    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ROLLBACK:
-- ALTER TABLE beaiready_company_sources DROP COLUMN IF EXISTS publish;
-- ALTER TABLE beaiready_company_sources DROP COLUMN IF EXISTS slug;
-- ALTER TABLE beaiready_company_sources DROP COLUMN IF EXISTS summary;
-- DROP TABLE IF EXISTS beaiready_knowhow_settings;
-- DELETE FROM migrations WHERE name = '135_beaiready_knowhow_publish.sql';
