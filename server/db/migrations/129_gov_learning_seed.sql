-- 129_gov_learning_seed.sql
-- BAIR Governance Learning — seed the four learning units (Part 4).
-- See docs/BUILD_bair-governance-assess-learn.md.
--
-- The catalogue (unit_no, title, domain, summary) lives in bair.gov_learning_unit — a
-- GLOBAL catalogue, the same four units for every tenant. The section bodies + checks
-- live in client/src/pages/beaiready/govLearningContent.js (kept in sync with these rows).
-- Idempotent via UNIQUE(unit_no) → ON CONFLICT DO NOTHING; additive + reversible.

INSERT INTO bair.gov_learning_unit (unit_no, domain, title, summary) VALUES
  (1, 1, 'Foundations of AI governance',
      'What AI governance is, why it matters for your business, and who is responsible for it.'),
  (2, 2, 'Laws, standards & frameworks',
      'The laws that apply when you use AI — POPIA first — plus the frameworks that set the bar.'),
  (3, 3, 'Governing AI development',
      'Governing the AI you build or adopt — from choosing a tool to keeping it in check.'),
  (4, 4, 'Governing AI deployment & use',
      'Governing AI once it is live — deciding what is acceptable, watching it, and handling incidents.')
ON CONFLICT (unit_no) DO NOTHING;

-- ROLLBACK:
--   DELETE FROM bair.gov_learning_unit WHERE unit_no IN (1,2,3,4);
--   DELETE FROM migrations WHERE name='129_gov_learning_seed.sql';
