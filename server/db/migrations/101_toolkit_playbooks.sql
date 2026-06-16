-- 101_toolkit_playbooks.sql
-- Tool playbooks (a rebuild of AIKit's playbooks): a short, practical how-to for
-- a tool — best use cases, steps, common mistakes, privacy notes, key features.
-- One per tool. Admin-authored and edited in /admin/tools; only 'published'
-- playbooks show on the public tool page. (AI-assisted drafting can be layered on
-- later when an LLM key is funded; the structure does not depend on it.)

CREATE TABLE IF NOT EXISTS tool_playbooks (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_slug            VARCHAR(200) NOT NULL UNIQUE REFERENCES tools(slug) ON DELETE CASCADE,
  status               VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | published
  best_use_cases       TEXT,
  implementation_steps TEXT,
  common_mistakes      TEXT,
  privacy_notes        TEXT,
  key_features         JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by         TEXT,        -- 'admin' or a model id, for provenance
  updated_by           UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
