-- 103_tracker_auto_add.sql
-- The daily governance briefing finds real, source-cited developments via web
-- search. Paul's ask: developments that are lawsuits or regulations should be
-- ADDED to the tracker automatically (so it stops going stale), then reviewed in
-- an admin section and removed if wrong. These columns mark auto-added rows and
-- carry their review state (post-moderation: live immediately, pruned if needed).
-- Additive + reversible.

ALTER TABLE ai_lawsuits     ADD COLUMN IF NOT EXISTS auto_added    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ai_lawsuits     ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'pending';  -- 'pending'|'kept'
ALTER TABLE ai_lawsuits     ADD COLUMN IF NOT EXISTS source_origin VARCHAR(40);                              -- e.g. 'governance_today'

ALTER TABLE ai_regulations  ADD COLUMN IF NOT EXISTS auto_added    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ai_regulations  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE ai_regulations  ADD COLUMN IF NOT EXISTS source_origin VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_ai_lawsuits_auto    ON ai_lawsuits(auto_added, review_status) WHERE auto_added;
CREATE INDEX IF NOT EXISTS idx_ai_regulations_auto ON ai_regulations(auto_added, review_status) WHERE auto_added;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ai_lawsuits_auto; DROP INDEX IF EXISTS idx_ai_regulations_auto;
--   ALTER TABLE ai_lawsuits    DROP COLUMN IF EXISTS auto_added, DROP COLUMN IF EXISTS review_status, DROP COLUMN IF EXISTS source_origin;
--   ALTER TABLE ai_regulations DROP COLUMN IF EXISTS auto_added, DROP COLUMN IF EXISTS review_status, DROP COLUMN IF EXISTS source_origin;
--   DELETE FROM migrations WHERE name='103_tracker_auto_add.sql';
