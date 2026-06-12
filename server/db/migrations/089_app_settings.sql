-- 089_app_settings.sql
-- A small key/value settings store (JSONB) for BE AI READY admin config — the
-- Models page (per-function model choice) and provider keys/endpoints saved via
-- the UI. Secret rows (provider keys) are write-only: the API never returns
-- them, only a "configured" status. Reversible.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ROLLBACK: DROP TABLE IF EXISTS app_settings; DELETE FROM migrations WHERE name='089_app_settings.sql';
