-- 095_toolkit_rich_fields.sql
-- The AIKit tool catalogue (kit/tools/*.json) carries richer fields than the first
-- import kept. Bring them across so the BE AI READY toolbox matches the AIKit app:
--   comments            — practical usage notes / caveats (incl. data-handling)
--   time_saved          — the "time dividend" a tool buys back
--   time_reinvestment   — what to do with that reclaimed time
--   tags                — quick descriptors (beginner-friendly, open-source, …)
--   similar_tools       — slugs of comparable tools (the "alternatives")
--   sovereign_alternative — slug of the privacy/self-hosted alternative
-- Backfilled from the JSON by server/scripts/import-toolkit-extras.mjs. Additive.
ALTER TABLE tools ADD COLUMN IF NOT EXISTS comments              TEXT;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS time_saved            TEXT;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS time_reinvestment     TEXT;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS tags                  JSONB;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS similar_tools         JSONB;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS sovereign_alternative TEXT;
