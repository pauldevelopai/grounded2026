-- 090_create_bair_schema.sql
-- BAIR: AI-readiness audit corpus in its own schema. BetterBoss folded in as bair.bb_*.
-- (Renumbered from the spec's 079 → 090: 079–089 are already taken in this repo.
--  Runs against DB `tracker` (formerly `holly`). uuid_generate_v4 per house style,
--  uuid-ossp extension already created in migration 001.)

CREATE SCHEMA IF NOT EXISTS bair;

CREATE TABLE IF NOT EXISTS bair.audits (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id   UUID REFERENCES public.organisations(id),
  sector_id         UUID REFERENCES public.sectors(id),
  contact_id        UUID REFERENCES public.contacts(id),
  company_size      VARCHAR(20),        -- 'micro'|'small'|'medium'|'large'
  region            VARCHAR(60),
  status            VARCHAR(20) NOT NULL DEFAULT 'intake',  -- 'intake'|'in_review'|'delivered'|'rechecked'
  readiness_score   NUMERIC(5,2),
  intake_at         TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  recheck_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bair.findings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id        UUID NOT NULL REFERENCES bair.audits(id) ON DELETE CASCADE,
  pillar          VARCHAR(20) NOT NULL,   -- 'visibility'|'governance'|'security'|'productivity'|'capability'|'usage'
  finding_type    VARCHAR(60) NOT NULL,
  severity        SMALLINT NOT NULL,      -- 1..5
  data_class      VARCHAR(20),            -- 'client_pii'|'financial'|'ip'|'none'
  source          VARCHAR(12) NOT NULL,   -- 'consultant'|'self_serve'|'automated'
  confidence      NUMERIC(3,2) DEFAULT 1.0,
  consent_scope   VARCHAR(20) NOT NULL DEFAULT 'client_only', -- 'client_only'|'anonymised_corpus_ok'|'sealed'
  evidence_note   TEXT,
  is_baseline     BOOLEAN NOT NULL DEFAULT true,  -- true=intake, false=re-check
  rag_synced      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bair_findings_audit   ON bair.findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_bair_findings_pillar  ON bair.findings(pillar);
CREATE INDEX IF NOT EXISTS idx_bair_findings_consent ON bair.findings(consent_scope);
CREATE INDEX IF NOT EXISTS idx_bair_findings_type    ON bair.findings(finding_type);

CREATE TABLE IF NOT EXISTS bair.score_weights (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pillar          VARCHAR(20) NOT NULL,
  finding_type    VARCHAR(60) NOT NULL,
  weight          NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  source          VARCHAR(12) NOT NULL DEFAULT 'prior',  -- 'prior'|'learned'
  sector_id       UUID REFERENCES public.sectors(id),    -- null = global default
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pillar, finding_type, sector_id, source)
);

CREATE TABLE IF NOT EXISTS bair.questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pillar          VARCHAR(20) NOT NULL,
  sector_id       UUID REFERENCES public.sectors(id),
  question_text   TEXT NOT NULL,
  question_type   VARCHAR(20) NOT NULL DEFAULT 'single_select',
  options         JSONB,
  maps_to_finding VARCHAR(60),
  hit_rate        NUMERIC(3,2),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  order_index     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bair_questions_sector ON bair.questions(pillar, sector_id);

-- BetterBoss, folded in (bb_ prefix = future schema split). consent_scope for
-- anything derived from these is ALWAYS 'sealed' by rule; never enters the corpus.
CREATE TABLE IF NOT EXISTS bair.bb_tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES public.organisations(id),
  boss_name       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bair.bb_decisions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES bair.bb_tenants(id) ON DELETE CASCADE,
  task_type       VARCHAR(60),
  chosen          TEXT,
  rejected_alt    TEXT,
  reasoning       TEXT,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bb_decisions_tenant ON bair.bb_decisions(tenant_id);
