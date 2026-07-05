-- 130_password_reset_tokens.sql
-- Forgotten-password flow (item 4). A user requests a reset by email; we issue a
-- single-use, time-limited token, email them a link, and let them set a new
-- password. The token is stored HASHED (sha256) — the raw token lives only in
-- the emailed link, so a DB leak can't be replayed. Expiry is short (1 hour).
-- Additive + reversible; no data backfill.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS reset_token_hash    TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Lookup is by token hash on the reset step; index keeps it O(1) and, being
-- partial, stays tiny (rows are non-NULL only for the ~hour a reset is pending).
CREATE INDEX IF NOT EXISTS idx_team_members_reset_token
  ON team_members (reset_token_hash)
  WHERE reset_token_hash IS NOT NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_team_members_reset_token;
--   ALTER TABLE team_members DROP COLUMN IF EXISTS reset_token_expires;
--   ALTER TABLE team_members DROP COLUMN IF EXISTS reset_token_hash;
--   DELETE FROM migrations WHERE name='130_password_reset_tokens.sql';
