-- 080_phase2_newsrooms.sql
-- Phase 2 · step 2a — multi-tenancy foundation. ADDITIVE + REVERSIBLE.
-- See docs/PHASE2_PLAN.md.
--
-- Re-introduces the per-newsroom isolation the schema was adapted down from
-- (cf. 073_create_workflows.sql: "no multi-newsroom newsroom_id like the source
-- platform"). Adds a `newsrooms` table + a NULLABLE `newsroom_id` to the auth
-- table and the per-newsroom PRODUCT tables, seeds the Develop AI office
-- newsroom, and backfills every existing row to it.
--
-- NOTHING enforces newsroom_id yet (NOT NULL + query scoping arrive in later
-- steps), so this is safe to run on the live box: every existing row keeps
-- working, transparently scoped to the office newsroom. migrate.js wraps this
-- whole file in BEGIN/COMMIT, so it applies all-or-nothing.
--
-- Scope notes: the AI-legal tracker tables + the curated content pipelines
-- (069/077/078: content_*, data_security_items, ethics_items, monetisation_items)
-- stay GLOBAL (shared). The Develop AI back-office / Studio tables stay
-- single-tenant. Only the newsroom PRODUCT data is isolated here.
--
-- Rollback (manual — migrate.js is forward-only) is at the bottom of this file.

CREATE TABLE IF NOT EXISTS newsrooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The Develop AI office newsroom (dogfooding). Fixed id so the backfill is
-- deterministic + idempotent. All pre-existing per-newsroom data belongs to it.
INSERT INTO newsrooms (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Develop AI (office)', 'develop-ai')
ON CONFLICT (id) DO NOTHING;

-- Each per-newsroom table gets a nullable newsroom_id (FK → newsrooms).
ALTER TABLE team_members        ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE newsroom_profile    ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE workflows           ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE workflow_runs       ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE tool_outputs        ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE uploaded_documents  ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE user_questions      ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE feedback            ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE ai_interactions     ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE ai_conversations    ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);
ALTER TABLE agent_conversations ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id);

-- Backfill every existing row → the Develop AI office newsroom.
UPDATE team_members        SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE newsroom_profile    SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE workflows           SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE workflow_runs       SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE tool_outputs        SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE uploaded_documents  SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE user_questions      SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE feedback            SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE ai_interactions     SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE ai_conversations    SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;
UPDATE agent_conversations SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;

-- Indexes for the scoping queries that arrive in step 2c (the high-traffic ones).
CREATE INDEX IF NOT EXISTS idx_team_members_newsroom    ON team_members(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_workflows_newsroom        ON workflows(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_newsroom    ON workflow_runs(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_tool_outputs_newsroom     ON tool_outputs(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_user_questions_newsroom   ON user_questions(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_feedback_newsroom         ON feedback(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_newsroom  ON ai_interactions(newsroom_id);

-- newsroom_profile is one-row-per-newsroom — enforce that now (was implicitly
-- single-row). Partial unique so the office row + future newsroom rows coexist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsroom_profile_one_per_newsroom
  ON newsroom_profile(newsroom_id) WHERE newsroom_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK (run manually if needed — migrate.js does not run down-migrations):
--
--   DROP INDEX IF EXISTS idx_newsroom_profile_one_per_newsroom;
--   DROP INDEX IF EXISTS idx_ai_interactions_newsroom;
--   DROP INDEX IF EXISTS idx_feedback_newsroom;
--   DROP INDEX IF EXISTS idx_user_questions_newsroom;
--   DROP INDEX IF EXISTS idx_tool_outputs_newsroom;
--   DROP INDEX IF EXISTS idx_workflow_runs_newsroom;
--   DROP INDEX IF EXISTS idx_workflows_newsroom;
--   DROP INDEX IF EXISTS idx_team_members_newsroom;
--   ALTER TABLE agent_conversations DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE ai_conversations    DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE ai_interactions     DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE feedback            DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE user_questions      DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE uploaded_documents  DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE tool_outputs        DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE workflow_runs       DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE workflows           DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE newsroom_profile    DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE team_members        DROP COLUMN IF EXISTS newsroom_id;
--   DROP TABLE IF EXISTS newsrooms;
--   DELETE FROM migrations WHERE name = '080_phase2_newsrooms.sql';
-- ============================================================================
