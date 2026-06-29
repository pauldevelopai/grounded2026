// governance-ingest.js — ingest a governance document (regulation, framework,
// guidance, report) into the GLOBAL 'ai_governance' knowledge corpus, CHUNKED so the
// local embedding model can actually encode it.
//
// Why chunking matters: all-MiniLM-L6-v2 only encodes the first ~256 tokens of any
// input (embeddings.js caps input at 4000 chars, but the model ignores the tail). A
// whole regulation embedded as one row would retrieve on its opening lines only. So we
// split into small (<=~256-token) chunks — one knowledge_entries row each, grouped by a
// shared parent_document_id — and every governance AI function (risk-classify,
// controls-suggest, policy) grounds + cites against these chunks.
import crypto from 'crypto';
import { createKnowledgeEntry } from './knowledge.js';

// ~170 words keeps a chunk (plus a short title prefix) comfortably under the model's
// 256-token window; light overlap so an idea isn't sliced clean in half.
const MAX_WORDS = 170;
const OVERLAP_WORDS = 30;

/** Split text into <=MAX_WORDS chunks, preferring paragraph boundaries. */
export function chunkText(text, { maxWords = MAX_WORDS, overlapWords = OVERLAP_WORDS } = {}) {
  const clean = (text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = [];
  let count = 0;
  const flush = () => { if (buf.length) { chunks.push(buf.join('\n\n')); buf = []; count = 0; } };

  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    if (words.length > maxWords) {
      // A single long paragraph: slide a window across it with overlap.
      flush();
      for (let i = 0; i < words.length; i += (maxWords - overlapWords)) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
      }
      continue;
    }
    if (count + words.length > maxWords) flush();
    buf.push(para);
    count += words.length;
  }
  flush();
  return chunks;
}

/**
 * Ingest one governance document into the global corpus, chunked.
 * Returns { documentId, chunks }.
 *
 * organisationId is intentionally omitted → createKnowledgeEntry defaults visibility
 * to 'global', so the corpus is shared across every tenant (the "any org" property)
 * while each client's own data stays private.
 */
export async function ingestGovernanceDocument({
  title,
  text,
  framework = null,        // 'eu_ai_act' | 'nist_ai_rmf' | 'iso_42001' | 'popia' | ...
  jurisdiction = null,     // 'EU' | 'International' | 'South Africa' | ...
  sourceUrl = null,
  confidence = 0.8,
  isVerified = true,       // admin-ingested docs are curated by default
} = {}) {
  if (!title || !text || !text.trim()) {
    throw new Error('ingestGovernanceDocument: title and text are required');
  }
  const chunks = chunkText(text);
  if (!chunks.length) return { documentId: null, chunks: 0 };

  const documentId = crypto.randomUUID();
  const tags = [framework, jurisdiction].filter(Boolean);

  for (let i = 0; i < chunks.length; i++) {
    await createKnowledgeEntry({
      category: 'ai_governance',                         // retrieval filters on category
      subcategory: framework || null,
      title: chunks.length > 1 ? `${title} — part ${i + 1}/${chunks.length}` : title,
      content: chunks[i],
      organisationId: null,                              // → visibility 'global'
      sourceType: 'ai_governance',
      sourceDescription: sourceUrl || title,             // shown as the citation source
      confidence,
      visibility: 'global',
      tags,
      parentDocumentId: documentId,
      chunkIndex: i,
      framework,
      jurisdiction,
      isVerified,
    });
  }
  return { documentId, chunks: chunks.length };
}
