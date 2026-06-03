-- Outbound profiling questions: short multiple-choice questions WE pose to
-- logged-in users (via the third floating bubble on the public site) to build a
-- structured database about the newsrooms and people using Grounded.
-- Distinct from Pulse (Airtable, AI-generated, cadenced) — this is always-on,
-- admin-authored and Postgres-native so answers join team_members + node telemetry.

CREATE TABLE user_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt TEXT NOT NULL,
  options TEXT[] NOT NULL,            -- multiple-choice labels, in display order
  category VARCHAR(50),               -- optional grouping, e.g. 'newsroom', 'usage'
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,  -- lower = asked first
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_question_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES user_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id),
  choice TEXT NOT NULL,               -- the selected option label
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, user_id)       -- one answer per user per question
);

CREATE INDEX idx_uqr_question ON user_question_responses(question_id);
CREATE INDEX idx_uqr_user ON user_question_responses(user_id);
