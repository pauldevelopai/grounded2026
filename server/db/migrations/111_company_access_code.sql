-- 111_company_access_code.sql
-- Self-registration gated by a per-company access code (Paul, 2026-06-24). A new
-- user signs up with their own email + password, picks their company, and must
-- enter that company's shared access code — so nobody can join a company they're
-- not part of and see its Be AI Ready details. The code is stored HASHED (bcrypt),
-- never in plaintext; an admin sets/rotates it per company. NULL = the company is
-- not open for self-registration. Additive + reversible.
ALTER TABLE newsrooms ADD COLUMN IF NOT EXISTS access_code_hash TEXT;

-- ROLLBACK:
--   ALTER TABLE newsrooms DROP COLUMN IF EXISTS access_code_hash;
--   DELETE FROM migrations WHERE name='111_company_access_code.sql';
