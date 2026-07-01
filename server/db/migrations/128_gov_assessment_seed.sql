-- 128_gov_assessment_seed.sql
-- BAIR Governance Assessment — seed the governance questions + score weights (Part 2).
-- See docs/BUILD_bair-governance-assess-learn.md.
--
-- The four AIGP governance domains are seeded as governance-pillar questions in
-- bair.questions (sector_id = NULL → global; same four domains for every tenant), with a
-- `domain` (1-4) and options authored BEST→WORST (index 0 = clean, no finding). Each maps
-- to a domain-namespaced finding_type; matching bair.score_weights priors are seeded too.
-- These are ORIGINAL questions operationalising governance practice — NOT AIGP/IAPP text.
--
-- Idempotent (guarded by maps_to_finding / finding_type) so it survives a rollback +
-- re-apply. Additive + reversible.

-- ── Governance questions (bair.questions) ───────────────────────────────────
DO $$
DECLARE q RECORD;
BEGIN
  FOR q IN SELECT * FROM (VALUES
    -- Domain 1 — Foundations of AI governance
    (1, 0, 'Does your organisation have a written, approved AI-use policy?',
        '["Yes — approved and in use","Drafted but not approved","No policy yet"]'::jsonb, 'gov_d1_no_policy'),
    (1, 1, 'Is a specific person accountable for AI governance in your organisation?',
        '["Yes — a named owner with a defined role","Someone informally, not defined","No one is accountable"]'::jsonb, 'gov_d1_no_owner'),
    (1, 2, 'Have your staff been made aware of responsible-AI principles and what is expected of them?',
        '["Yes — communicated and understood","Partially or ad hoc","Not yet"]'::jsonb, 'gov_d1_no_awareness'),
    -- Domain 2 — Laws, standards & frameworks
    (2, 0, 'Do you know which laws and regulations apply to your AI use (e.g. POPIA)?',
        '["Yes — mapped and tracked","Some awareness, not documented","No"]'::jsonb, 'gov_d2_no_law_mapping'),
    (2, 1, 'Have you classified your AI systems by risk (e.g. against the EU AI Act tiers)?',
        '["Yes — every system has a risk tier","Some are classified","None are classified"]'::jsonb, 'gov_d2_untiered_systems'),
    -- Domain 3 — Governing AI development / adoption
    (3, 0, 'Do you keep a register of the AI systems your organisation uses?',
        '["Yes — a maintained register","A partial list","No register"]'::jsonb, 'gov_d3_no_register'),
    (3, 1, 'Have you put controls or safeguards in place for your AI systems?',
        '["Yes — controls adopted and linked to systems","A few, informal","No controls"]'::jsonb, 'gov_d3_no_controls'),
    -- Domain 4 — Governing AI deployment & use
    (4, 0, 'Do you decide whether each AI tool is acceptable to use before relying on it?',
        '["Yes — each tool has an acceptability ruling","Some are reviewed","No acceptability review"]'::jsonb, 'gov_d4_no_acceptability'),
    (4, 1, 'Do you review your AI governance on a regular cadence and log those reviews?',
        '["Yes — a set cadence with logged reviews","Irregularly","No reviews"]'::jsonb, 'gov_d4_no_review'),
    (4, 2, 'Do you keep a log of AI incidents and how they were handled?',
        '["Yes — an incident log","Informally","No"]'::jsonb, 'gov_d4_no_incident_log')
  ) AS t(domain, ord, qtext, opts, ftype)
  LOOP
    INSERT INTO bair.questions (pillar, sector_id, question_text, question_type, options, maps_to_finding, domain, order_index, is_active)
    SELECT 'governance', NULL, q.qtext, 'single_select', q.opts, q.ftype, q.domain, q.ord, true
    WHERE NOT EXISTS (SELECT 1 FROM bair.questions WHERE pillar='governance' AND maps_to_finding = q.ftype);
  END LOOP;
END $$;

-- ── Score-weight priors (bair.score_weights) ────────────────────────────────
-- Global priors (sector_id = NULL). Foundational gaps weigh more. Guarded on NULL
-- sector_id (ON CONFLICT can't dedupe NULLs), so re-apply is safe.
DO $$
DECLARE w RECORD;
BEGIN
  FOR w IN SELECT * FROM (VALUES
    ('gov_d1_no_policy',       1.5),
    ('gov_d1_no_owner',        1.5),
    ('gov_d1_no_awareness',    1.0),
    ('gov_d2_no_law_mapping',  1.2),
    ('gov_d2_untiered_systems',1.2),
    ('gov_d3_no_register',     1.3),
    ('gov_d3_no_controls',     1.3),
    ('gov_d4_no_acceptability',1.2),
    ('gov_d4_no_review',       1.0),
    ('gov_d4_no_incident_log', 1.0)
  ) AS t(ftype, wt)
  LOOP
    INSERT INTO bair.score_weights (pillar, finding_type, weight, source, sector_id)
    SELECT 'governance', w.ftype, w.wt, 'prior', NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM bair.score_weights
      WHERE pillar='governance' AND finding_type=w.ftype AND source='prior' AND sector_id IS NULL);
  END LOOP;
END $$;

-- ROLLBACK:
--   DELETE FROM bair.score_weights WHERE pillar='governance' AND finding_type LIKE 'gov_d%' AND source='prior' AND sector_id IS NULL;
--   DELETE FROM bair.questions     WHERE pillar='governance' AND maps_to_finding LIKE 'gov_d%';
--   DELETE FROM migrations WHERE name='128_gov_assessment_seed.sql';
