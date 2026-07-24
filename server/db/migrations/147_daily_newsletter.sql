-- 147_daily_newsletter.sql
-- The Daily System: governance/cyber/legal newsletter pipeline.
--
-- Two additive changes, both safe to re-run:
--   1. Newsletter classification fields on ai_legal_raw_items (Component 1).
--      These are INDEPENDENT of the existing legal `triage_*` columns — the
--      newsletter classifier is a separate pass with its own 8-category scheme,
--      so a legal-triage decision never affects newsletter selection and vice
--      versa (spec guardrail: classifier and writer are separate concerns).
--   2. A newsletter_issues table holding one structured draft per day
--      (Component 2 output; Component 4 review desk edits it in place).

-- ── 1. Classifier fields on the raw-items feed ──────────────────────────────
ALTER TABLE ai_legal_raw_items
  ADD COLUMN IF NOT EXISTS nl_in_scope         BOOLEAN,
  ADD COLUMN IF NOT EXISTS nl_category         VARCHAR(20),   -- lawsuit|fine|regulation|enforcement|breach|cyberattack|scam|policy
  ADD COLUMN IF NOT EXISTS nl_severity         SMALLINT,      -- 1..5
  ADD COLUMN IF NOT EXISTS nl_africa_relevance SMALLINT,      -- 1..5 (RANKING only, never a filter)
  ADD COLUMN IF NOT EXISTS nl_one_line         TEXT,
  ADD COLUMN IF NOT EXISTS nl_classified_at    TIMESTAMPTZ;

-- Unclassified = nl_classified_at IS NULL. Partial index keeps the
-- "find work" scan cheap once most rows are classified.
CREATE INDEX IF NOT EXISTS ai_legal_raw_items_nl_unclassified_idx
  ON ai_legal_raw_items (fetched_at DESC)
  WHERE nl_classified_at IS NULL;

-- Selection query for the writer hits (nl_in_scope, fetched_at).
CREATE INDEX IF NOT EXISTS ai_legal_raw_items_nl_inscope_idx
  ON ai_legal_raw_items (nl_in_scope, fetched_at DESC)
  WHERE nl_in_scope = true;

-- ── 2. One structured newsletter draft per day ──────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_issues (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_date        DATE NOT NULL UNIQUE,
  subject           TEXT,
  -- The structured issue object (sections[] -> stories[], see spec Component 2).
  -- Array order = display order, set by pillar ranking.
  issue_json        JSONB,
  -- Both writer passes, kept so the draft->final diff is inspectable and
  -- feeds the de-Claude tell-list tuning (Component 5).
  draft_text        TEXT,      -- call A output (pre de-Claude)
  final_text        TEXT,      -- call B output (post de-Claude); Paul edits this
  -- Paul-written promo block, carried forward unchanged between issues.
  -- NEVER AI-generated (spec guardrail). Stripped before corpus save.
  develop_ai_block  TEXT,
  -- The stories that fed this issue, denormalised so the review desk can show
  -- "source list" and Paul can check any claim in one click.
  sources           JSONB,     -- [{id,title,url,category,severity,africa_relevance,one_line}]
  image_path        TEXT,      -- relative path under uploads/newsletter/, or NULL
  image_error       TEXT,      -- populated if image generation failed (issue still ships)
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft | quiet | failed | sent
  error             TEXT,      -- populated when status='failed'
  run_log           TEXT,      -- human-readable pipeline log for the status banner
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS newsletter_issues_date_idx ON newsletter_issues (issue_date DESC);
