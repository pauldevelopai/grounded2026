// The 4 operations tools, as workflow blocks.
//
// Each is the tool's CORE AI action ported natively: build a tool-specific prompt
// from the inputs, call the app's Claude service, return structured JSON. They
// register as category 'tool' so they're droppable in the Builder AND usable
// directly from a tool workspace (/tool/:slug). Deeper enrichment (newsroom
// profile, funder library, personas, live ops tables, jurisdiction packs) is a
// follow-up — exposed here as optional context inputs.
import { register } from './registry.js';
import { aiRun } from './ai.js'; // profile-aware Claude call + JSON parse

// ── Fundraiser ───────────────────────────────────────────────────────────────
register({
  slug: 'tool-fundraiser',
  name: 'Fundraiser',
  category: 'tool',
  icon: '💰',
  description: 'Drafts a grant application — sections, budget scaffold, and the questions still to answer.',
  inputs: {
    brief: { type: 'longtext', required: true, description: 'The funder + what you’re applying for + any context.' },
    kind: { type: 'string', required: false, description: 'proposal | letter_of_intent | report | budget' },
    targetAmount: { type: 'string', required: false, description: 'Optional target amount.' },
    durationMonths: { type: 'string', required: false, description: 'Optional grant length in months.' },
  },
  outputs: { output: { type: 'json', description: 'Structured draft (sections, budget scaffold, outstanding questions).' } },
  run: (input) => aiRun(
    `You are a grant-writer for an African newsroom. Produce a structured FIRST DRAFT grant ${input.kind || 'application'}.` +
    (input.targetAmount ? ` The budget should total ${input.targetAmount}.` : '') +
    (input.durationMonths ? ` Plan over ${input.durationMonths} months.` : '') +
    ` Return ONLY JSON: {"sections":[{"heading":"...","content":"..."}],"budget_scaffold":[{"line":"...","amount":"...","note":"..."}],"outstanding_questions":["..."]}.`,
    `Funder, the ask, and context:\n${input.brief || ''}`, 2800),
});

// ── Audience Analytics Manager ───────────────────────────────────────────────
register({
  slug: 'tool-audience',
  name: 'Audience Analytics Manager',
  category: 'tool',
  icon: '📈',
  description: 'Headline test, angle check, or an analytics question — grounded, practical advice.',
  inputs: {
    inputText: { type: 'longtext', required: true, description: 'Headline / angle / or your analytics question.' },
    kind: { type: 'string', required: false, description: 'headline_test | angle_check | analytics_query' },
    context: { type: 'longtext', required: false, description: 'Optional draft body, target audience, or analytics notes.' },
  },
  outputs: { output: { type: 'json', description: 'Assessment + recommendations (+ alternatives for headline tests).' } },
  run: (input) => aiRun(
    `You are an audience analytics advisor for a newsroom. The requested check is "${input.kind || 'analytics_query'}". ` +
    `For headline_test: score the headline out of 10 and give 3 stronger alternatives. For angle_check: strengths, risks, audience fit. ` +
    `For analytics_query: answer the question directly. Return ONLY JSON: {"assessment":"...","recommendations":["..."],"alternatives":["..."]}.`,
    `Input:\n${input.inputText || ''}\n\nContext:\n${input.context || '(none)'}`),
});

// ── Operations Manager ───────────────────────────────────────────────────────
register({
  slug: 'tool-operations',
  name: 'Operations Manager',
  category: 'tool',
  icon: '🗂️',
  description: 'Turns an operational focus or question into an actionable brief with owners + risks.',
  inputs: {
    briefInput: { type: 'longtext', required: true, description: 'The situation, focus, or question.' },
    kind: { type: 'string', required: false, description: 'calendar | deadlines | freelancers | finance | adhoc' },
  },
  outputs: { output: { type: 'json', description: 'Summary + action items + risks.' } },
  run: (input) => aiRun(
    `You are a newsroom operations manager. Focus area: "${input.kind || 'adhoc'}". Turn the input into an actionable brief. ` +
    `Return ONLY JSON: {"summary":"...","action_items":[{"task":"...","owner":"...","due":"..."}],"risks":["..."]}.`,
    `Operational input:\n${input.briefInput || ''}`),
});

// ── Digital Security Audit ───────────────────────────────────────────────────
register({
  slug: 'tool-security-audit',
  name: 'Digital Security Audit',
  category: 'tool',
  icon: '🔐',
  description: 'Risk-scores the tools/services a newsroom uses and drafts concrete fixes for its jurisdiction.',
  inputs: {
    toolsInventory: { type: 'longtext', required: true, description: 'The external tools/services you use (one per line).' },
    jurisdiction: { type: 'string', required: false, description: 'e.g. South Africa, Zimbabwe, Zambia, Kenya.' },
  },
  outputs: { output: { type: 'json', description: 'Overall risk band + per-tool risk/fix + priorities.' } },
  run: (input) => aiRun(
    `You are a digital-security auditor for a newsroom in "${input.jurisdiction || 'Africa'}". Risk-score each tool the newsroom uses and draft ` +
    `concrete fixes, mindful of source protection and local legal context. Return ONLY JSON: ` +
    `{"overall_risk_band":"low|medium|high|critical","tools":[{"name":"...","risk_band":"...","issue":"...","fix":"..."}],"priorities":["..."]}.`,
    `Tools / services in use:\n${input.toolsInventory || ''}`, 2400),
});
