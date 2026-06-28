// RAG embeddings — LOCAL, self-hosted all-MiniLM-L6-v2 (384-dim) via transformers.js.
//
// No external embedding API. The platform is Anthropic-only for generation (Claude),
// and owns its embeddings outright — no OpenAI, no third-party key, no per-call cost,
// and client data never leaves the box to be embedded. The model (~25MB) downloads
// once from the HF CDN and is cached on disk; after warm-up each embed is a few ms.
//
// Same exported interface as before (generateEmbedding / toPgVector / isAvailable),
// so callers (knowledge.js, company-ai.js, background-jobs.js) are unchanged. If the
// model can't load, generateEmbedding returns null and retrieval degrades gracefully
// to keyword-only (the SQL COALESCEs a missing vector score to 0).
import { pipeline, env } from '@xenova/transformers';

const MODEL = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2'; // 384 dims
const MAX_CHARS = 4000; // MiniLM truncates at 256 tokens; this is a safe upper bound

// Keep everything local: never reach for a remote model index at runtime beyond the
// one-time weight download, and don't depend on a local model dir being pre-seeded.
env.allowLocalModels = false;

let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL).catch((err) => {
      console.error('[Embeddings] could not load local model:', err.message);
      extractorPromise = null;   // allow a later retry
      throw err;
    });
  }
  return extractorPromise;
}

export async function generateEmbedding(text) {
  const input = (text || '').slice(0, MAX_CHARS).trim();
  if (!input) return null;
  try {
    const extractor = await getExtractor();
    const output = await extractor(input, { pooling: 'mean', normalize: true });
    return Array.from(output.data);   // 384 floats, unit-normalised
  } catch (err) {
    console.error('[Embeddings] embedding failed:', err.message);
    return null;
  }
}

/** Format embedding array as a pgvector literal: '[0.1,0.2,...]' */
export function toPgVector(embedding) {
  if (!embedding) return null;
  return `[${embedding.join(',')}]`;
}

/** Is the embedding backend usable? (model loads) */
export async function isAvailable() {
  try { await getExtractor(); return true; } catch { return false; }
}
