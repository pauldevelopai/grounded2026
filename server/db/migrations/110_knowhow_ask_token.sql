-- 110_knowhow_ask_token.sql
-- KnowHow Part C — the junior-facing ask surface. A per-tenant, login-free token
-- that lets employees ask the corpus (coaching mode) WITHOUT an admin login — the
-- same unguessable-link pattern as capture, but for the answer side. The admin
-- generates/rotates it; juniors open /knowhow/ask/<token>. Additive + reversible.
ALTER TABLE knowhow.tenants ADD COLUMN IF NOT EXISTS ask_token TEXT UNIQUE;

-- ROLLBACK:
--   ALTER TABLE knowhow.tenants DROP COLUMN IF EXISTS ask_token;
--   DELETE FROM migrations WHERE name='110_knowhow_ask_token.sql';
