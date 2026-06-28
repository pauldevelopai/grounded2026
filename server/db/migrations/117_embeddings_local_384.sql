-- 117_embeddings_local_384.sql
-- Revert RAG embeddings to the LOCAL, self-hosted all-MiniLM-L6-v2 (384-dim) model.
-- The platform is Anthropic-only — Claude for generation — and owns its embeddings,
-- with no OpenAI (or any external embedding API) dependency. The 1536-dim OpenAI
-- vectors are dimensionally incompatible, so drop + recreate the columns (NULLing all
-- embeddings); the embedding-backfill job then re-populates them with the local model.
-- (Mirrors 071 in reverse, and includes bair_interactions added since.)

DROP INDEX IF EXISTS idx_knowledge_embedding;
DROP INDEX IF EXISTS idx_intelligence_embedding;
DROP INDEX IF EXISTS idx_bair_interactions_embedding;

ALTER TABLE knowledge_entries     DROP COLUMN IF EXISTS embedding;
ALTER TABLE knowledge_entries     ADD COLUMN embedding vector(384);
ALTER TABLE industry_intelligence DROP COLUMN IF EXISTS embedding;
ALTER TABLE industry_intelligence ADD COLUMN embedding vector(384);
ALTER TABLE bair_interactions     DROP COLUMN IF EXISTS embedding;
ALTER TABLE bair_interactions     ADD COLUMN embedding vector(384);

-- HNSW (cosine) for all three.
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding        ON knowledge_entries     USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_intelligence_embedding     ON industry_intelligence USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_bair_interactions_embedding ON bair_interactions    USING hnsw (embedding vector_cosine_ops);
