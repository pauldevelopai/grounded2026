-- Newsroom Profile — a single, first-class description of the newsroom that every
-- tool and agent reads to ground its output (strengths, beats, audience, house
-- style, trusted sources). Single-org app → one row.
CREATE TABLE IF NOT EXISTS newsroom_profile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  about TEXT,
  beats TEXT,            -- the topics/beats you cover
  audience TEXT,         -- who your audience is
  strengths TEXT,        -- what you're known for / do best
  style_notes TEXT,      -- house style: tone, formatting, dos/don'ts
  trusted_sources TEXT,  -- go-to sources
  updated_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
