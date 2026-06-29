-- 122_governance_register_fields.sql
-- BE AI READY · Governance — upgrade the AI tool inventory (088) into a full
-- "AI System Register" per the AI Governance Delivery Manual (Component 1), and add
-- the EU AI Act risk tier (Component 2). All additive + nullable, so the existing
-- Data Security UI keeps working unchanged. Reversible.
--
-- NB: `acceptability` (is this tool safe to put our data in? — already on the table)
-- is DISTINCT from `risk_tier` (EU AI Act: how much harm if it fails?). Both coexist.
ALTER TABLE ai_tool_inventory
  ADD COLUMN IF NOT EXISTS purpose          TEXT,            -- one-plain-sentence use case
  ADD COLUMN IF NOT EXISTS owner_person     TEXT,            -- the named person answerable for it
  ADD COLUMN IF NOT EXISTS paid_free        VARCHAR(8),      -- 'paid'|'free'|'unknown'
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(16),     -- 'active'|'trial'|'retired'|'awaiting'
  ADD COLUMN IF NOT EXISTS risk_tier        VARCHAR(16) DEFAULT 'unclassified',
                                                             -- EU AI Act: 'unacceptable'|'high'|'limited'|'minimal'|'unclassified'
  ADD COLUMN IF NOT EXISTS risk_rationale   TEXT,            -- the reasoning (itself evidence)
  ADD COLUMN IF NOT EXISTS risk_citations   JSONB,           -- [{id,title,url}] the classification cited
  ADD COLUMN IF NOT EXISTS risk_grounded    BOOLEAN,         -- true=backed by cited corpus sources
  ADD COLUMN IF NOT EXISTS last_reviewed    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tool_inventory_risk_tier ON ai_tool_inventory(newsroom_id, risk_tier);

-- ROLLBACK:
--   ALTER TABLE ai_tool_inventory
--     DROP COLUMN IF EXISTS purpose, DROP COLUMN IF EXISTS owner_person,
--     DROP COLUMN IF EXISTS paid_free, DROP COLUMN IF EXISTS lifecycle_status,
--     DROP COLUMN IF EXISTS risk_tier, DROP COLUMN IF EXISTS risk_rationale,
--     DROP COLUMN IF EXISTS risk_citations, DROP COLUMN IF EXISTS risk_grounded,
--     DROP COLUMN IF EXISTS last_reviewed;
--   DROP INDEX IF EXISTS idx_tool_inventory_risk_tier;
--   DELETE FROM migrations WHERE name='122_governance_register_fields.sql';
