-- 116_bair_insights.sql
-- The anonymised cross-business insight engine. The same measurement and strategy
-- work that proves value to each client is aggregated — across ONLY businesses that
-- consent (newsrooms.shares_anonymised_insights, migration 114) and only where at
-- least two contribute (k-anonymity) — into de-identified PATTERNS: what tends to
-- work, what gets adopted, where the common pitfalls are. These never name or
-- describe an individual business. Published patterns are ingested into
-- knowledge_entries as visibility='pattern', so they safely inform every client's AI.
CREATE TABLE IF NOT EXISTS bair_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector_id UUID REFERENCES sectors(id),          -- NULL = across all sectors
  pattern_type VARCHAR(40) NOT NULL,              -- 'automation' | 'goal' | 'pitfall' | 'adoption' | 'measurement'
  title VARCHAR(300) NOT NULL,
  insight TEXT NOT NULL,                          -- the anonymised pattern (no company specifics)
  supporting_orgs INT NOT NULL DEFAULT 0,         -- how many distinct businesses it's drawn from (>= 2)
  evidence JSONB NOT NULL DEFAULT '{}',           -- the de-identified aggregate it was derived from
  knowledge_id UUID REFERENCES knowledge_entries(id) ON DELETE SET NULL,  -- the 'pattern' entry it feeds
  is_published BOOLEAN NOT NULL DEFAULT false,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bair_insights_sector ON bair_insights(sector_id, is_published);

-- ROLLBACK: DROP TABLE IF EXISTS bair_insights;
