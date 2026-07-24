// voiceCheck.js — JS port of ../newsletter/check_draft.py.
//
// Measures a draft against Paul's voice (metrics computed live from the
// vendored corpus, Paul-voice subset) and audits its links. Used two ways:
//   1. To FEED the de-Claude edit pass concrete "you're off on X" direction.
//   2. As a final gate whose result is logged with the issue (never blocks the
//      send — Paul is the gate — but a failing draft is flagged loudly).
//
// Kept deliberately close to check_draft.py so the two stay comparable: same
// markers, same 40%-tolerance-with-floor rule, same "em-dash must be 0".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.resolve(__dirname, '../voice/newsletter_corpus.json');

// Guest/syndicated pieces — NOT Paul's prose. Excluded from the baseline
// (build_corpus.py weights every chunk equally, so these poison it otherwise).
const EXCLUDE = new Set(['the-world-doesnt-need-another-ai', 'learn-how-to-use-ai']);

const MARKERS = ['mean_sent', 'short<=5%', 'long>=26%', 'I/1k', 'you/1k',
  'contr/1k', 'parens/1k', 'ellipsis/1k', 'questions/1k'];

function stripMd(t) {
  return String(t)
    .replace(/^#.*$/gm, '')                    // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // links -> anchor text
    .replace(/\*\*|\*|`/g, '');
}

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

function stats(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const sents = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const lens = sents.map((s) => s.split(/\s+/).filter(Boolean).length);
  const low = text.toLowerCase();
  const per1k = (n) => 1000 * n / Math.max(words.length, 1);
  const count = (re) => (low.match(re) || []).length;
  return {
    words: words.length,
    mean_sent: mean(lens),
    'short<=5%': 100 * lens.filter((x) => x <= 5).length / Math.max(sents.length, 1),
    'long>=26%': 100 * lens.filter((x) => x >= 26).length / Math.max(sents.length, 1),
    'I/1k': per1k(count(/\bi\b/g)),
    'you/1k': per1k(count(/\byou\b/g)),
    'contr/1k': per1k(count(/\b\w+['’](t|s|re|ve|ll|d|m)\b/g)),
    'parens/1k': per1k((text.match(/\(/g) || []).length),
    'ellipsis/1k': per1k((text.match(/…/g) || []).length),
    'questions/1k': per1k((text.match(/\?/g) || []).length),
    emdash: (text.match(/—/g) || []).length,
  };
}

let _baseline = null;
export function paulBaseline() {
  if (_baseline) return _baseline;
  try {
    const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf-8'));
    const text = corpus.chunks
      .filter((c) => !EXCLUDE.has(c.source))
      .map((c) => c.text)
      .join('\n\n');
    _baseline = stats(text);
  } catch (err) {
    // No corpus on disk (shouldn't happen — it's vendored) → skip voice gating.
    _baseline = null;
  }
  return _baseline;
}

/**
 * @returns {{
 *   ok: boolean, fails: number, words: number,
 *   markers: Array<{ marker, paul, draft, ok }>,
 *   emdash: { paul: 0, draft, ok },
 *   links: { count, shorteners: string[], unlinkedNamed: string[], ok },
 *   direction: string[],   // human-readable "fix by direction" notes
 *   report: string,
 * }}
 */
export function checkDraft(markdown) {
  const draftRaw = String(markdown || '');
  const draft = stripMd(draftRaw);
  const d = stats(draft);
  const paul = paulBaseline();

  const markers = [];
  let fails = 0;
  const direction = [];

  if (paul) {
    for (const k of MARKERS) {
      const t = paul[k], v = d[k];
      const ok = Math.abs(v - t) <= Math.max(0.4 * Math.max(t, 1), 1.5);
      if (!ok) fails++;
      markers.push({ marker: k, paul: +t.toFixed(1), draft: +v.toFixed(1), ok });
    }
    // Human-readable direction (mirrors check_draft.py's "fix by direction").
    if (d.mean_sent < paul.mean_sent * 0.75) direction.push('too choppy — merge into longer, winding sentences');
    if (d['I/1k'] < paul['I/1k'] * 0.6) direction.push('not enough "I" — put Paul back in his own copy');
    if (d['contr/1k'] > paul['contr/1k'] * 1.4) direction.push('too many contractions — he writes "it is"/"you are" more than you expect');
    if (d['parens/1k'] < paul['parens/1k'] * 0.4 && d['ellipsis/1k'] < paul['ellipsis/1k'] * 0.4) direction.push('no asides — add parentheses/ellipsis (never an em-dash)');
  }

  const emdashOk = d.emdash === 0;
  if (!emdashOk) { fails++; direction.push('remove ALL em-dashes — Paul uses parentheses/ellipses, never "—"'); }

  // ── link gate ──
  const links = [...draftRaw.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)]
    .map((m) => ({ text: m[1], url: m[2] }));
  const shorteners = links.filter((l) => /lnkd\.in|bit\.ly|t\.co|tinyurl/.test(l.url)).map((l) => l.url);
  const named = [...draftRaw.matchAll(/\b(The Guardian|The Economist|Transformer|Reuters|Bloomberg|Financial Times|The Verge|Wired|TechCrunch|Politico|Semafor)\b/g)].map((m) => m[1]);
  const linkedText = links.map((l) => l.text).join(' ');
  const unlinkedNamed = [...new Set(named.filter((n) => !linkedText.includes(n)))];

  const linkFails = (links.length === 0 ? 1 : 0) + shorteners.length;
  fails += linkFails;
  if (links.length === 0) direction.push('no source links at all — every factual claim needs one');
  if (shorteners.length) direction.push(`resolve shorteners to canonical URLs: ${shorteners.join(', ')}`);

  const report = [
    `draft: ${d.words} words`,
    ...markers.map((m) => `${m.marker.padEnd(13)} paul=${m.paul} draft=${m.draft} ${m.ok ? 'ok' : '<-- OFF'}`),
    `em-dash       paul=0 draft=${d.emdash} ${emdashOk ? 'ok' : '<-- OFF'}`,
    `links: ${links.length}${shorteners.length ? ` (${shorteners.length} shortener FAIL)` : ''}${unlinkedNamed.length ? ` [warn: named-not-linked: ${unlinkedNamed.join(', ')}]` : ''}`,
    fails === 0 ? 'PASS' : `${fails} problem(s)`,
  ].join('\n');

  return {
    ok: fails === 0,
    fails,
    words: d.words,
    markers,
    emdash: { paul: 0, draft: d.emdash, ok: emdashOk },
    links: { count: links.length, shorteners, unlinkedNamed, ok: linkFails === 0 },
    direction,
    report,
  };
}
