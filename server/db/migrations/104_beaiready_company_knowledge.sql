-- 104_beaiready_company_knowledge.sql
-- Per-client "company knowledge" the consultant feeds the system so it can reason
-- about the specific business: uploaded docs, a scraped website, or a typed note.
-- The extracted text is the context behind the AI strategy/automation suggestions.
-- Internal (admin-only); never shown in the client portal. Additive + reversible.
CREATE TABLE IF NOT EXISTS beaiready_company_sources (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id    UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  kind           VARCHAR(20) NOT NULL,           -- 'doc' | 'website' | 'note'
  title          TEXT,
  url            TEXT,                            -- website URL (kind='website')
  file_id        UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,  -- uploaded doc
  extracted_text TEXT,                            -- the content the AI reads
  created_by     UUID REFERENCES team_members(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_beaiready_company_sources_tenant ON beaiready_company_sources(newsroom_id);

-- ROLLBACK:
--   DROP TABLE IF EXISTS beaiready_company_sources;
--   DELETE FROM migrations WHERE name='104_beaiready_company_knowledge.sql';
