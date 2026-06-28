-- 114_knowledge_visibility_privacy.sql
-- Close the cross-tenant leak in the shared knowledge base.
--
-- BE AI READY client content (training materials/outcomes/strategy) was ingested
-- into knowledge_entries with organisation_id = NULL + sector scope ("sector-shared"),
-- so one client's raw content surfaced in another same-sector client's AI strategy
-- suggestions. The vision requires the opposite: a business's knowledge is PRIVATE;
-- only anonymised PATTERNS cross the boundary. This migration makes visibility
-- explicit and re-scopes raw client content to its owning organisation.

ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'private';
  -- 'private' — one organisation_id only (raw client content; never crosses tenants)
  -- 'global'  — Develop AI / platform-curated; visible to everyone
  -- 'pattern' — anonymised cross-business insight; sector-wide, carries no tenant specifics

-- Baseline from existing scope: org-scoped rows are private to that org; org-NULL rows
-- were previously treated as shared-to-everyone, so they become 'global'.
UPDATE knowledge_entries
   SET visibility = CASE WHEN organisation_id IS NOT NULL THEN 'private' ELSE 'global' END;

-- Re-scope BE AI READY client content to its OWNING organisation + private. Each entry
-- maps to its origin row via source_id (all carry source_type 'beaiready_training').
UPDATE knowledge_entries ke
   SET organisation_id = n.organisation_id, visibility = 'private'
  FROM training_materials m JOIN newsrooms n ON n.id = m.newsroom_id
 WHERE ke.source_type = 'beaiready_training' AND ke.source_id = m.id AND n.organisation_id IS NOT NULL;

UPDATE knowledge_entries ke
   SET organisation_id = n.organisation_id, visibility = 'private'
  FROM training_outcomes t JOIN newsrooms n ON n.id = t.newsroom_id
 WHERE ke.source_type = 'beaiready_training' AND ke.source_id = t.id AND n.organisation_id IS NOT NULL;

UPDATE knowledge_entries ke
   SET organisation_id = n.organisation_id, visibility = 'private'
  FROM training_strategy_items s JOIN newsrooms n ON n.id = s.newsroom_id
 WHERE ke.source_type = 'beaiready_training' AND ke.source_id = s.id AND n.organisation_id IS NOT NULL;

-- Any BE AI READY entry we couldn't map to an org stays private AND is deactivated so
-- it can't surface anywhere until it's re-created with the correct scope.
UPDATE knowledge_entries
   SET visibility = 'private', is_active = false
 WHERE source_type LIKE 'beaiready%' AND organisation_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_visibility ON knowledge_entries(visibility);

-- Per-company consent: opt in to contribute to the anonymised cross-business insight
-- pool. Default OFF — a business shares nothing across the boundary unless it chooses to.
ALTER TABLE newsrooms
  ADD COLUMN IF NOT EXISTS shares_anonymised_insights BOOLEAN NOT NULL DEFAULT false;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_knowledge_visibility;
--   ALTER TABLE knowledge_entries DROP COLUMN IF EXISTS visibility;
--   ALTER TABLE newsrooms DROP COLUMN IF EXISTS shares_anonymised_insights;
