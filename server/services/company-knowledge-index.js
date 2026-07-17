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

// The full extracted text of a source is stored, because it is the ONLY copy the chunker
// works from — anything trimmed off here can never be indexed, searched or tested, silently.
// Every consumer already slices to what it needs (2.4k for a fallback, 8k to extract claims,
// 6k to summarise), so a small stored cap protects nothing and just loses the back half of
// long reports. This bound exists only to stop a pathological file (~165k words) from
// blowing up memory; no real document reaches it.
export const MAX_SOURCE_TEXT = 1_000_000;

// Store NULL — not ciphertext — when a document yields no readable text (a scanned PDF,
// a failed extraction). encryptFor('') still returns a non-empty string, so storing that
// leaves the row matching `extracted_text IS NOT NULL AND length(...) > 0` forever: it can
// never produce a chunk, so it sits in the backlog for good and the "still reading…" count
// never reaches zero. NULL is also the honest answer — the UI can then say we couldn't read it.
export function encryptedText(newsroomId, text) {
  const clean = String(text || '').trim();
  return clean ? encryptFor(newsroomId, clean.slice(0, MAX_SOURCE_TEXT)) : null;
}

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

// A ratings framework is a RUBRIC, not a corpus: it defines the pillars — what good looks
// like — so it must be present for every judgement, never fished for by similarity (a
// pillar doesn't read like a claim, so retrieval reliably misses it). Short criteria docs
// are therefore included whole. Long ones — an Act runs to hundreds of chunks — are left to
// retrieveCriteriaChunks, which pulls the provisions relevant to the claim at hand.
const FRAMEWORK_BUDGET = 14000;   // chars; a framework is a few pages, an Act is not
export async function criteriaFramework(newsroomId, collection = null) {
  const { rows } = await pool.query(
    `SELECT title, extracted_text FROM beaiready_company_sources
      WHERE newsroom_id = $1 AND role = 'criteria' AND (collection = $2 OR collection IS NULL)
        AND inclusion <> 'exclude' AND sensitivity <> 'withdrawn' AND extracted_text IS NOT NULL
      ORDER BY length(extracted_text) ASC`, [newsroomId, collection]).catch(() => ({ rows: [] }));
  const parts = [];
  let budget = FRAMEWORK_BUDGET;
  for (const r of rows) {
    const t = (decryptFor(newsroomId, r.extracted_text) || '').trim();
    if (!t || t.length > budget) continue;         // too long ⇒ it's legislation; retrieve it instead
    parts.push(`--- ${r.title || 'Criteria'} ---\n${t}`);
    budget -= t.length;
  }
  return parts.join('\n\n');
}

// Judging criteria for the Claims Verifier: the passages of the tenant's criteria docs
// (role='criteria') most relevant to a claim. Includes org-wide criteria (collection IS
// NULL) and this mine's own criteria (collection = $collection). Falls back to raw text
// when the embedding model is unavailable.
export async function retrieveCriteriaChunks(newsroomId, question, collection = null, limit = 4) {
  const emb = await generateEmbedding(question).catch(() => null);
  if (emb) {
    const { rows } = await pool.query(
      `SELECT c.source_id, c.text_chunk, s.title
         FROM beaiready_source_chunks c
         JOIN beaiready_company_sources s ON s.id = c.source_id
        WHERE c.newsroom_id = $1 AND c.embedding IS NOT NULL AND s.role = 'criteria'
          AND s.inclusion <> 'exclude' AND s.sensitivity <> 'withdrawn'
          AND (s.collection = $2 OR s.collection IS NULL)
        ORDER BY c.embedding <=> $3::vector
        LIMIT $4`, [newsroomId, collection, toPgVector(emb), limit]).catch(() => ({ rows: [] }));
    if (rows.length) return rows.map((r) => ({ source_id: r.source_id, title: r.title, text: decryptFor(newsroomId, r.text_chunk) || '' })).filter((r) => r.text);
  }
  const { rows } = await pool.query(
    `SELECT id, title, extracted_text FROM beaiready_company_sources
      WHERE newsroom_id = $1 AND role = 'criteria' AND inclusion <> 'exclude' AND sensitivity <> 'withdrawn'
        AND (collection = $2 OR collection IS NULL) AND extracted_text IS NOT NULL
      ORDER BY created_at DESC LIMIT $3`, [newsroomId, collection, limit]).catch(() => ({ rows: [] }));
  return rows.map((r) => ({ source_id: r.id, title: r.title, text: (decryptFor(newsroomId, r.extracted_text) || '').slice(0, 1500) })).filter((r) => r.text);
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

// Embedding is ~30ms per chunk, so a folder of 60 reports is minutes of CPU. Doing that
// inside the upload request times the request out and looks like a hang. Instead the upload
// stores the text and returns immediately, and this drains the backlog in the background:
// it re-reads whatever has text but no chunks, so nothing is held in memory, a restart
// mid-run loses nothing, and files that land while it's working get caught by the next pass.
const indexing = new Set();
export function scheduleIndexing(newsroomId) {
  if (indexing.has(newsroomId)) return;   // already draining; new rows get picked up below
  indexing.add(newsroomId);
  setImmediate(async () => {
    try {
      // Loop until the backlog stops shrinking, NOT until a pass reports work. A source
      // whose text yields no chunks (a scanned PDF that extracts to whitespace) is counted
      // as indexed yet still has no chunks, so it matches the backlog query forever — on
      // "work done" alone this would spin on it, pinning a CPU on a shared box.
      for (let pass = 0; pass < 50; pass++) {
        const before = await pendingIndexCount(newsroomId);
        if (!before) break;                                  // nothing waiting
        const r = await backfillSourceChunks(newsroomId);
        const after = await pendingIndexCount(newsroomId);
        if (!r.indexed || after >= before) break;            // no progress — stop, don't spin
      }
    } catch (e) { console.error('[knowhow indexing]', e.message); }
    finally { indexing.delete(newsroomId); }
  });
}

// How much of a newsroom's knowledge is still waiting to be indexed.
export async function pendingIndexCount(newsroomId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM beaiready_company_sources s
      WHERE s.newsroom_id = $1 AND s.extracted_text IS NOT NULL AND length(s.extracted_text) > 0
        AND NOT EXISTS (SELECT 1 FROM beaiready_source_chunks c WHERE c.source_id = s.id)`, [newsroomId]).catch(() => ({ rows: [{ n: 0 }] }));
  return rows[0]?.n || 0;
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
    const text = (decryptFor(s.newsroom_id, s.extracted_text) || '').trim();
    // Nothing readable in it (scanned PDF / failed extraction, or an older row stored as
    // ciphertext-of-empty). Clear it so it leaves the backlog instead of being retried
    // every hour forever, and so the page stops reporting it as still being read.
    if (!text) {
      await pool.query('UPDATE beaiready_company_sources SET extracted_text = NULL WHERE id = $1', [s.id]).catch(() => {});
      continue;
    }
    try { await indexSource(s.id, s.newsroom_id, text); indexed++; } catch (e) { console.error('[knowhow backfill]', s.id, e.message); }
  }
  return { sources: rows.length, indexed };
}
