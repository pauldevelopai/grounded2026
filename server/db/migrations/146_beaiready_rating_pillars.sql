-- 146_beaiready_rating_pillars.sql — a configurable, WEIGHTED rating framework (e.g. the
-- ZES-GI's four pillars) that the Claims Verifier tags, groups and rates by. Kept generic
-- (config over forking) rather than hardcoded, so any claims-verification tenant can define
-- their own pillars; the client ships a one-click ZES-GI preset for EnviroPress to load.

ALTER TABLE beaiready_knowhow_settings ADD COLUMN IF NOT EXISTS rating_pillars JSONB NOT NULL DEFAULT '[]'::jsonb;
-- shape: [{ "name": "Environmental Protection & Ecological Rehabilitation", "weight": 35, "definition": "..." }, ...]

-- ROLLBACK:
-- ALTER TABLE beaiready_knowhow_settings DROP COLUMN IF EXISTS rating_pillars;
-- DELETE FROM migrations WHERE name = '146_beaiready_rating_pillars.sql';
