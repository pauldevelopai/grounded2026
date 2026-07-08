-- 134_beaiready_team_analysis.sql
-- BE AI READY — cache for the AI-generated team AI-readiness analysis shown on the
-- client's /training dashboard. The analysis is derived from the tenant's intake
-- survey responses (aggregate, no names). Generating it calls Claude, so we cache
-- one row per tenant and only regenerate when the input changes (fingerprint =
-- version + response count + latest import time). Reversible.

CREATE TABLE IF NOT EXISTS beaiready_team_analysis (
  newsroom_id  UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'intake',
  fingerprint  TEXT NOT NULL,                 -- version:count:maxImportedAt — bust cache on change
  analysis     JSONB NOT NULL,                -- { narrative, role_groups[], learning_priorities[], automation_opportunities[] }
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (newsroom_id, kind)
);

-- ROLLBACK:
--   DROP TABLE IF EXISTS beaiready_team_analysis;
--   DELETE FROM migrations WHERE name='134_beaiready_team_analysis.sql';
