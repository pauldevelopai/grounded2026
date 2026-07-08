-- 132_training_feedback_forms.sql
-- BE AI READY — training feedback. Attendees fill in a Google Form after a
-- training; the admin connects its response Sheet exactly like the Intake survey.
-- Rather than a parallel table + sync job, we tag the existing intake_forms /
-- intake_responses with a form_type so feedback reuses the whole pipeline
-- (hourly forms_sheet_sync, CSV parsing, row-hash dedupe). Existing rows are the
-- pre-training intake survey → default 'intake'. Reversible.

ALTER TABLE intake_forms     ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'intake';
ALTER TABLE intake_responses ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'intake';

CREATE INDEX IF NOT EXISTS idx_intake_forms_type     ON intake_forms(newsroom_id, form_type);
CREATE INDEX IF NOT EXISTS idx_intake_responses_type ON intake_responses(newsroom_id, form_type);

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_intake_responses_type;
--   DROP INDEX IF EXISTS idx_intake_forms_type;
--   ALTER TABLE intake_responses DROP COLUMN IF EXISTS form_type;
--   ALTER TABLE intake_forms     DROP COLUMN IF EXISTS form_type;
--   DELETE FROM migrations WHERE name='132_training_feedback_forms.sql';
