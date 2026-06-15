-- 096_prompt_library.sql
-- Living, model-aware prompt library (Productivity section). Curated prompts
-- (global or per-tenant), per-model validations, per-user variants, and a
-- feedback/curation loop.
--
-- House-style notes (brief vs repo):
--  • tenant boundary is newsroom_id (the brief's "organisation_id"): NULL = a
--    global seed visible to every tenant; set = that tenant's own prompt.
--  • multi-value `roles` uses JSONB (matches tools.categories), not a join table.
--  • forward-only per house style; rollback in server/db/rollbacks/096_*.sql.
--  • "proven" is only ever set by the promptfoo validation script — never seeded.

-- ── Curated library ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id       UUID REFERENCES newsrooms(id) ON DELETE CASCADE,   -- NULL = global seed
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  description       TEXT,
  task_type         VARCHAR(20) NOT NULL DEFAULT 'other',   -- extract|summarise|draft|research|format|other
  roles             JSONB NOT NULL DEFAULT '[]'::jsonb,      -- researcher|boq_processor|admin|finance|it|general
  source            VARCHAR(20) NOT NULL,                    -- vendor|wharton|develop_ai|user_promoted
  attribution       TEXT,                                    -- REQUIRED for source='wharton' (enforced in code/seed)
  validation_status VARCHAR(10) NOT NULL DEFAULT 'draft',    -- proven|draft|pending
  example_input     TEXT,
  example_output    TEXT,
  created_by        UUID REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompts_newsroom ON prompts(newsroom_id);
CREATE INDEX IF NOT EXISTS idx_prompts_task     ON prompts(task_type);
CREATE INDEX IF NOT EXISTS idx_prompts_status   ON prompts(validation_status);
CREATE INDEX IF NOT EXISTS idx_prompts_source   ON prompts(source);

-- ── Per-model validations (one prompt → many models) ────────────────────────
CREATE TABLE IF NOT EXISTS prompt_model_validations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id    UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  model_key    VARCHAR(20) NOT NULL,    -- stable key: claude|gpt|gemini|copilot|meta|other
  model_label  TEXT,                    -- display name, e.g. 'Claude'
  rating       NUMERIC(5,2),            -- 0–100 score from the validation run
  band         VARCHAR(12),             -- excellent|good|fair|poor (derived from rating)
  status       VARCHAR(12) NOT NULL DEFAULT 'untested',  -- validated|untested|failed
  evidence     JSONB,                   -- promptfoo run reference / summary
  validated_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_id, model_key)
);
CREATE INDEX IF NOT EXISTS idx_pmv_prompt_model ON prompt_model_validations(prompt_id, model_key);

-- ── A user's personal copy / cheat-sheet ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_prompt_variants (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  source_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  notes            TEXT,
  preferred_model  VARCHAR(20),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variants_user ON user_prompt_variants(user_id);

-- ── The learning signal ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_feedback (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id      UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  model_key      VARCHAR(20),            -- which model they used it on
  rating         SMALLINT,               -- 1–5 (thumbs map to 1/5)
  comment        TEXT,
  suggested_edit TEXT,                   -- a user-proposed improved body
  status         VARCHAR(12) NOT NULL DEFAULT 'new',  -- new|reviewed|promoted|dismissed
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_prompt ON prompt_feedback(prompt_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user   ON prompt_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON prompt_feedback(status);
