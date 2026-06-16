-- 105_training_links.sql
-- Tie the Training & Strategy pieces together on a timeline (Paul's review):
--   • a material can belong to a specific training/agenda (which carries the date),
--   • a goal / automation item can link to a training AND/OR carry its own target
--     date — giving the strategy a sense of time.
-- Sections stay flat; these are the links. Additive + reversible.

ALTER TABLE training_materials       ADD COLUMN IF NOT EXISTS agenda_id   UUID REFERENCES training_agendas(id) ON DELETE SET NULL;
ALTER TABLE training_strategy_items  ADD COLUMN IF NOT EXISTS agenda_id   UUID REFERENCES training_agendas(id) ON DELETE SET NULL;
ALTER TABLE training_strategy_items  ADD COLUMN IF NOT EXISTS target_date DATE;

CREATE INDEX IF NOT EXISTS idx_training_materials_agenda      ON training_materials(agenda_id);
CREATE INDEX IF NOT EXISTS idx_training_strategy_items_agenda ON training_strategy_items(agenda_id);

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_training_materials_agenda; DROP INDEX IF EXISTS idx_training_strategy_items_agenda;
--   ALTER TABLE training_materials      DROP COLUMN IF EXISTS agenda_id;
--   ALTER TABLE training_strategy_items DROP COLUMN IF EXISTS agenda_id, DROP COLUMN IF EXISTS target_date;
--   DELETE FROM migrations WHERE name='105_training_links.sql';
