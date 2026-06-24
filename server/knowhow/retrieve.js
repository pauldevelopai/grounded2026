// KnowHow retrieval — Part C, C.1 (the simple, no-infra first cut). Pulls a
// tenant's CONSENTED corpus and ranks it against a question, so the agent answers
// only from knowledge people agreed to share. Deliberately NO embeddings/pgvector
// yet: for a per-tenant corpus this fits in context, and keyword ranking is honest
// and dependency-free. retrieveCorpus is the single seam to swap for vector search
// when a tenant's corpus outgrows the context window — nothing else changes.
import pool from '../db/pool.js';

const STOP = new Set('the a an and or but of to in on for with is are was were be been it this that these those you your they them his her our we us i as at by from how what when where which who why do does did will would can could should how-to into over under about'.split(' '));

function terms(s) {
  return (s || '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((w) => !STOP.has(w)) || [];
}

// Human source label for a corpus piece — what a citation points back to.
export function sourceLabel(p) {
  if (p.origin === 'document') return p.doc_title ? `Doc: ${p.doc_title}` : 'Document';
  const who = p.person_name || 'a colleague';
  return p.topic_label ? `${who} · ${p.topic_label}` : who;
}

// Return the most relevant consented pieces for a question, tenant-scoped.
//   opts: { query, topicId, limit }
export async function retrieveCorpus(tenantId, { query = '', topicId = null, limit = 40 } = {}) {
  const params = [tenantId];
  let where = 'c.tenant_id = $1 AND c.consent_ok = true';
  if (topicId) { params.push(topicId); where += ` AND c.topic_id = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT c.id, c.text, c.origin, c.person_id, c.topic_id,
            pe.name AS person_name, tp.label AS topic_label, d.title AS doc_title, c.created_at
       FROM knowhow.corpus_items c
       LEFT JOIN knowhow.people pe ON pe.id = c.person_id
       LEFT JOIN knowhow.topics tp ON tp.id = c.topic_id
       LEFT JOIN knowhow.documents d ON c.origin = 'document' AND d.id = c.origin_id
      WHERE ${where}
      ORDER BY c.created_at DESC
      LIMIT 500`, params);

  const q = new Set(terms(query));
  if (q.size === 0) return rows.slice(0, limit);   // no query → most recent

  // Light keyword overlap score; ties broken by recency (rows already newest-first).
  const scored = rows.map((r, i) => {
    const t = terms(r.text);
    let hits = 0; for (const w of t) if (q.has(w)) hits++;
    return { r, score: hits, i };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  const top = scored.filter((s) => s.score > 0).slice(0, limit).map((s) => s.r);
  // If nothing matched on keywords, fall back to the most recent pieces so the
  // agent still has the business's context (and can honestly say if it's not covered).
  return top.length ? top : rows.slice(0, Math.min(limit, 12));
}
