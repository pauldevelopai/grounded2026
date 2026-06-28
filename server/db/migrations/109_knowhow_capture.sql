-- 109_knowhow_capture.sql
-- KnowHow — institutional-knowledge capture (Part B: the CAPTURE slice). KnowHow
-- replaces BetterBoss outright. Pulse (the mechanism) sends capture questions to
-- employees; their answers + ingested documents accumulate into a per-tenant
-- corpus. One shared schema serves BOTH products — every tenant row carries a
-- product tag ('bair'|'grounded') — the same "one engine, two storefronts" model
-- used for Nodes. Additive only: never touches public tracker tables or the
-- existing Airtable Node-Pulse. The retrieval agent (Part C) is NOT in this slice.

CREATE SCHEMA IF NOT EXISTS knowhow;

-- A business or newsroom using KnowHow. product decides which storefront owns it.
CREATE TABLE IF NOT EXISTS knowhow.tenants (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  product    TEXT NOT NULL CHECK (product IN ('bair','grounded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The employees whose knowledge is captured. Seniority matters: KnowHow captures
-- from seniors to (later) coach juniors. consent_at is null until they consent.
CREATE TABLE IF NOT EXISTS knowhow.people (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES knowhow.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT,
  seniority       TEXT,                              -- 'senior'|'junior'|'lead'|…
  email_or_handle TEXT,
  consent_at      TIMESTAMPTZ,                       -- null until they consent
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Areas of institutional knowledge (e.g. "tender qualification", "pricing judgement").
CREATE TABLE IF NOT EXISTS knowhow.topics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES knowhow.tenants(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  description TEXT,
  priority    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A capture question Pulse sends. public_token is set when it's sent (the
-- unguessable, login-free answer link the employee uses).
CREATE TABLE IF NOT EXISTS knowhow.prompts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES knowhow.tenants(id) ON DELETE CASCADE,
  topic_id     UUID REFERENCES knowhow.topics(id) ON DELETE SET NULL,
  person_id    UUID REFERENCES knowhow.people(id) ON DELETE SET NULL,   -- null = anyone
  text         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'open'  CHECK (kind   IN ('open','mcq','scenario')),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','vetted','sent','answered','archived')),
  public_token TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An employee's captured answer — the raw corpus.
CREATE TABLE IF NOT EXISTS knowhow.responses (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id  UUID NOT NULL REFERENCES knowhow.prompts(id) ON DELETE CASCADE,
  person_id  UUID REFERENCES knowhow.people(id) ON DELETE SET NULL,
  body       TEXT,
  structured JSONB,
  source     TEXT NOT NULL DEFAULT 'pulse' CHECK (source IN ('pulse','interview','import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ingested documents — the secondary capture channel. text is extracted in CODE
-- (never vision-retyped); [UNREADABLE] markers are preserved honestly.
CREATE TABLE IF NOT EXISTS knowhow.documents (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES knowhow.tenants(id) ON DELETE CASCADE,
  topic_id           UUID REFERENCES knowhow.topics(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  source_path_or_url TEXT,
  text               TEXT,
  meta               JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The unified, retrieval-ready corpus: one row per atomic piece of knowledge,
-- whether it came from a response or a document. This is what the future agent
-- (Part C) will retrieve over — embeddings are NOT in this slice; text stays plain.
CREATE TABLE IF NOT EXISTS knowhow.corpus_items (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES knowhow.tenants(id) ON DELETE CASCADE,
  topic_id   UUID REFERENCES knowhow.topics(id) ON DELETE SET NULL,
  person_id  UUID REFERENCES knowhow.people(id) ON DELETE SET NULL,
  origin     TEXT NOT NULL CHECK (origin IN ('response','document')),
  origin_id  UUID NOT NULL,
  text       TEXT NOT NULL,
  consent_ok BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowhow_people_tenant  ON knowhow.people(tenant_id);
CREATE INDEX IF NOT EXISTS knowhow_topics_tenant  ON knowhow.topics(tenant_id);
CREATE INDEX IF NOT EXISTS knowhow_prompts_tenant ON knowhow.prompts(tenant_id);
CREATE INDEX IF NOT EXISTS knowhow_prompts_token  ON knowhow.prompts(public_token);
CREATE INDEX IF NOT EXISTS knowhow_corpus_scope   ON knowhow.corpus_items(tenant_id, topic_id);

-- First tenant: Leads 2 Business (the L2B relationship from the 20 Jun training).
INSERT INTO knowhow.tenants (name, product)
  SELECT 'Leads 2 Business', 'bair'
  WHERE NOT EXISTS (SELECT 1 FROM knowhow.tenants WHERE name = 'Leads 2 Business' AND product = 'bair');

-- ROLLBACK:
--   DROP SCHEMA IF EXISTS knowhow CASCADE;
--   DELETE FROM migrations WHERE name='109_knowhow_capture.sql';
