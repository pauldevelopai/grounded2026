-- 082_beaiready_tenants.sql
-- BE AI READY — businesses join the existing tenancy (see BEAIREADY spec Part A).
-- Additive: newsroom tenants and ALL existing behaviour unchanged. `kind`
-- defaults to 'newsroom' so every current row stays exactly what it was.
-- Reversible (rollback at the bottom).

ALTER TABLE newsrooms ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'newsroom';
ALTER TABLE newsrooms ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id);
CREATE INDEX IF NOT EXISTS idx_newsrooms_kind ON newsrooms(kind);

-- ── Tenant zero: Leads 2 Business (l2b.co.za) ──────────────────────────────
-- L2B is TWO linked rows: an organisation (the CRM/engagements FK target that
-- the BusinessDashboard reads trainings from) and a tenant (login/scoping).
-- organisations.sector_id is NOT NULL, so first ensure a "Business" sector for
-- BE AI READY client orgs (idempotent; terracotta to match the brand).
INSERT INTO sectors (name, slug, colour, description)
SELECT 'Business', 'business', '#c75b39', 'BE AI READY client businesses (SMEs).'
WHERE NOT EXISTS (SELECT 1 FROM sectors WHERE slug = 'business');

-- The org, idempotent (organisations has no unique constraint on name).
INSERT INTO organisations (name, type, country, website, notes, sector_id)
SELECT 'Leads 2 Business', 'client', 'South Africa', 'https://l2b.co.za',
       'BE AI READY tenant zero. Construction & tender intelligence.',
       (SELECT id FROM sectors WHERE slug = 'business')
WHERE NOT EXISTS (SELECT 1 FROM organisations WHERE name = 'Leads 2 Business');

INSERT INTO newsrooms (name, slug, kind, organisation_id)
SELECT 'Leads 2 Business', 'l2b', 'business', o.id
FROM organisations o
WHERE o.name = 'Leads 2 Business'
ON CONFLICT (slug) DO UPDATE
  SET kind = 'business',
      organisation_id = EXCLUDED.organisation_id;

-- The L2B user (login) is NOT seeded here — passwords don't belong in committed
-- SQL. It's created separately (spec Part A2) with a temp password Paul hands
-- over, newsroom_id = the L2B tenant, role 'member'.

-- ============================================================================
-- ROLLBACK (manual):
--   DELETE FROM newsrooms WHERE slug = 'l2b';
--   DELETE FROM organisations WHERE name = 'Leads 2 Business';  -- only if no engagements FK it
--   DROP INDEX IF EXISTS idx_newsrooms_kind;
--   ALTER TABLE newsrooms DROP COLUMN IF EXISTS organisation_id;
--   ALTER TABLE newsrooms DROP COLUMN IF EXISTS kind;
--   DELETE FROM migrations WHERE name = '082_beaiready_tenants.sql';
-- ============================================================================
