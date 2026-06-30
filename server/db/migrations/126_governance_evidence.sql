-- 126_governance_evidence.sql
-- BE AI READY · Governance — the Evidence Trail (manual Component 6). Proof that
-- governance is real: files (reusing the uploads pipeline) or external links attached
-- to a governance entity — the policy, a control, a review, or a register system.
-- "Show us how you control your AI" → open this trail. Additive + reversible.
CREATE TABLE IF NOT EXISTS ai_evidence (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL,   -- 'ai_policy'|'ai_control'|'ai_review'|'ai_system'
  entity_id   UUID NOT NULL,
  kind        VARCHAR(8) NOT NULL DEFAULT 'link',  -- 'upload'|'link'
  upload_id   UUID,                   -- soft ref → uploaded_documents(id) when kind='upload'
  url         TEXT,                   -- when kind='link'
  label       TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_evidence_entity ON ai_evidence(newsroom_id, entity_type, entity_id);

-- ROLLBACK:
--   DROP TABLE IF EXISTS ai_evidence;
--   DELETE FROM migrations WHERE name='126_governance_evidence.sql';
