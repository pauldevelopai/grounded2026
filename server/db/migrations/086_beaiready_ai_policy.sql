-- 086_beaiready_ai_policy.sql
-- BE AI READY · Governance — a per-tenant AI-use policy that "lives in the
-- dashboard" (V2 brochure p.4). One current policy per business; generated with
-- Claude (business-framed), then saved/edited and owned by the client.
-- Reversible.
CREATE TABLE IF NOT EXISTS ai_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'AI-use policy',
  content TEXT,                  -- the policy markdown the business owns
  brief JSONB,                   -- the inputs it was generated from
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id)           -- one current policy per tenant
);

-- ROLLBACK: DROP TABLE IF EXISTS ai_policies; DELETE FROM migrations WHERE name='086_beaiready_ai_policy.sql';
