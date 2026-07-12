-- 141_beaiready_claims_entities.sql — Phase 1 of the months-long claims/counterclaims
-- database. Turns claims into DURABLE ENTITIES (an embedding lets near-identical claims
-- collapse to one instead of proliferating as text re-phrasings), LINKS each verdict to
-- the concrete evidence passages it rests on (stance + a frozen, encrypted quote that a
-- later source edit can't silently rewrite), and keeps an APPEND-ONLY per-claim history
-- so you can see when a verdict changed and what evidence changed it. Additive to 139.

-- The claim entity (beaiready_claim_checks from 139) gains an embedding for semantic
-- dedupe and a verified_at stamp (distinct from updated_at, which any edit touches).
ALTER TABLE beaiready_claim_checks ADD COLUMN IF NOT EXISTS embedding   vector(384);
ALTER TABLE beaiready_claim_checks ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Evidence: one row per (claim, source passage) the verdict rests on. Quote is frozen at
-- verdict time and stored ENCRYPTED (per-tenant), like every other extracted text.
CREATE TABLE IF NOT EXISTS beaiready_claim_evidence (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  claim_id    UUID NOT NULL REFERENCES beaiready_claim_checks(id) ON DELETE CASCADE,
  source_id   UUID REFERENCES beaiready_company_sources(id) ON DELETE SET NULL,
  role        TEXT,                                 -- reporting | external (evidence's source role)
  stance      TEXT NOT NULL DEFAULT 'context',      -- supports | contradicts | context
  quote       TEXT,                                 -- encrypted passage, frozen at verdict time
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim  ON beaiready_claim_evidence (claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_source ON beaiready_claim_evidence (source_id);

-- Append-only per-claim history: creation, verdict changes, re-verifications.
CREATE TABLE IF NOT EXISTS beaiready_claim_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  claim_id    UUID NOT NULL REFERENCES beaiready_claim_checks(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,                        -- created | verdict_changed | reverified
  old_verdict TEXT,
  new_verdict TEXT,
  rationale   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- citations snapshot, evidence counts, etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_claim_events_claim ON beaiready_claim_events (claim_id, created_at);

-- ROLLBACK:
-- DROP TABLE IF EXISTS beaiready_claim_evidence; DROP TABLE IF EXISTS beaiready_claim_events;
-- ALTER TABLE beaiready_claim_checks DROP COLUMN IF EXISTS embedding, DROP COLUMN IF EXISTS verified_at;
-- DELETE FROM migrations WHERE name = '141_beaiready_claims_entities.sql';
