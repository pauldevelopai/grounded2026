// KnowHow document text extraction — code, never vision (the Session-5 discipline
// from node-bair-extract). This capture slice ingests text that is ALREADY text:
// the admin pastes a document's contents (or a .txt/.md/.csv), and we normalise it.
// Binary formats (PDF/DOCX) are deliberately deferred to Part C, where the
// node-bair-extract engine is reused; until then this returns an honest flag rather
// than guessing or vision-retyping. We never fabricate; [UNREADABLE] is preserved.

// Normalise pasted/loaded document text. Returns { text, flags }.
//   input: { text, name }  (name = optional filename, used only to flag binaries)
export function extractDocumentText({ text, name } = {}) {
  const flags = [];
  const raw = typeof text === 'string' ? text : '';

  // Guard: if the caller handed us something that looks like a binary blob (a PDF/
  // DOCX dumped as bytes), don't pretend we read it — flag it honestly.
  const looksBinary = /^%PDF-|\x00|PK\x03\x04/.test(raw.slice(0, 64));
  const binaryName = /\.(pdf|docx?|pptx?|xlsx?)$/i.test(name || '');
  if (looksBinary || (binaryName && !raw.trim())) {
    flags.push(`Binary document (${name || 'unknown'}) — paste its text, or wait for the Part C extractor. Not vision-retyped.`);
    return { text: '', flags };
  }

  // Plain text / markdown / csv: normalise whitespace, keep [UNREADABLE] markers
  // exactly as given, drop nothing silently.
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) flags.push('Empty after extraction — nothing to store.');
  return { text: cleaned, flags };
}

// Split a document's text into atomic corpus pieces (paragraph-ish), so each lands
// as its own corpus_item the future agent can retrieve. Conservative: paragraphs,
// merged if very short, capped in length.
export function splitIntoPieces(text, { maxLen = 1200 } = {}) {
  const paras = (text || '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const out = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + ' ' + p).trim().length <= maxLen) {
      buf = (buf ? buf + '\n\n' : '') + p;
    } else {
      if (buf) out.push(buf);
      buf = p.length <= maxLen ? p : p.slice(0, maxLen);
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : (text ? [text.slice(0, maxLen)] : []);
}
