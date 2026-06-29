-- 123_governance_corpus.sql
-- BE AI READY · Governance Knowledge Engine — make knowledge_entries able to hold
-- CHUNKED governance documents, and register the governance AI functions so they
-- ground in the global 'ai_governance' corpus. Additive + reversible.

-- Chunk grouping: long governance docs are split into small (<=~256-token) chunks —
-- the embedding model's real limit; larger chunks lose their tail from the vector —
-- one knowledge_entries row each. These columns group chunks back to their source
-- document and let retrieval filter by framework/jurisdiction.
ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS parent_document_id UUID,
  ADD COLUMN IF NOT EXISTS chunk_index        INTEGER,
  ADD COLUMN IF NOT EXISTS framework          VARCHAR(40),   -- 'eu_ai_act'|'nist_ai_rmf'|'iso_42001'|'popia'|'oecd'|...
  ADD COLUMN IF NOT EXISTS jurisdiction       VARCHAR(60);
CREATE INDEX IF NOT EXISTS idx_knowledge_parent    ON knowledge_entries(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_framework ON knowledge_entries(framework);

-- Ground the governance AI functions in the global 'ai_governance' corpus.
-- buildEnrichedSystemPrompt (knowledge.js) reads prompt_templates by function_name; a
-- row here makes the function retrieve category='ai_governance' instead of the default
-- categoryMap. base_prompt is a fallback only — the routes pass their own system prompt.
INSERT INTO prompt_templates (function_name, base_prompt, knowledge_query, is_active) VALUES
  ('governance_risk_classify',
   'Classify an AI system''s risk tier under the EU AI Act four-level model (unacceptable | high | limited | minimal), grounded in the cited governance sources. Generated guidance, not legal advice — verify with counsel.',
   '{"categories":["ai_governance"],"max_entries":6}'::jsonb, true),
  ('governance_controls_suggest',
   'Propose concrete AI governance controls for a system, grounded in the cited frameworks (NIST AI RMF, ISO/IEC 42001 Annex A). Generated guidance, not legal advice — verify with counsel.',
   '{"categories":["ai_governance"],"max_entries":6}'::jsonb, true),
  ('governance_policy',
   'Draft a business AI-use policy derived from the organisation''s own AI register, risk tiers and adopted controls, grounded in current law and frameworks from the cited sources. Generated guidance, not legal advice — verify with counsel.',
   '{"categories":["ai_governance"],"max_entries":8}'::jsonb, true)
ON CONFLICT (function_name) DO NOTHING;

-- ROLLBACK:
--   ALTER TABLE knowledge_entries
--     DROP COLUMN IF EXISTS parent_document_id, DROP COLUMN IF EXISTS chunk_index,
--     DROP COLUMN IF EXISTS framework, DROP COLUMN IF EXISTS jurisdiction;
--   DROP INDEX IF EXISTS idx_knowledge_parent; DROP INDEX IF EXISTS idx_knowledge_framework;
--   DELETE FROM prompt_templates WHERE function_name IN
--     ('governance_risk_classify','governance_controls_suggest','governance_policy');
--   DELETE FROM migrations WHERE name='123_governance_corpus.sql';
