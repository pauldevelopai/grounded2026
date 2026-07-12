-- 140_intake_forms_agenda.sql — link a Google form (the "before" intake survey or the
-- "after" feedback survey) to a specific training (agenda), so the BE AI READY Training
-- workspace can group participants / feedback per training instead of pooling every
-- form at the client level. NULL = not linked to a training (company-wide / legacy).
-- ON DELETE SET NULL so deleting a training never deletes its collected responses.
ALTER TABLE intake_forms
  ADD COLUMN IF NOT EXISTS agenda_id UUID REFERENCES training_agendas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intake_forms_agenda ON intake_forms(agenda_id);
