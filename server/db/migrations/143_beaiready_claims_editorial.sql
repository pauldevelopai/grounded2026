-- 143_beaiready_claims_editorial.sql — Phase 3. Journalist control over the AI's work:
-- a claim carries a workflow status and reporter notes; a verdict can be LOCKED (a human
-- decision the verifier must never overwrite); the verifier records a confidence; and
-- evidence can be human-authored — a COUNTERCLAIM (an opposing statement logged against a
-- claim), kept distinct from AI-retrieved passages and preserved across re-verification.

ALTER TABLE beaiready_claim_checks ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'open';   -- open | needs_reporting | disputed | resolved
ALTER TABLE beaiready_claim_checks ADD COLUMN IF NOT EXISTS locked     BOOLEAN NOT NULL DEFAULT false; -- human-set verdict; the verifier leaves it alone
ALTER TABLE beaiready_claim_checks ADD COLUMN IF NOT EXISTS confidence REAL;                           -- 0..1, from the verifier
ALTER TABLE beaiready_claim_checks ADD COLUMN IF NOT EXISTS notes      TEXT;                           -- encrypted reporter notes

ALTER TABLE beaiready_claim_evidence ADD COLUMN IF NOT EXISTS manual     BOOLEAN NOT NULL DEFAULT false; -- human-added (counterclaim / note), survives re-verify
ALTER TABLE beaiready_claim_evidence ADD COLUMN IF NOT EXISTS created_by UUID;

-- ROLLBACK:
-- ALTER TABLE beaiready_claim_checks DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS locked, DROP COLUMN IF EXISTS confidence, DROP COLUMN IF EXISTS notes;
-- ALTER TABLE beaiready_claim_evidence DROP COLUMN IF EXISTS manual, DROP COLUMN IF EXISTS created_by;
-- DELETE FROM migrations WHERE name = '143_beaiready_claims_editorial.sql';
