-- 118_knowhow_link_promote.sql
-- Connect the consultant-driven KnowHow capture to the business it's about, so its
-- vetted knowledge can feed that client's AI. KnowHow tenants were standalone (no link
-- to a BAIR newsroom); now a consultant links a KnowHow tenant to a client, and can
-- promote a good response into that client's company knowledge — the store the
-- workspace AND strategy AI already read. Promotion stays a deliberate consultant act
-- (keeps the corpus truthful + relevant), and is tracked so it isn't done twice.

ALTER TABLE knowhow.tenants
  ADD COLUMN IF NOT EXISTS newsroom_id UUID REFERENCES newsrooms(id) ON DELETE SET NULL;

-- Which company-knowledge row a response was promoted into (null = not promoted).
ALTER TABLE knowhow.responses
  ADD COLUMN IF NOT EXISTS promoted_source_id UUID;

-- ROLLBACK:
--   ALTER TABLE knowhow.tenants   DROP COLUMN IF EXISTS newsroom_id;
--   ALTER TABLE knowhow.responses DROP COLUMN IF EXISTS promoted_source_id;
