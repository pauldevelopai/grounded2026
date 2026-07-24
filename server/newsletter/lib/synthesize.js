// synthesize.js — Component 2, steps 3-4: the writer.
//
// Call A (draft):    Sonnet writes the issue in Paul's voice, as strict JSON.
// Call B (de-Claude): a SEPARATE call whose only job is to strip AI tone,
//                     guided by de-claude-tells.txt + the live voice metrics.
//
// Keeping the two calls separate is a guardrail: a classification or drafting
// error can't leak through as a "fixed" hallucination, and the edit pass has a
// single, auditable job. Both raw outputs are returned so the draft->final
// diff can be logged (feeds Component 5 tell-list tuning).

import { callClaude } from '../../services/claude.js';
import { MODELS, PILLAR_LABEL } from './pillars.js';
import { readVoiceFile, sampleVoiceExcerpts } from './corpus.js';
import { checkDraft } from './voiceCheck.js';
import { assembledProse } from './render.js';

// ── The editorial frame (authoritative; spec Part 2 / Part 6) ───────────────
const EDITORIAL_FRAME = `You write a daily newsletter tracking what is going WRONG with AI — and what it means for organisations across Africa. Three strands only: CYBER SECURITY (breaches, cyberattacks, AI-enabled scams and deepfake fraud), GOVERNANCE (regulation, enforcement, government and corporate AI policy), and LEGAL (lawsuits, fines, court rulings).

THE FRAME (non-negotiable):
- The issue has up to three sections, one per pillar: Cyber Security / Governance / Legal, in the order given to you (biggest story's pillar leads). A pillar with no stories is omitted — never padded.
- Every story follows three beats: What happened -> How this affects you -> How to protect yourself.
  * LEAD-section stories ("treatment":"full") get all three beats in full, <= ~200 words total.
  * Other sections ("treatment":"compressed") get a headline + ONE combined "affects you / protect yourself" sentence.
- The PROTECTION beat is the product. It must be CONCRETE and specific: a clause to check, a setting to change, a question to ask a vendor, a policy line to write. Generic advice ("be careful", "stay informed", "be vigilant") is BANNED.
- Sources are GLOBAL; the lens is AFRICAN. Never drop a story for being non-African. In the "affects you" beat, translate it for African organisations (continent-wide, NOT SA-only), citing the relevant national regime where it applies (POPIA in South Africa, Kenya's DPA, Nigeria's NDPA, etc.).
- Every story carries its source URL exactly as provided. Never invent, alter, or shorten a URL. Never invent a fact, a figure, or a scene — every claim must trace to the story data you are given.
- The news is strictly external. NEVER mention Paul, Develop AI, BAIR, GROUNDED, Vantage, or any client anywhere in the news content.
- Total issue <= ~700 words. Subject line <= 60 characters, drawn from the lead story, plain and specific.`;

const OUTPUT_CONTRACT = `Return ONLY a JSON object (no prose, no code fences) with this exact shape:
{
  "subject": "<= 60 chars, plain, from the lead story",
  "sections": [
    {
      "pillar": "cyber" | "governance" | "legal",
      "stories": [
        {
          "headline": "short, specific, no clickbait",
          "what_happened": "what actually happened, factual, traceable to the story",
          "affects_you": "how it affects African organisations; cite a national regime where relevant",
          "protect_yourself": "ONE concrete, specific defensive action",
          "url": "<the exact source URL given for this story>",
          "treatment": "full" | "compressed"
        }
      ]
    }
  ]
}
Sections MUST appear in the order the stories were given (that is the ranked order).
For "compressed" stories, put the single combined affects/protect sentence in "affects_you" and leave "protect_yourself" as "".`;

