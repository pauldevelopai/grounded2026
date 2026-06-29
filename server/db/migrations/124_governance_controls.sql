-- 124_governance_controls.sql
-- BE AI READY · Governance — the Controls Library (manual Component 3). Per-tenant
-- safeguards linked to register systems (many-to-many) and OPTIONALLY to the
-- bair.findings gap each one closes. Adopting a control that closes a finding resolves
-- it, so the readiness score reflects remediation — the finding → system → control →
-- score chain. Additive + reversible.
CREATE TABLE IF NOT EXISTS ai_controls (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id       UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  applies_to_tier   VARCHAR(16),           -- 'unacceptable'|'high'|'limited'|'minimal'|'any'
  owner_person      TEXT,
  status            VARCHAR(16) NOT NULL DEFAULT 'active',  -- 'active'|'planned'|'retired'
  framework_ref     TEXT,                  -- provenance, e.g. 'EU AI Act Art 14', 'ISO 42001 A.6.2'
  closes_finding_id UUID,                  -- soft link → bair.findings(id) (cross-schema; validated in code)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_controls_tenant ON ai_controls(newsroom_id);

CREATE TABLE IF NOT EXISTS ai_system_controls (
  control_id  UUID NOT NULL REFERENCES ai_controls(id) ON DELETE CASCADE,
  system_id   UUID NOT NULL REFERENCES ai_tool_inventory(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (control_id, system_id)
);
CREATE INDEX IF NOT EXISTS idx_system_controls_system ON ai_system_controls(system_id);

-- Let an adopted control RESOLVE the gap it closes; bair-score excludes resolved findings.
ALTER TABLE bair.findings ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ROLLBACK:
--   ALTER TABLE bair.findings DROP COLUMN IF EXISTS resolved_at;
--   DROP TABLE IF EXISTS ai_system_controls;
--   DROP TABLE IF EXISTS ai_controls;
--   DELETE FROM migrations WHERE name='124_governance_controls.sql';
