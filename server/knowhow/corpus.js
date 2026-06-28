// KnowHow corpus helpers — the unified, retrieval-ready knowledge store. Both
// capture channels (Pulse responses, ingested documents) derive corpus_items
// through here, so the future agent (Part C) has one clean target. Tenant-scoped
// on every row. Accepts a pool or a transaction client (anything with .query).

export async function addCorpusItem(db, { tenant_id, topic_id = null, person_id = null, origin, origin_id, text, consent_ok = false }) {
  const { rows } = await db.query(
    `INSERT INTO knowhow.corpus_items (tenant_id, topic_id, person_id, origin, origin_id, text, consent_ok)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [tenant_id, topic_id, person_id, origin, origin_id, text, consent_ok]
  );
  return rows[0].id;
}

// A live snapshot of how the corpus is filling — the value story for the capture
// UI ("47 pieces across 6 topics, 3 people"). Tenant-scoped.
export async function corpusSummary(db, tenantId) {
  const [{ rows: tot }, { rows: byTopic }, { rows: people }] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*)::int                                   AS pieces,
         COUNT(*) FILTER (WHERE consent_ok)::int         AS consented,
         COUNT(DISTINCT topic_id)::int                   AS topics,
         COUNT(DISTINCT person_id)::int                  AS people
       FROM knowhow.corpus_items WHERE tenant_id = $1`, [tenantId]),
    db.query(
      `SELECT t.id, t.label, COUNT(c.id)::int AS pieces
         FROM knowhow.topics t
         LEFT JOIN knowhow.corpus_items c ON c.topic_id = t.id AND c.tenant_id = t.tenant_id
        WHERE t.tenant_id = $1
        GROUP BY t.id, t.label ORDER BY pieces DESC, t.label`, [tenantId]),
    db.query(
      `SELECT p.id, p.name, COUNT(c.id)::int AS pieces
         FROM knowhow.people p
         LEFT JOIN knowhow.corpus_items c ON c.person_id = p.id AND c.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
        GROUP BY p.id, p.name ORDER BY pieces DESC, p.name`, [tenantId]),
  ]);
  return { ...(tot[0] || { pieces: 0, consented: 0, topics: 0, people: 0 }), byTopic, byPerson: people };
}

// The corpus text for one topic — used to tell the question generator what's
// already known, so it doesn't re-ask. Tenant + topic scoped.
export async function corpusForTopic(db, tenantId, topicId, limit = 12) {
  const { rows } = await db.query(
    `SELECT text FROM knowhow.corpus_items
      WHERE tenant_id = $1 AND topic_id = $2 ORDER BY created_at DESC LIMIT $3`,
    [tenantId, topicId, limit]
  );
  return rows.map((r) => r.text);
}
