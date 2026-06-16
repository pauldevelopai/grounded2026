-- 097_beaiready_agenda_docs_strategy.sql
-- BE AI READY Training & Strategy, two additive changes (Paul's admin review):
--   1. A training agenda can carry a DOCUMENT — either a Google Doc (re-syncable
--      to pull its current text) or an uploaded PDF (stored via uploaded_documents).
--   2. The AI strategy is now a set of structured ITEMS (goals + automation roadmap),
--      not a free-form outcome document. training_outcomes stays untouched (legacy,
--      no longer surfaced) so nothing breaks; strategy moves to its own table.
-- Additive + reversible. public.* unchanged.

-- ── 1. Agenda document attachment ────────────────────────────────────────────────
ALTER TABLE training_agendas ADD COLUMN IF NOT EXISTS doc_kind     VARCHAR(20);   -- 'gdoc' | 'pdf' | NULL
ALTER TABLE training_agendas ADD COLUMN IF NOT EXISTS doc_url      TEXT;          -- Google Doc link (gdoc)
ALTER TABLE training_agendas ADD COLUMN IF NOT EXISTS doc_name     TEXT;          -- display name / original filename
ALTER TABLE training_agendas ADD COLUMN IF NOT EXISTS doc_file_id  UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL;  -- uploaded PDF
ALTER TABLE training_agendas ADD COLUMN IF NOT EXISTS doc_synced_text TEXT;       -- extracted Google-Doc text (display/search)
ALTER TABLE training_agendas ADD COLUMN IF NOT EXISTS doc_synced_at   TIMESTAMPTZ;

-- ── 2. Strategy items (goals + automation roadmap) ───────────────────────────────
-- Each item is a goal ('what the business wants from AI') or an automation roadmap
-- step ('what to automate', sized by effort/payoff). Clients see 'published' items.
CREATE TABLE IF NOT EXISTS training_strategy_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id   UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  kind          VARCHAR(20) NOT NULL DEFAULT 'goal',     -- 'goal' | 'automation'
  title         TEXT NOT NULL,
  detail        TEXT,
  effort        VARCHAR(10),    -- 'low'|'medium'|'high'  (automation sizing; NULL for goals)
  payoff        VARCHAR(10),    -- 'low'|'medium'|'high'
  order_index   INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',     -- 'draft'|'published'
  rag_shareable BOOLEAN NOT NULL DEFAULT false,           -- strategy is client-specific: default OFF
  rag_synced    BOOLEAN NOT NULL DEFAULT false,
  knowledge_id  UUID,
  created_by    UUID REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_strategy_items_tenant ON training_strategy_items(newsroom_id);

-- ROLLBACK:
--   DROP TABLE IF EXISTS training_strategy_items;
--   ALTER TABLE training_agendas
--     DROP COLUMN IF EXISTS doc_kind, DROP COLUMN IF EXISTS doc_url,
--     DROP COLUMN IF EXISTS doc_name, DROP COLUMN IF EXISTS doc_file_id,
--     DROP COLUMN IF EXISTS doc_synced_text, DROP COLUMN IF EXISTS doc_synced_at;
--   DELETE FROM migrations WHERE name='097_beaiready_agenda_docs_strategy.sql';
