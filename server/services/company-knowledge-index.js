// company-knowledge-index.js — deep document processing for KnowHow / the company AI.
//
// Each company knowledge source (doc / website / note) is split into ~170-word chunks,
// each embedded to a LOCAL 384-dim vector (embeddings.js) and stored ENCRYPTED in
// beaiready_source_chunks. Retrieval then pulls the best-matching PASSAGES across ALL
// of a newsroom's included, non-sensitive sources — so a long PDF is searchable end to
// end, not truncated to its first page. Degrades gracefully: if the local embedding
// model can't load, chunks store with a NULL vector and callers fall back to the
// source-level slice (the pre-chunk behaviour).
import pool from '../db/pool.js';
import { chunkText } from './governance-ingest.js';
import { generateEmbedding, toPgVector } from './embeddings.js';
import { encryptFor, decryptFor } from './crypto.js';

const CHUNK_OPTS = { maxWords: 170, overlapWords: 30 };

// "Better conversion": tidy raw extracted text before chunking — join hyphenated
// line-wraps, fold single newlines inside a paragraph to spaces, keep blank-line
// paragraph breaks. Dependency-free; big quality win for pdf-parse output.
export function cleanExtractedText(raw) {
  let s = String(raw || '').replace(/\r\n?/g, '\n');
  s = s.replace(/([A-Za-z])-\n([a-z])/g, '$1$2');       // inter-\nnational → international
  s = s.replace(/([^\n])\n(?!\n)/g, '$1 ');             // wrap newline → space (keep \n\n)
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// (Re)build a source's chunks + embeddings. Idempotent: clears the source's old chunks
// first. Returns { chunks, embedded }.
export async function indexSource(sourceId, newsroomId, plaintext) {
  await pool.query('DELETE FROM beaiready_source_chunks WHERE source_id = $1', [sourceId]);
  const chunks = chunkText(cleanExtractedText(plaintext), CHUNK_OPTS);
  let embedded = 0;
  for (let i = 0; i < chunks.length; i++) {
    let vec = null;
    try { const e = await generateEmbedding(chunks[i]); if (e) { vec = toPgVector(e); embedded++; } } catch { /* leave NULL */ }
    await pool.query(
      `INSERT INTO beaiready_source_chunks (source_id, newsroom_id, chunk_index, text_chunk, embedding)
       VALUES ($1,$2,$3,$4,$5)`,
      [sourceId, newsroomId, i, encryptFor(newsroomId, chunks[i]), vec]);
  }
  return { chunks: chunks.length, embedded };
}

// Best-matching passages across a newsroom's sources, for grounding an answer.
// Returns [{ source_id, kind, title, text }]. Falls back to source-level slices when
// there's no query embedding (model down) or no chunks exist yet.
// Best-matching passages for grounding. Optional `collection` scopes to one bucket
// (e.g. a single mine) and `roles` restricts source roles (e.g. only reporting+external
// evidence). Existing callers pass neither → unchanged behaviour.
export async function retrieveCompanyChunks(newsroomId, question, { limit = 12, collection = null, roles = null } = {}) {
  const emb = await generateEmbedding(question).catch(() => null);
  if (emb) {
    const { rows } = await pool.query(
      `SELECT c.source_id, c.text_chunk, s.kind, s.title, s.role
         FROM beaiready_source_chunks c
         JOIN beaiready_company_sources s ON s.id = c.source_id
        WHERE c.newsroom_id = $1 AND c.embedding IS NOT NULL
          AND s.inclusion <> 'exclude' AND s.sensitivity <> 'withdrawn'
          AND ($4::text IS NULL OR s.collection = $4)
          AND ($5::text[] IS NULL OR s.role = ANY($5))
        ORDER BY c.embedding <=> $2::vector
        LIMIT $3`, [newsroomId, toPgVector(emb), limit, collection, roles]).catch(() => ({ rows: [] }));
    if (rows.length) {
      return rows
        .map((r) => ({ source_id: r.source_id, kind: r.kind, title: r.title, role: r.role, text: decryptFor(newsroomId, r.text_chunk) || '' }))
        .filter((r) => r.text);
    }
  }
  return sourceLevelFallback(newsroomId, limit, { collection, roles });
}

// Fallback: first ~2400 chars of each included, non-sensitive source (pre-chunk path).
async function sourceLevelFallback(newsroomId, limit, { collection = null, roles = null } = {}) {
  const { rows } = await pool.query(
    `SELECT id, kind, title, role, extracted_text FROM beaiready_company_sources
      WHERE newsroom_id = $1 AND inclusion <> 'exclude' AND sensitivity <> 'withdrawn'
        AND ($3::text IS NULL OR collection = $3)
        AND ($4::text[] IS NULL OR role = ANY($4))
        AND extracted_text IS NOT NULL AND length(extracted_text) > 0
      ORDER BY created_at DESC LIMIT $2`, [newsroomId, limit, collection, roles]).catch(() => ({ rows: [] }));
  const out = [];
  for (const s of rows) {
    const text = (decryptFor(newsroomId, s.extracted_text) || '').slice(0, 2400);
    if (text) out.push({ source_id: s.id, kind: s.kind, title: s.title, role: s.role, text });
  }
  return out;
}

// Explicit search: the single best passage per source, scored, for the search box.
export async function searchCompanyChunks(newsroomId, q, { limit = 8, collection = null } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  const emb = await generateEmbedding(query).catch(() => null);
  if (!emb) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (c.source_id) c.source_id, s.kind, s.title, c.text_chunk,
            (1 - (c.embedding <=> $2::vector)) AS score
       FROM beaiready_source_chunks c
       JOIN beaiready_company_sources s ON s.id = c.source_id
      WHERE c.newsroom_id = $1 AND c.embedding IS NOT NULL
        AND s.inclusion <> 'exclude' AND s.sensitivity <> 'withdrawn'
        AND ($3::text IS NULL OR s.collection = $3)
      ORDER BY c.source_id, c.embedding <=> $2::vector`, [newsroomId, toPgVector(emb), collection]).catch(() => ({ rows: [] }));
  return rows
    .map((r) => ({ source_id: r.source_id, kind: r.kind, title: r.title, score: Number(r.score) || 0, snippet: (decryptFor(newsroomId, r.text_chunk) || '').slice(0, 300) }))
    .filter((r) => r.snippet)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Per-source chunk stats { source_id: { chunks, embedded } } for the processing-status UI.
export async function sourceChunkStats(newsroomId) {
  const { rows } = await pool.query(
    `SELECT source_id, COUNT(*)::int AS chunks, COUNT(embedding)::int AS embedded
       FROM beaiready_source_chunks WHERE newsroom_id = $1 GROUP BY source_id`, [newsroomId]).catch(() => ({ rows: [] }));
  const map = {};
  for (const r of rows) map[r.source_id] = { chunks: r.chunks, embedded: r.embedded };
  return map;
}

// Index any sources that have no chunks yet (existing data / a prior failure).
export async function backfillSourceChunks(newsroomId = null) {
  const { rows } = await pool.query(
    `SELECT s.id, s.newsroom_id, s.extracted_text
       FROM beaiready_company_sources s
      WHERE ${newsroomId ? 's.newsroom_id = $1 AND ' : ''}
            s.extracted_text IS NOT NULL AND length(s.extracted_text) > 0
        AND NOT EXISTS (SELECT 1 FROM beaiready_source_chunks c WHERE c.source_id = s.id)`,
    newsroomId ? [newsroomId] : []).catch(() => ({ rows: [] }));
  let indexed = 0;
  for (const s of rows) {
    const text = decryptFor(s.newsroom_id, s.extracted_text);
    if (!text) continue;
    try { await indexSource(s.id, s.newsroom_id, text); indexed++; } catch (e) { console.error('[knowhow backfill]', s.id, e.message); }
  }
  return { sources: rows.length, indexed };
}
