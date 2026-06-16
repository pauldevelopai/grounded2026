-- 099_toolkit_reviews.sql
-- Tool reviews for the BE AI READY toolbox (a rebuild of AIKit's reviews):
-- a logged-in user rates a tool 1–5 with an optional comment + use-case, others
-- vote a review helpful, and anyone can flag a review for admin moderation.
-- One review per user per tool (they can edit it). Reviews are visible unless
-- an admin hides them.

CREATE TABLE IF NOT EXISTS tool_reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_slug     VARCHAR(200) NOT NULL REFERENCES tools(slug) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  use_case      TEXT,
  is_hidden     BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tool_slug, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tool_reviews_slug ON tool_reviews(tool_slug) WHERE is_hidden = FALSE;

CREATE TABLE IF NOT EXISTS review_votes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id  UUID NOT NULL REFERENCES tool_reviews(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_flags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id   UUID NOT NULL REFERENCES tool_reviews(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reason      TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, user_id)
);
