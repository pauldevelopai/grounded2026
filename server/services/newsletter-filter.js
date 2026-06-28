// newsletter-filter.js — AI-relevance filtering for the Forums newsletter pull.
// Paul's Gmail "Forums" tab holds AI newsletters AND other group/forum mail; the
// AI-News briefing should only learn from the AI ones. Two layers:
//   1. a Gmail query filter, so we only FETCH AI-mentioning mail (cheap — no read);
//   2. a relevance gate on the fetched email, so a one-off "AI" mention in a footer
//      doesn't sneak a non-AI newsletter in.
// Both are env-toggleable (NEWSLETTER_AI_FILTER=false to ingest all Forums mail);
// the term set is overridable via NEWSLETTER_AI_TERMS (comma-separated).

// Gmail-search form (quoted phrases, OR-able). Gmail matches whole tokens, so
// "AI" matches the word AI, not substrings.
export const AI_TERMS = [
  'AI', '"artificial intelligence"', '"machine learning"', 'LLM', 'LLMs', 'GPT', 'ChatGPT',
  'Claude', 'Gemini', 'OpenAI', 'Anthropic', 'Mistral', 'Llama', '"generative AI"', 'AGI',
  'chatbot', 'copilot', '"prompt engineering"', 'agentic',
];

// Strong, unambiguous AI signals for the relevance gate (word-boundary matched, so
// "ai" won't fire on "maintain"). An AI newsletter clears this easily.
const GATE_RE = /\b(ai|artificial intelligence|machine learning|llms?|gpt|chatgpt|claude|gemini|openai|anthropic|mistral|llama|generative ai|agi|neural networks?|chatbots?|copilot|prompt engineering|agentic)\b/gi;

export function filterEnabled() {
  return (process.env.NEWSLETTER_AI_FILTER || 'true').toLowerCase() !== 'false';
}

// The Gmail query fragment, e.g. (AI OR "artificial intelligence" OR …). Empty when
// filtering is off, so the search is unchanged.
export function gmailAiFilter() {
  if (!filterEnabled()) return '';
  const custom = process.env.NEWSLETTER_AI_TERMS;
  const terms = custom ? custom.split(',').map((s) => s.trim()).filter(Boolean) : AI_TERMS;
  return terms.length ? `(${terms.join(' OR ')})` : '';
}

// Is this email actually ABOUT AI (not a passing mention)? Passes if the subject
// carries an AI term, or the body has several distinct AI hits.
export function isAboutAI(subject = '', body = '') {
  if (!filterEnabled()) return true;
  if ((subject || '').match(GATE_RE)) return true;
  const hits = ((body || '').slice(0, 6000).match(GATE_RE) || []).length;
  return hits >= 3;
}
