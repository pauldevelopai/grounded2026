-- 137_beaiready_knowhow_assistant.sql
-- Bespoke-per-client AI persona for KnowHow. A consultant picks a use-case preset at
-- onboarding, which seeds a per-tenant assistant instruction (then hand-tunable). The
-- instruction is spliced into the company AI's system prompt — it shapes the assistant's
-- role/expertise/tone only; grounding + privacy rules are unchanged. Config over forking:
-- one KnowHow engine, per-client behaviour driven by data.

ALTER TABLE beaiready_knowhow_settings ADD COLUMN IF NOT EXISTS assistant_instructions TEXT;
ALTER TABLE beaiready_knowhow_settings ADD COLUMN IF NOT EXISTS use_case TEXT;

-- ROLLBACK:
-- ALTER TABLE beaiready_knowhow_settings DROP COLUMN IF EXISTS assistant_instructions, DROP COLUMN IF EXISTS use_case;
-- DELETE FROM migrations WHERE name = '137_beaiready_knowhow_assistant.sql';
