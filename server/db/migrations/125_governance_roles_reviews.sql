-- 125_governance_roles_reviews.sql
-- BE AI READY · Governance — Roles & Accountability (manual Component 5) + the Review
-- Routine and Incidents (Component 7). The named owner + the heartbeat that keeps the
-- register from going stale. Additive + reversible. Empty by design — for reviews and
-- incidents, the table's existence IS part of the system.
CREATE TABLE IF NOT EXISTS ai_governance_profile (
  newsroom_id              UUID PRIMARY KEY REFERENCES newsrooms(id) ON DELETE CASCADE,
  accountable_owner        TEXT,
  owner_role               TEXT,
  review_cadence           VARCHAR(16) DEFAULT 'quarterly',  -- 'monthly'|'quarterly'|'biannual'|'annual'
  next_review_date         DATE,
  incident_escalation_path TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id   UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  review_date   DATE,
  attendees     TEXT,
  what_checked  TEXT,
  actions       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_reviews_tenant ON ai_reviews(newsroom_id, review_date DESC);

CREATE TABLE IF NOT EXISTS ai_incidents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id   UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  occurred_at   DATE,
  what_happened TEXT NOT NULL,
  who_told      TEXT,
  action_taken  TEXT,
  status        VARCHAR(16) NOT NULL DEFAULT 'open',  -- 'open'|'resolved'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_tenant ON ai_incidents(newsroom_id, occurred_at DESC);

-- ROLLBACK:
--   DROP TABLE IF EXISTS ai_incidents;
--   DROP TABLE IF EXISTS ai_reviews;
--   DROP TABLE IF EXISTS ai_governance_profile;
--   DELETE FROM migrations WHERE name='125_governance_roles_reviews.sql';
