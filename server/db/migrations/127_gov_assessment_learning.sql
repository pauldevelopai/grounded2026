-- 127_gov_assessment_learning.sql
-- BAIR Governance: Assessment + Learning — schema (Part 1). See
-- docs/BUILD_bair-governance-assess-learn.md.
--
-- Feature A (Governance Assessment) EXTENDS the existing bair.audits engine rather than
-- adding parallel assessment tables: the four AIGP governance domains model as a
-- sub-structure of the 'governance' pillar. So we add a nullable `domain` (1-4) to
-- bair.questions + bair.findings, and attestation columns to bair.audits. No new
-- assessment tables — the scorecard is a GROUP BY domain over governance findings.
--
-- Feature B (Governance Learning) gets two new tables in the bair schema: a GLOBAL unit
-- catalogue (same four units for every tenant — no newsroom_id) and per-tenant,
-- per-person progress. Content itself lives in-repo; the catalogue only tracks the units.
--
-- Additive + reversible. Seeds (governance questions, score weights, the four units) land
-- in later parts, not here.

-- ── Feature A: extend the audit engine ──────────────────────────────────────
ALTER TABLE bair.questions ADD COLUMN IF NOT EXISTS domain SMALLINT;  -- 1-4 for governance Qs; NULL for all others
ALTER TABLE bair.findings  ADD COLUMN IF NOT EXISTS domain SMALLINT;  -- carried from the answered question; NULL otherwise
ALTER TABLE bair.audits    ADD COLUMN IF NOT EXISTS attested_by UUID;         -- admin (team_members.id) who attested the result
ALTER TABLE bair.audits    ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_bair_findings_domain ON bair.findings(audit_id, domain);

-- ── Feature B: learning tables ──────────────────────────────────────────────
-- Unit catalogue is GLOBAL — the same four units for every tenant, so NO newsroom_id.
CREATE TABLE IF NOT EXISTS bair.gov_learning_unit (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_no  SMALLINT NOT NULL UNIQUE,   -- 1-4
  title    TEXT NOT NULL,
  domain   SMALLINT NOT NULL,          -- the AIGP domain this unit teaches (1-4)
  summary  TEXT
);

-- Progress is per-tenant, per-person.
CREATE TABLE IF NOT EXISTS bair.gov_learning_progress (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id  UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  unit_no      SMALLINT NOT NULL,
  status       VARCHAR(16) NOT NULL DEFAULT 'not_started',  -- 'not_started'|'in_progress'|'complete'
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id, user_id, unit_no)
);
CREATE INDEX IF NOT EXISTS idx_bair_gov_learning_progress_tenant ON bair.gov_learning_progress(newsroom_id, user_id);

-- ROLLBACK:
--   DROP TABLE IF EXISTS bair.gov_learning_progress;
--   DROP TABLE IF EXISTS bair.gov_learning_unit;
--   DROP INDEX IF EXISTS bair.idx_bair_findings_domain;
--   ALTER TABLE bair.audits    DROP COLUMN IF EXISTS attested_at, DROP COLUMN IF EXISTS attested_by;
--   ALTER TABLE bair.findings  DROP COLUMN IF EXISTS domain;
--   ALTER TABLE bair.questions DROP COLUMN IF EXISTS domain;
--   DELETE FROM migrations WHERE name='127_gov_assessment_learning.sql';
