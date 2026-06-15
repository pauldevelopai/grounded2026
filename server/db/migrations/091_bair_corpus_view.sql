-- 091_bair_corpus_view.sql
-- The ONLY surface corpus/analytics code may read. Sealed + client_only rows
-- never appear; BetterBoss (bb_*) is structurally excluded.
CREATE OR REPLACE VIEW bair.corpus_findings AS
SELECT f.id, f.pillar, f.finding_type, f.severity, f.data_class,
       f.source, f.confidence,
       a.sector_id, a.company_size, a.region, f.is_baseline, f.created_at
FROM bair.findings f
JOIN bair.audits a ON a.id = f.audit_id
WHERE f.consent_scope = 'anonymised_corpus_ok';