function buildPlan(selection) {
  const lines = [];
  selection.pillars.forEach((p, pi) => {
    lines.push(`\n=== SECTION ${pi + 1}: ${PILLAR_LABEL[p.pillar]} (pillar="${p.pillar}", ${p.treatment === 'lead' ? 'LEAD — full treatment' : 'compressed'}) ===`);
    p.stories.forEach((s, si) => {
      const excerpt = (s.content || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      lines.push([
        `\nStory ${pi + 1}.${si + 1} [treatment=${p.treatment === 'lead' ? 'full' : 'compressed'}, category=${s.nl_category}]`,
        `HEADLINE HINT: ${s.title || ''}`,
        `SUMMARY: ${s.nl_one_line || ''}`,
        `URL (use verbatim): ${s.url}`,
        `SEVERITY: ${s.nl_severity}/5  AFRICA_RELEVANCE: ${s.nl_africa_relevance}/5`,
        s._duped ? `(also covered by ${s._duped} other outlet(s))` : '',
        `EXCERPT: ${excerpt || '(none)'}`,
      ].filter(Boolean).join('\n'));
    });
  });
  return lines.join('\n');
}

// Tolerant JSON-object parser: strip fences/preamble, slice outermost {...}.
function parseJsonObjectLoose(raw) {
  if (raw && typeof raw === 'object') return raw;
  const s = String(raw);
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

// Guardrail: drop any story whose URL isn't one we actually supplied. This is
// the belt-and-braces against a hallucinated item slipping in with a made-up
// link (spec: "may not output any item that lacks a scraped source URL").
function enforceSourceUrls(issue, allowedUrls) {
  const allow = new Set(allowedUrls);
  const dropped = [];
  for (const section of issue.sections || []) {
    section.stories = (section.stories || []).filter((st) => {
      const ok = st.url && allow.has(st.url);
      if (!ok) dropped.push(st.headline || st.url || '(no url)');
      return ok;
    });
  }
  issue.sections = (issue.sections || []).filter((s) => s.stories.length > 0);
  return dropped;
}

/**
 * Write the issue. Returns { issue, draftText, finalText, voice, model, dropped }.
 * `issue` is the structured object (subject + sections[]). Rendering to
 * markdown/html/plaintext is the caller's job (lib/render.js).
 */
export async function synthesizeIssue(selection, { log = console.log } = {}) {
  const styleGuide = readVoiceFile('STYLE_GUIDE.md');
  const tells = readVoiceFile('de-claude-tells.txt');
  const excerpts = sampleVoiceExcerpts({ n: 6 });
  const allowedUrls = selection.allStories.map((s) => s.url);

  // ── Call A: draft ──
  const systemA = [
    EDITORIAL_FRAME,
    '\n--- VOICE: write exactly in this voice ---\n',
    styleGuide,
    '\n--- VOICE REFERENCE (real excerpts; match the register, NOT the essay structure — you must follow THE FRAME above for structure) ---\n',
    excerpts.map((e, i) => `[${i + 1}] ${e}`).join('\n\n'),
    '\n--- AVOID THESE AI TELLS ---\n',
    tells,
    '\n--- OUTPUT ---\n',
    OUTPUT_CONTRACT,
  ].join('\n');

  const userA = `Write today's issue from these ranked, pre-selected stories. Do not add stories, do not drop the URLs.\n${buildPlan(selection)}`;

  const rawA = await callClaude({
    model: MODELS.write,
    system: systemA,
    userContent: userA,
    maxTokens: 2600,
    temperature: 0.6,
  });
  let issue = parseJsonObjectLoose(rawA);
  if (!issue || !Array.isArray(issue.sections)) {
    throw new Error('writer call A did not return a valid issue object');
  }
  const draftText = JSON.stringify(issue, null, 2);
  const voiceDraft = checkDraft(assembledProse(issue));
  log(`[synthesize] draft voice: ${voiceDraft.fails} problem(s)`);

  // ── Call B: de-Claude edit ──
  const systemB = [
    'You are a ruthless copy editor. Your ONLY job is to strip AI tone from a newsletter draft and make it read like the human author, Paul, whose measured voice targets are given. Do NOT add facts, do NOT change any URL, do NOT change the JSON structure or the story order. Rewrite ONLY the prose fields (headline, what_happened, affects_you, protect_yourself).',
    '\nHunt and rewrite flat every one of these tells (phrases are case-insensitive substrings; lines starting with re: are regexes):\n',
    tells,
    '\nHARD RULE: zero em-dashes ("—"). Paul uses parentheses or ellipses for asides, never em-dashes.',
    '\nKeep the protection beat concrete and specific. Keep the African lens. Keep every URL byte-identical.',
    '\nReturn ONLY the corrected JSON object, same shape as the input.',
  ].join('\n');

  const directionNote = voiceDraft.direction.length
    ? `\n\nThe draft is off in these ways — fix them:\n- ${voiceDraft.direction.join('\n- ')}`
    : '';

  const rawB = await callClaude({
    model: MODELS.write,
    system: systemB,
    userContent: `Voice targets (per 1000 words unless noted):\n${voiceDraft.markers.map((m) => `  ${m.marker}: aim ~${m.paul} (draft ${m.draft}${m.ok ? '' : ' OFF'})`).join('\n')}${directionNote}\n\nHere is the draft JSON to de-Claude:\n${draftText}`,
    maxTokens: 2600,
    temperature: 0.4,
  });
  const edited = parseJsonObjectLoose(rawB);
  if (edited && Array.isArray(edited.sections)) {
    issue = edited;
  } else {
    log('[synthesize] de-Claude pass failed to parse — keeping draft');
  }

  // ── Post-processing guardrails ──
  if (issue.subject) issue.subject = String(issue.subject).slice(0, 60);
  const dropped = enforceSourceUrls(issue, allowedUrls);
  if (dropped.length) log(`[synthesize] dropped ${dropped.length} item(s) with unverified URLs: ${dropped.join('; ')}`);

  const finalText = JSON.stringify(issue, null, 2);
  const voiceFinal = checkDraft(assembledProse(issue));
  log(`[synthesize] final voice: ${voiceFinal.fails} problem(s) | ${voiceFinal.words} words`);

  return {
    issue,
    draftText,
    finalText,
    model: MODELS.write,
    voice: voiceFinal,
    voiceDraft,
    dropped,
  };
}
