-- 139_beaiready_claims.sql
-- EnviroPress Claims Verifier — a bespoke KnowHow module gated by
-- use_case='claims-verification'. Segments a tenant's sources into per-"mine" buckets
-- (collection) each carrying a role (the mine's own claim / EnviroPress reporting /
-- external source), stores per-claim verdicts that evolve as evidence is added, and
-- snapshots verdict counts so the report can chart change over time.

ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS collection TEXT;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS role       TEXT NOT NULL DEFAULT 'reporting'; -- claim | reporting | external
CREATE INDEX IF NOT EXISTS idx_company_sources_collection ON beaiready_company_sources (newsroom_id, collection);

CREATE TABLE IF NOT EXISTS beaiready_claim_checks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  collection  TEXT NOT NULL,
  claim_text  TEXT NOT NULL,
  verdict     TEXT NOT NULL DEFAULT 'pending',   -- supported | contradicted | misleading | unverified | pending
  rationale   TEXT,
  citations   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claim_checks_scope ON beaiready_claim_checks (newsroom_id, collection);

CREATE TABLE IF NOT EXISTS beaiready_claim_snapshots (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  collection  TEXT NOT NULL,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  counts      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_claim_snapshots_scope ON beaiready_claim_snapshots (newsroom_id, collection, taken_at);

-- The ordered list of mine/bucket names (so an empty mine shows before any source is added).
ALTER TABLE beaiready_knowhow_settings ADD COLUMN IF NOT EXISTS collections JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ROLLBACK:
-- DROP TABLE IF EXISTS beaiready_claim_checks; DROP TABLE IF EXISTS beaiready_claim_snapshots;
-- ALTER TABLE beaiready_company_sources DROP COLUMN IF EXISTS collection, DROP COLUMN IF EXISTS role;
-- ALTER TABLE beaiready_knowhow_settings DROP COLUMN IF EXISTS collections;
-- DELETE FROM migrations WHERE name = '139_beaiready_claims.sql';
