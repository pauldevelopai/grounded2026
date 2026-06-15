-- 093_beaiready_training.sql
-- BE AI READY Training & Strategy: per-client (per-tenant) agendas, materials and
-- outcome documents. All scoped by newsroom_id (the business tenant). Materials +
-- outcomes carry rag_shareable / rag_synced so a consultant can feed (or withhold)
-- them from the shared sector knowledge base — the same "store now, embed later"
-- pattern as bair.findings.rag_synced. Additive; public.* tables unchanged.

-- A dated training agenda + its ordered items. Clients see 'published' agendas.
CREATE TABLE IF NOT EXISTS training_agendas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id   UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  scheduled_for DATE,
  location      TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',   -- 'draft'|'published'
  notes         TEXT,
  created_by    UUID REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_agendas_tenant ON training_agendas(newsroom_id);

CREATE TABLE IF NOT EXISTS training_agenda_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agenda_id   UUID NOT NULL REFERENCES training_agendas(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  time_label  VARCHAR(40),          -- e.g. '09:00–10:30'
  topic       TEXT NOT NULL,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_training_agenda_items_agenda ON training_agenda_items(agenda_id);

-- Per-company training materials. `content` is the body the RAG can learn from;
-- `url` is an optional external/uploaded link. knowledge_id links the ingested
-- knowledge_entries row (soft reference) so an edit can re-sync it.
CREATE TABLE IF NOT EXISTS training_materials (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id   UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  content       TEXT,
  url           TEXT,
  kind          VARCHAR(30) NOT NULL DEFAULT 'doc',     -- 'doc'|'slide'|'video'|'link'|'exercise'
  order_index   INTEGER NOT NULL DEFAULT 0,
  published     BOOLEAN NOT NULL DEFAULT true,
  rag_shareable BOOLEAN NOT NULL DEFAULT true,
  rag_synced    BOOLEAN NOT NULL DEFAULT false,
  knowledge_id  UUID,
  created_by    UUID REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_materials_tenant ON training_materials(newsroom_id);

-- The training outcome document: editable markdown `content` (+ optional uploaded
-- file_url), linked to the client's AI strategy. Clients see 'final' ones.
CREATE TABLE IF NOT EXISTS training_outcomes (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id        UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  content            TEXT,
  file_url           TEXT,
  status             VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft'|'final'
  linked_to_strategy BOOLEAN NOT NULL DEFAULT true,
  rag_shareable      BOOLEAN NOT NULL DEFAULT true,
  rag_synced         BOOLEAN NOT NULL DEFAULT false,
  knowledge_id       UUID,
  created_by         UUID REFERENCES team_members(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_outcomes_tenant ON training_outcomes(newsroom_id);
