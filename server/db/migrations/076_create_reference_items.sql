-- Per-tool reference library — the deep, tool-specific context each operations
-- tool reads when it runs: funders (Fundraiser), audience personas (Audience),
-- jurisdiction notes (Security Audit), operational resources (Operations).
-- Managed in the admin "Reference data" page; injected into the tool's prompt.
CREATE TABLE IF NOT EXISTS reference_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool VARCHAR(60) NOT NULL,    -- the tool block slug this belongs to, e.g. 'tool-fundraiser'
  name TEXT NOT NULL,
  content TEXT,                 -- the reference detail (funder requirements, persona, jurisdiction rules…)
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reference_items_tool ON reference_items(tool, name);
