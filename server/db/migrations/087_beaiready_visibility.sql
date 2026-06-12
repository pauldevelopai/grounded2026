-- 087_beaiready_visibility.sql
-- BE AI READY · Visibility — "how AI sees your business" (V2 brochure p.3).
-- Each row = one probe question asked to one AI model about the tenant's
-- business, plus an assessment of how the business showed up. v1 queries Claude
-- (the key we have); `model` makes adding ChatGPT/Gemini a data change, not a
-- schema change. Reversible.
CREATE TABLE IF NOT EXISTS visibility_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL,             -- groups the checks from one scan run
  model VARCHAR(40) NOT NULL,        -- 'claude' | 'chatgpt' | 'gemini' (v1: claude)
  question TEXT NOT NULL,
  response TEXT,                     -- what the model actually said
  assessment JSONB,                  -- { present, sentiment, accuracy, summary, missing }
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visibility_tenant ON visibility_checks(newsroom_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_visibility_scan ON visibility_checks(scan_id);

-- ROLLBACK: DROP TABLE IF EXISTS visibility_checks; DELETE FROM migrations WHERE name='087_beaiready_visibility.sql';
