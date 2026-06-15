-- 092_bair_seed.sql
-- Hand-set scoring priors + first sector questionnaire (financial services).
-- These are starting values; the reweighting mechanism updates source='learned' later.
-- Resolve the financial-services sector id from public.sectors by slug; if it
-- doesn't exist, create it.

DO $$
DECLARE fs_id UUID;
BEGIN
  SELECT id INTO fs_id FROM public.sectors WHERE slug = 'financial-services';
  IF fs_id IS NULL THEN
    INSERT INTO public.sectors (name, slug, description, colour)
    VALUES ('Financial Services', 'financial-services', 'Banks, insurers, fintech, advisors', '#1f6f54')
    RETURNING id INTO fs_id;
  END IF;

  -- ── Scoring priors (global defaults; higher weight = more damaging to readiness) ──
  INSERT INTO bair.score_weights (pillar, finding_type, weight, source, sector_id) VALUES
    ('security',     'pii_to_public_model',         5.0, 'prior', NULL),
    ('security',     'shadow_tool',                 3.0, 'prior', NULL),
    ('security',     'no_human_in_loop',            3.5, 'prior', NULL),
    ('security',     'unverified_output_published', 4.0, 'prior', NULL),
    ('governance',   'no_ai_policy',                4.0, 'prior', NULL),
    ('governance',   'no_accountability_owner',     3.0, 'prior', NULL),
    ('governance',   'regulatory_exposure',         4.5, 'prior', NULL),
    ('visibility',   'misrepresented_by_ai',        2.5, 'prior', NULL),
    ('visibility',   'invisible_to_ai',             2.0, 'prior', NULL),
    ('capability',   'no_training',                 2.0, 'prior', NULL),
    ('capability',   'no_champion',                 1.5, 'prior', NULL),
    ('usage',        'inconsistent_prompting',      1.5, 'prior', NULL),
    ('usage',        'unused_paid_tool',            1.0, 'prior', NULL)
  ON CONFLICT (pillar, finding_type, sector_id, source) DO NOTHING;

  -- Sector override: regulatory exposure hits financial services harder.
  INSERT INTO bair.score_weights (pillar, finding_type, weight, source, sector_id) VALUES
    ('governance',   'regulatory_exposure',         6.0, 'prior', fs_id),
    ('security',     'pii_to_public_model',         6.0, 'prior', fs_id)
  ON CONFLICT (pillar, finding_type, sector_id, source) DO NOTHING;

  -- ── First questionnaire: financial services ──
  INSERT INTO bair.questions (pillar, sector_id, question_text, question_type, options, maps_to_finding, order_index) VALUES
    ('security', fs_id, 'Do staff ever paste client or customer data into public AI tools (ChatGPT, Claude, Gemini) on free/personal accounts?',
      'single_select', '["No, never","Occasionally / unsure","Yes, regularly"]', 'pii_to_public_model', 1),
    ('security', fs_id, 'Are there AI tools in use that were not approved or procured by management?',
      'single_select', '["None known","A few","Many / widespread"]', 'shadow_tool', 2),
    ('security', fs_id, 'Is AI-generated output reviewed by a person before it reaches clients or goes on record?',
      'single_select', '["Always","Sometimes","Rarely / never"]', 'no_human_in_loop', 3),
    ('governance', fs_id, 'Does the organisation have a written, shared AI use policy?',
      'single_select', '["Yes, enforced","Informal / unwritten","None"]', 'no_ai_policy', 4),
    ('governance', fs_id, 'Is there a named person accountable for AI use and its risks?',
      'single_select', '["Yes","No","Unsure"]', 'no_accountability_owner', 5),
    ('governance', fs_id, 'Have you assessed AI use against POPIA and FSCA / Prudential Authority expectations?',
      'single_select', '["Yes, documented","Partially","Not yet"]', 'regulatory_exposure', 6),
    ('capability', fs_id, 'Have staff had any structured AI training?',
      'single_select', '["Yes, recent","Once / informal","None"]', 'no_training', 7),
    ('usage', fs_id, 'Are paid AI tools/licences actually used by the people they were bought for?',
      'single_select', '["Mostly used","Partly","Largely unused"]', 'unused_paid_tool', 8)
  ON CONFLICT DO NOTHING;
END $$;
