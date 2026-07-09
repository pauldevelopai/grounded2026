-- 136_beaiready_knowhow_manifest.sql
-- KnowHow manifest: the full per-document editorial controls (aiready parity).
-- 3-state inclusion, five publication toggles, sensitivity states, editable metadata,
-- manual-override tracking, plus bulk rules + the llms.txt header/mirror settings.
-- The pre-existing simple flags (included / sensitive / publish) stay in sync so the
-- "Your knowledge" quick controls keep working.

ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS inclusion          TEXT    NOT NULL DEFAULT 'include';   -- include | exclude | local_only
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS out_clean_markdown BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS out_json_ld        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS out_mirror_md      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS in_llms_txt        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS in_llms_full       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS sensitivity        TEXT    NOT NULL DEFAULT 'none';      -- none | source-protected | legal-hold | embargoed | withdrawn
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS author             TEXT;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS category           TEXT;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS notes              TEXT;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS manual_overrides   JSONB   NOT NULL DEFAULT '[]'::jsonb;

-- Seed the new columns from the existing simple flags so behaviour is unchanged:
UPDATE beaiready_company_sources SET inclusion   = CASE WHEN included  = false THEN 'exclude'          ELSE 'include' END;
UPDATE beaiready_company_sources SET sensitivity = CASE WHEN sensitive = true  THEN 'source-protected' ELSE 'none'    END;
UPDATE beaiready_company_sources
   SET out_clean_markdown = true, out_json_ld = true, out_mirror_md = true, in_llms_txt = true, in_llms_full = true
 WHERE publish = true;

ALTER TABLE beaiready_knowhow_settings ADD COLUMN IF NOT EXISTS rules        JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE beaiready_knowhow_settings ADD COLUMN IF NOT EXISTS llms_summary TEXT;
ALTER TABLE beaiready_knowhow_settings ADD COLUMN IF NOT EXISTS mirror_base  TEXT;

-- ROLLBACK:
-- ALTER TABLE beaiready_company_sources DROP COLUMN IF EXISTS inclusion, DROP COLUMN IF EXISTS out_clean_markdown,
--   DROP COLUMN IF EXISTS out_json_ld, DROP COLUMN IF EXISTS out_mirror_md, DROP COLUMN IF EXISTS in_llms_txt,
--   DROP COLUMN IF EXISTS in_llms_full, DROP COLUMN IF EXISTS sensitivity, DROP COLUMN IF EXISTS author,
--   DROP COLUMN IF EXISTS category, DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS notes,
--   DROP COLUMN IF EXISTS manual_overrides;
-- ALTER TABLE beaiready_knowhow_settings DROP COLUMN IF EXISTS rules, DROP COLUMN IF EXISTS llms_summary, DROP COLUMN IF EXISTS mirror_base;
-- DELETE FROM migrations WHERE name = '136_beaiready_knowhow_manifest.sql';
