-- 081_phase2_enforce_newsrooms.sql
-- Phase 2 · step 2e — enforce the multi-tenant schema. Runs AFTER 080 backfilled
-- every row to the office newsroom and 2b–2d made all writers set newsroom_id.
-- See docs/PHASE2_PLAN.md. Reversible (rollback at the bottom).
--
-- Two tiers:
--   1. Product tables whose writers ALWAYS set newsroom_id now → NOT NULL.
--   2. Log/Studio tables written from many places (Develop AI internal surfaces
--      that stay single-tenant) → DEFAULT office + NOT NULL, so untagged writes
--      keep landing in the office tenant instead of NULL.

-- Tier 1 — writers set it explicitly since 2b–2d.
ALTER TABLE team_members      ALTER COLUMN newsroom_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE team_members      ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE workflows         ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE workflow_runs     ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE tool_outputs      ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE newsroom_profile  ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE feedback          ALTER COLUMN newsroom_id SET NOT NULL;

-- Tier 2 — Studio/log tables: default to the office tenant.
ALTER TABLE uploaded_documents  ALTER COLUMN newsroom_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE uploaded_documents  ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE user_questions      ALTER COLUMN newsroom_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE user_questions      ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE ai_interactions     ALTER COLUMN newsroom_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE ai_interactions     ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE ai_conversations    ALTER COLUMN newsroom_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE ai_conversations    ALTER COLUMN newsroom_id SET NOT NULL;
ALTER TABLE agent_conversations ALTER COLUMN newsroom_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE agent_conversations ALTER COLUMN newsroom_id SET NOT NULL;

-- Safety: belt-and-braces backfill in case any row slipped in NULL between
-- 080 and this migration (cheap no-op otherwise).
-- (Must run BEFORE the NOT NULLs above would fail — so do it first.)
-- NOTE: kept here as documentation; the actual order-sensitive backfill is
-- performed by 080. If this migration fails on a NOT NULL because of a stray
-- NULL row, run:  UPDATE <table> SET newsroom_id = '00000000-0000-0000-0000-000000000001' WHERE newsroom_id IS NULL;

-- Workflow slugs: global uniqueness → per-newsroom uniqueness (two newsrooms
-- can both have "morning-brief"; the create route's collision check is scoped
-- to match).
DROP INDEX IF EXISTS idx_workflows_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_newsroom_slug ON workflows(newsroom_id, slug);

-- ============================================================================
-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS idx_workflows_newsroom_slug;
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_slug ON workflows(slug);
--   ALTER TABLE agent_conversations ALTER COLUMN newsroom_id DROP NOT NULL; ALTER TABLE agent_conversations ALTER COLUMN newsroom_id DROP DEFAULT;
--   ALTER TABLE ai_conversations    ALTER COLUMN newsroom_id DROP NOT NULL; ALTER TABLE ai_conversations    ALTER COLUMN newsroom_id DROP DEFAULT;
--   ALTER TABLE ai_interactions     ALTER COLUMN newsroom_id DROP NOT NULL; ALTER TABLE ai_interactions     ALTER COLUMN newsroom_id DROP DEFAULT;
--   ALTER TABLE user_questions      ALTER COLUMN newsroom_id DROP NOT NULL; ALTER TABLE user_questions      ALTER COLUMN newsroom_id DROP DEFAULT;
--   ALTER TABLE uploaded_documents  ALTER COLUMN newsroom_id DROP NOT NULL; ALTER TABLE uploaded_documents  ALTER COLUMN newsroom_id DROP DEFAULT;
--   ALTER TABLE feedback            ALTER COLUMN newsroom_id DROP NOT NULL;
--   ALTER TABLE newsroom_profile    ALTER COLUMN newsroom_id DROP NOT NULL;
--   ALTER TABLE tool_outputs        ALTER COLUMN newsroom_id DROP NOT NULL;
--   ALTER TABLE workflow_runs       ALTER COLUMN newsroom_id DROP NOT NULL;
--   ALTER TABLE workflows           ALTER COLUMN newsroom_id DROP NOT NULL;
--   ALTER TABLE team_members        ALTER COLUMN newsroom_id DROP NOT NULL; ALTER TABLE team_members ALTER COLUMN newsroom_id DROP DEFAULT;
--   DELETE FROM migrations WHERE name = '081_phase2_enforce_newsrooms.sql';
-- ============================================================================
