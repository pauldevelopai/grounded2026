// corpus.js — load the vendored voice corpus and pick representative
// Paul-voice excerpts for the writer's few-shot. Deterministic selection so
// the writer's cached system prompt stays byte-stable between runs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_DIR = path.resolve(__dirname, '../voice');

const EXCLUDE = new Set(['the-world-doesnt-need-another-ai', 'learn-how-to-use-ai']);

let _chunks = null;
export function loadCorpusChunks() {
  if (_chunks) return _chunks;
  try {
    const corpus = JSON.parse(fs.readFileSync(path.join(VOICE_DIR, 'newsletter_corpus.json'), 'utf-8'));
    _chunks = (corpus.chunks || []).filter((c) => !EXCLUDE.has(c.source));
  } catch { _chunks = []; }
  return _chunks;
}

export function readVoiceFile(name) {
  try { return fs.readFileSync(path.join(VOICE_DIR, name), 'utf-8'); }
  catch { return ''; }
}

// Strip the light markdown to plain prose for a corpus chunk.
function mdToPlain(md) {
  return String(md || '')
    .replace(/^#+\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Component 5: append a SENT issue's news body to the voice corpus, in the
 * corpus's own {id, source, word_count, text} chunk schema. The Develop AI
 * block must already be excluded by the caller (news only — the promo block
 * never pollutes the voice examples). Returns the new chunk count.
 */
export function appendSentIssueToCorpus({ date, newsMarkdown }) {
  const file = path.join(VOICE_DIR, 'newsletter_corpus.json');
  const corpus = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const text = mdToPlain(newsMarkdown);
  if (!text) return corpus.chunks.length;
  const source = `sent-${date}`;
  // Idempotent: replace any existing chunk for this date rather than duplicate.
  corpus.chunks = corpus.chunks.filter((c) => c.source !== source);
  corpus.chunks.push({
    id: `sent-${date}`,
    source,
    word_count: text.split(/\s+/).filter(Boolean).length,
    text,
  });
  corpus.meta = corpus.meta || {};
  corpus.meta.article_count = new Set(corpus.chunks.map((c) => c.source)).size;
  corpus.meta.total_chunks = corpus.chunks.length;
  fs.writeFileSync(file, JSON.stringify(corpus, null, 2));
  _chunks = null; // invalidate cache
  return corpus.chunks.length;
}

// Score a chunk for "peak Paul voice": first person, direct address, and his
// signature aside devices (parentheses, ellipses) — the markers the style
// guide measures. Penalise em-dashes (he essentially never uses them).
function voiceDensity(text) {
  const words = Math.max(text.split(/\s+/).length, 1);
  const per1k = (n) => (1000 * n) / words;
  const c = (re) => (text.match(re) || []).length;
  return (
    per1k(c(/\bI\b/g)) +
    per1k(c(/\byou\b/gi)) +
    per1k((text.match(/\(/g) || []).length) +
    per1k((text.match(/…/g) || []).length) -
    5 * (text.match(/—/g) || []).length
  );
}

/**
 * Deterministically pick `n` strong, self-contained voice excerpts of roughly
 * `minWords`..`maxWords`. Prefer one chunk per source article for variety.
 */
export function sampleVoiceExcerpts({ n = 6, minWords = 60, maxWords = 160 } = {}) {
  const chunks = loadCorpusChunks()
    .filter((c) => c.word_count >= minWords && c.word_count <= maxWords)
    .map((c) => ({ ...c, _d: voiceDensity(c.text) }))
    .sort((a, b) => b._d - a._d);

  const picked = [];
  const seenSources = new Set();
  for (const c of chunks) {
    if (seenSources.has(c.source)) continue;
    seenSources.add(c.source);
    picked.push(c.text.trim());
    if (picked.length >= n) break;
  }
  return picked;
}
