-- 100_toolkit_suggestions.sql
-- Tool suggestions (a rebuild of AIKit's "suggest a tool"): a logged-in user
-- proposes an AI tool they think belongs in the toolbox; an admin reviews the
-- queue and approves (which can seed a draft tool to score) or rejects.

CREATE TABLE IF NOT EXISTS tool_suggestions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(300) NOT NULL,
  url               TEXT,
  description       TEXT,
  why_valuable      TEXT,
  submitted_by      UUID REFERENCES team_members(id) ON DELETE SET NULL,
  submitter_name    TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  review_notes      TEXT,
  reviewed_by       UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_tool_slug VARCHAR(200),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_suggestions_status ON tool_suggestions(status);
