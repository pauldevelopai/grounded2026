-- 120_knowhow_tiers.sql
-- KnowHow tier model (Part 3): the individual base → admin-promoted company tier.
-- Everything a person contributes starts as their own private Tier-1 knowledge;
-- promotion is admin-led and the ONLY way up. Tier 3 (cross-company) lives elsewhere
-- and is reached only via Gate 2 (consent + k-anonymity) — never modelled here.
--
-- Also bridges a knowhow.person to an app team_member, so a member's OWN AI use can
-- accrue to THEIR private Tier-1 base and be surfaced back only to them.
-- Additive + reversible. Idempotent (safe if a later commit already added `tier`).

-- 1) Tier on every corpus item. Default individual; a CHECK keeps it to the two tiers
--    this layer owns (company-tier is the gate's output).
ALTER TABLE knowhow.corpus_items
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE knowhow.corpus_items DROP CONSTRAINT IF EXISTS corpus_items_tier_check;
ALTER TABLE knowhow.corpus_items
  ADD CONSTRAINT corpus_items_tier_check CHECK (tier IN ('individual','company'));

-- 2) Capture can now also come from a pooled workspace interaction the team marked useful.
ALTER TABLE knowhow.corpus_items DROP CONSTRAINT IF EXISTS corpus_items_origin_check;
ALTER TABLE knowhow.corpus_items
  ADD CONSTRAINT corpus_items_origin_check CHECK (origin IN ('response','document','interaction'));

-- 3) Backfill: anything already promoted (a response that produced a company-knowledge
--    source) is company tier; everything else stays individual.
UPDATE knowhow.corpus_items c SET tier = 'company'
  FROM knowhow.responses r
 WHERE c.origin = 'response' AND c.origin_id = r.id AND r.promoted_source_id IS NOT NULL;

-- 4) Bridge a knowhow person to the app account whose use accrues to them. Nullable:
--    consultant-entered people (Pulse targets) simply have no app account.
ALTER TABLE knowhow.people
  ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

-- 5) Adopt an existing, unlinked KnowHow tenant to its same-named newsroom — the L2B case:
--    a consultant created the 'Leads 2 Business' KnowHow tenant before the link existed.
--    Only touches still-unlinked bair tenants, so it can't move a deliberate link.
UPDATE knowhow.tenants kt
   SET newsroom_id = n.id
  FROM newsrooms n
 WHERE kt.newsroom_id IS NULL AND kt.product = 'bair' AND lower(kt.name) = lower(n.name);

CREATE INDEX IF NOT EXISTS knowhow_corpus_tier   ON knowhow.corpus_items(tenant_id, person_id, tier);
CREATE INDEX IF NOT EXISTS knowhow_people_member  ON knowhow.people(team_member_id);

-- ROLLBACK:
--   DROP INDEX IF EXISTS knowhow.knowhow_people_member;
--   DROP INDEX IF EXISTS knowhow.knowhow_corpus_tier;
--   ALTER TABLE knowhow.people DROP COLUMN IF EXISTS team_member_id;
--   ALTER TABLE knowhow.corpus_items DROP CONSTRAINT IF EXISTS corpus_items_origin_check;
--   ALTER TABLE knowhow.corpus_items ADD CONSTRAINT corpus_items_origin_check CHECK (origin IN ('response','document'));
--   ALTER TABLE knowhow.corpus_items DROP CONSTRAINT IF EXISTS corpus_items_tier_check;
--   ALTER TABLE knowhow.corpus_items DROP COLUMN IF EXISTS tier;
--   (the tenant→newsroom adoption in step 5 is left in place; reversible via 118's rollback)
--   DELETE FROM migrations WHERE name='120_knowhow_tiers.sql';
