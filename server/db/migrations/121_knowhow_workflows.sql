-- 121_knowhow_workflows.sql
-- KnowHow workflows (Part 3.3): a procedure captured as ORDERED STEPS, not prose, so the
-- new-staff coach can return it and walk a hire through it step by step. Starts as the
-- author's own Tier-1 knowledge; an admin promotes it to company tier (Gate 1).
-- Additive + reversible.
CREATE TABLE IF NOT EXISTS knowhow.workflows (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES knowhow.tenants(id) ON DELETE CASCADE,
  person_id          UUID REFERENCES knowhow.people(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  steps              JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ step, detail }]
  tier               TEXT NOT NULL DEFAULT 'individual' CHECK (tier IN ('individual','company')),
  promoted_source_id UUID,                                 -- company-knowledge row, once promoted (dedupe)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS knowhow_workflows_scope ON knowhow.workflows(tenant_id, person_id, tier);

-- ROLLBACK:
--   DROP TABLE IF EXISTS knowhow.workflows;
--   DELETE FROM migrations WHERE name='121_knowhow_workflows.sql';
