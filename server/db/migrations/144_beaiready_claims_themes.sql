-- 144_beaiready_claims_themes.sql — Phase 4. Themes/tags let claims be organised and
-- filtered ACROSS mines (water, rehabilitation, employment, safety…), so a months-long
-- corpus stays navigable and exportable. The verifier proposes themes; editors can edit
-- them. A status index keeps the cross-mine Database view fast.

ALTER TABLE beaiready_claim_checks ADD COLUMN IF NOT EXISTS themes JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_claim_checks_status ON beaiready_claim_checks (newsroom_id, status);

-- ROLLBACK:
-- ALTER TABLE beaiready_claim_checks DROP COLUMN IF EXISTS themes;
-- DROP INDEX IF EXISTS idx_claim_checks_status;
-- DELETE FROM migrations WHERE name = '144_beaiready_claims_themes.sql';
