-- 115_bair_workspace.sql
-- The pooled company AI workspace — the reinforcing loop at the heart of the vision.
-- Every AI interaction a team member has is captured into ONE shared corpus that is
-- private to their company, so the work builds on itself instead of evaporating in
-- someone's personal chat. Each ask draws on the company's own knowledge (documents,
-- training, and the team's earlier answers) and is then added back to it.
CREATE TABLE IF NOT EXISTS bair_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  model VARCHAR(60),
  sources JSONB NOT NULL DEFAULT '[]',          -- the corpus pieces the answer drew on
  tags TEXT[] NOT NULL DEFAULT '{}',
  embedding vector(1536),                        -- for retrieval over prior interactions
  is_shared BOOLEAN NOT NULL DEFAULT true,       -- pooled to the company (the default)
  is_pinned BOOLEAN NOT NULL DEFAULT false,      -- curated as especially useful
  promoted_knowledge_id UUID REFERENCES knowledge_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bair_interactions_nr ON bair_interactions(newsroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bair_interactions_fts ON bair_interactions
  USING GIN (to_tsvector('english', coalesce(question,'') || ' ' || coalesce(answer,'')));

-- ROLLBACK: DROP TABLE IF EXISTS bair_interactions;
