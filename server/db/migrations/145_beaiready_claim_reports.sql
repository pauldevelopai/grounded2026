-- 145_beaiready_claim_reports.sql — Generated reports as their own accumulating record.
-- A report is a TIMESTAMPED SNAPSHOT of either the inconsistencies or the gaps, for one
-- mine or across all of them. Each generation is kept, never overwritten, so the newsroom
-- builds a series it can look back through as evidence lands: "what did we know, and when".
-- `stats` stays plaintext so the list renders without decrypting; `payload` is the full
-- snapshot and is encrypted per-tenant because it embeds evidence quotes.

CREATE TABLE IF NOT EXISTS beaiready_claim_reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id  UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  collection   TEXT,                                  -- a mine, or NULL = every mine
  kind         TEXT NOT NULL,                         -- inconsistencies | gaps
  title        TEXT NOT NULL,
  stats        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- small counts, for the list view
  payload      TEXT,                                  -- encrypted JSON snapshot (quotes evidence)
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claim_reports_scope ON beaiready_claim_reports (newsroom_id, collection, kind, generated_at DESC);

-- ROLLBACK:
-- DROP TABLE IF EXISTS beaiready_claim_reports;
-- DELETE FROM migrations WHERE name = '145_beaiready_claim_reports.sql';
