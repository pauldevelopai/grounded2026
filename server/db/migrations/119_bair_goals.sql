-- 119_bair_goals.sql
-- The Measurement pillar, for real. The vision: agree clear goals at the START —
-- how much time will be saved, cost cut, capability gained — then measure the results
-- against them. A goal is a measurable target (baseline → target by a date), optionally
-- tied to one of the five business metrics the client already tracks, so progress is
-- read straight off their latest reading. The consultant sets goals (control stays with
-- them); the client sees the goals and how they're tracking.
CREATE TABLE IF NOT EXISTS bair_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  detail TEXT,
  metric VARCHAR(30),            -- optional: one of deliverables|revenue|time_spent|ai_hours_saved|client_outcomes
  unit VARCHAR(30),              -- e.g. 'hours/month', 'ZAR', '%'
  baseline NUMERIC,
  target NUMERIC,
  current_value NUMERIC,         -- manual reading; else derived from the latest metric
  target_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active'|'achieved'|'archived'
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bair_goals_nr ON bair_goals(newsroom_id, status);

-- ROLLBACK: DROP TABLE IF EXISTS bair_goals;
