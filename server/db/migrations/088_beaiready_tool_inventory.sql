-- 088_beaiready_tool_inventory.sql
-- BE AI READY · Data Security (V2 brochure p.4) — a per-tenant inventory of the
-- AI tools a company actually uses: who uses each, what data goes into it, an
-- (optional) match to the assessed-tools DB, and an acceptability ruling + fix.
-- Reversible.
CREATE TABLE IF NOT EXISTS ai_tool_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  used_by TEXT,                          -- person / team / department
  data_shared TEXT,                      -- what company/client/personal data goes in
  matched_tool_id UUID,                  -- ai_legal_tools.id if we recognised it
  acceptability VARCHAR(16) DEFAULT 'unreviewed', -- 'approved'|'restricted'|'avoid'|'unreviewed'
  ruling TEXT,                           -- one-line plain-language reason
  fix TEXT,                              -- the prioritised fix, if any
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_inventory_tenant ON ai_tool_inventory(newsroom_id);

-- ROLLBACK: DROP TABLE IF EXISTS ai_tool_inventory; DELETE FROM migrations WHERE name='088_beaiready_tool_inventory.sql';
