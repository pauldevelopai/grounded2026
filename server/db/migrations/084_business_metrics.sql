-- 084_business_metrics.sql
-- BE AI READY — the five productivity metrics (brochure p5; no surveillance).
-- Entered data only (client or admin); the dashboard shows an em-dash until a
-- value exists. Never computed/fabricated. Reversible.
CREATE TABLE IF NOT EXISTS business_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  metric VARCHAR(30) NOT NULL,  -- deliverables|revenue|time_spent|ai_hours_saved|client_outcomes
  value NUMERIC,
  period VARCHAR(20),           -- e.g. '2026-06' or '2026-W24'
  note TEXT,
  entered_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bmetrics_tenant ON business_metrics(newsroom_id);

-- ROLLBACK: DROP TABLE IF EXISTS business_metrics; DELETE FROM migrations WHERE name='084_business_metrics.sql';
