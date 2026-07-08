-- 133_beaiready_source_chunks.sql
-- Deep document processing for KnowHow. Each company knowledge source (doc/website/
-- note) is split into ~170-word chunks, each embedded to a LOCAL 384-dim vector (same
-- all-MiniLM-L6-v2 model as knowledge_entries) and stored ENCRYPTED per newsroom. The
-- company AI then retrieves the best-matching PASSAGES across ALL of a business's
-- sources — instead of the first ~2400 chars of the 8 newest — so long/many PDFs are
-- genuinely searchable. Plus per-document controls on the source itself.

CREATE TABLE IF NOT EXISTS beaiready_source_chunks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id   UUID NOT NULL REFERENCES beaiready_company_sources(id) ON DELETE CASCADE,
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  chunk_index INT  NOT NULL,
  text_chunk  TEXT NOT NULL,        -- encrypted via encryptFor(newsroom_id, ...)
  embedding   vector(384),          -- NULL until embedded; the backfill job fills it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_source_chunks_newsroom  ON beaiready_source_chunks (newsroom_id);
CREATE INDEX IF NOT EXISTS idx_source_chunks_source    ON beaiready_source_chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_source_chunks_embedding ON beaiready_source_chunks USING hnsw (embedding vector_cosine_ops);

-- Per-document controls: exclude a source from the AI, or flag it sensitive (also
-- excluded). Grounding-eligible = included AND NOT sensitive.
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS included  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE beaiready_company_sources ADD COLUMN IF NOT EXISTS sensitive BOOLEAN NOT NULL DEFAULT false;

-- ROLLBACK:
-- DROP TABLE IF EXISTS beaiready_source_chunks;
-- ALTER TABLE beaiready_company_sources DROP COLUMN IF EXISTS included;
-- ALTER TABLE beaiready_company_sources DROP COLUMN IF EXISTS sensitive;
-- DELETE FROM migrations WHERE name = '133_beaiready_source_chunks.sql';
