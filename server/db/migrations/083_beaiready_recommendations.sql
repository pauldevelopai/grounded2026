-- 083_beaiready_recommendations.sql
-- BE AI READY — the audit's prioritised, plain-language recommendations
-- (brochure p4). Admin writes after the audit; the client reads its own.
-- Scoped to a newsroom/tenant (the business tenant). Reversible.
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  pillar VARCHAR(20) NOT NULL,          -- 'visibility' | 'governance' | 'security'
  title TEXT NOT NULL,
  detail TEXT,
  priority VARCHAR(10) DEFAULT 'medium',-- 'now' | 'high' | 'medium' | 'low'
  status VARCHAR(20) DEFAULT 'open',    -- 'open' | 'done' | 'dismissed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recs_tenant ON recommendations(newsroom_id);

-- ROLLBACK: DROP TABLE IF EXISTS recommendations; DELETE FROM migrations WHERE name='083_beaiready_recommendations.sql';
