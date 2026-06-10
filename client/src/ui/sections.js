// GROUNDED information architecture — the single source of truth for the
// concept-note-led IA (see docs/GROUNDED_V3_BUILD_PLAN.md and PHASE1_CHECKLIST.md).
//
// The newsroom product is organised as the concept note's FIVE operational
// sections + THREE strategic layers + Profile. The nav, the section landing
// pages, and the Hub front door all read from this file so they can never drift.
//
// status: 'live'   — real and working today
//         'partial'— works but limited / shell (honest about it)
//         'soon'   — in development; renders an honest empty state, never fake data
// runs:   'online' | 'local' | 'both' | null  (how a function can be run)
//
// `to` is the in-app route once wired (Phase 1 step 2+). null = not routed yet.

export const SECTIONS = [
  {
    key: 'content-production',
    label: 'Content Production',
    accentVar: '--sec-content',
    blurb: 'The journalism agents — verify, research, write, gather, listen, archive, translate and produce — composed into workflows your team can run.',
    // `hub` = the public front-door for this section, shown on the logged-out
    // Hub. Omit it where there is no public page yet (honest: the card then
    // invites sign-in instead of linking somewhere fake).
    hub: { label: 'Explore the Nodes', href: '/nodes/', external: true },
    functions: [
      { name: 'Builder',                key: 'builder',     status: 'live',    runs: 'online', to: '/builder', blurb: 'Drag functions onto a canvas and wire them into saved workflows.' },
      { name: 'Run',                    key: 'run',         status: 'live',    runs: 'online', to: '/run',     blurb: 'Your team triggers the workflows the builder ships — no code, no prompts.' },
      { name: 'Verifier',               key: 'verifier',    status: 'live',    runs: 'both',   to: null, blurb: 'Checks claims against external sources and the newsroom archive; returns confidence, evidence, gaps.' },
      { name: 'Researcher',             key: 'researcher',  status: 'live',    runs: 'online', to: null, blurb: 'Pulls and scrapes public records, court filings and disclosures into a dossier.' },
      { name: 'Copywriter',             key: 'copywriter',  status: 'live',    runs: 'online', to: null, blurb: 'Writes social copy, headlines and scripts in the newsroom house style.' },
      { name: 'Digital News Gatherer',  key: 'gatherer',    status: 'live',    runs: 'online', to: null, blurb: 'Triages inbound tips and submissions into a single editor queue.' },
      { name: 'Social Media Listener',  key: 'listener',    status: 'live',    runs: 'online', to: null, blurb: 'Detects coordination and foreign-origin signals in social posts.' },
      { name: 'Archivist',              key: 'archivist',   status: 'partial', runs: 'local',  to: null, blurb: 'Semantic search over the newsroom’s own archive. Embeddings infra exists; per-newsroom index in progress.' },
      { name: 'Translator',             key: 'translator',  status: 'soon',    runs: 'local',  to: null, blurb: 'English ↔ African languages with a per-newsroom glossary that compounds with every edit.' },
      { name: 'Audio & Video Producer', key: 'producer',    status: 'partial', runs: 'both',   to: null, href: '/nodes/', blurb: 'Radio scripts, podcasts, audiograms and vertical video. Podcast Studio node exists; video path in progress.' },
    ],
  },
  {
    key: 'sustainability',
    label: 'Sustainability',
    accentVar: '--sec-sustain',
    blurb: 'The business of journalism — audience, revenue and distribution treated as first-class problems with first-class AI tooling.',
    hub: { label: 'Monetisation guide', href: '/monetisation', external: false },
    functions: [
      { name: 'Audience Signal',   key: 'audience',     status: 'live', runs: 'both',   to: null, href: '/nodes/', blurb: 'Reads what your audience actually rewards by beat, format and over time — engagement rate, not raw reach.' },
      { name: 'AI-Ready Archive',  key: 'airready',     status: 'live', runs: 'both',   to: null, href: '/nodes/', blurb: 'Turn your archive into AI-discoverable formats and control what crawlers and LLMs can see.' },
      { name: 'Fundraiser',        key: 'fundraiser',   status: 'soon', runs: 'online', to: null, blurb: 'A live funder library + grant-draft scaffolding. Newsroom-facing version in development (real funders only).' },
      { name: 'Operations Manager',key: 'operations',   status: 'soon', runs: 'online', to: null, blurb: 'Editorial calendar, freelancer coordination, logistics — AI across the whole organisation.' },
    ],
  },
  {
    key: 'ai-training',
    label: 'AI Training',
    accentVar: '--sec-training',
    blurb: 'The home of deep knowledge, manuals and courses for AI implementation — plus the weekly cohort feedback loop.',
    hub: { label: 'Explore training', href: '/training', external: false },
    functions: [
      { name: 'Pulse',              key: 'pulse',      status: 'partial', runs: 'online', to: '/admin/pulse', blurb: 'Quick check-in questions to each newsroom; surfaces real needs and feeds active development.' },
      { name: 'Courses & Manuals',  key: 'courses',    status: 'soon',    runs: 'online', to: null, blurb: 'A newsroom-facing library of manuals and video courses for AI implementation, ethics and management.' },
      { name: 'BetterBoss',         key: 'betterboss', status: 'soon',    runs: 'online', to: null, blurb: 'Clone an editor’s expertise in a field and use it to train junior staff.' },
    ],
  },
  {
    key: 'ai-governance',
    label: 'AI Governance',
    accentVar: '--sec-gov',
    blurb: 'The ethical, legal and regulatory frameworks for running an AI-first newsroom — tracked daily, scored to your jurisdiction.',
    hub: { label: 'Open the tracker', href: '/legal/dashboard', external: false },
    functions: [
      { name: 'Legal, Ethics & Regulation Tracker', key: 'tracker',   status: 'live',    runs: 'online', to: '/lawsuits', blurb: 'A daily feed of AI lawsuits, regulations and use-cases worldwide, cross-referenced and searchable.' },
      { name: 'Awareness',                          key: 'awareness', status: 'live',    runs: 'online', to: '/awareness', blurb: 'Data-security essentials for newsrooms — source protection, devices, accounts, surveillance.' },
      { name: 'Policy Builder',                     key: 'policy',    status: 'partial', runs: 'online', to: null, blurb: 'Build a newsroom AI-governance framework grounded in your own implementations, not a generic policy.' },
      { name: 'Digital Security Audit',             key: 'audit',     status: 'soon',    runs: 'online', to: null, blurb: 'Inventory external tools and score each against your jurisdiction pack; a prioritised fix list.' },
    ],
  },
  {
    key: 'african-languages',
    label: 'African Languages',
    accentVar: '--sec-lang',
    blurb: 'Translation, transcription and accent-aware speech for the languages most commercial AI handles poorly — improved by the network.',
    functions: [
      { name: 'Translation pipelines', key: 'pipelines', status: 'soon', runs: 'local', to: null, blurb: 'Per-newsroom translation tuned for newsroom contexts, not generic web translation.' },
      { name: 'Glossaries & style',    key: 'glossary',  status: 'soon', runs: 'local', to: null, blurb: 'Per-newsroom glossary and house-voice adapters that preserve style across languages.' },
      { name: 'Language data',         key: 'langdata',  status: 'soon', runs: 'local', to: null, blurb: 'Contribute consented, anonymised language pairs that improve the adapters everyone uses.' },
    ],
  },
];

// The three strategic layers — "where the newsroom understands and shares its work".
export const LAYERS = [
  {
    key: 'newsroom-workflow',
    label: 'Newsroom Workflow',
    accentVar: '--sec-strategic',
    blurb: 'A strategic view of the whole newsroom — every role, where AI helps, and where it could.',
    status: 'soon',
  },
  {
    key: 'knowledge-sector',
    label: 'Knowledge & Sector Intelligence',
    accentVar: '--sec-strategic',
    blurb: 'Reports and research, who else is in the sector, and the builders working on media-relevant AI.',
    status: 'soon',
  },
  {
    key: 'open-newsroom',
    label: 'Open Newsroom',
    accentVar: '--sec-strategic',
    blurb: 'Show funders what their grants produce, what AI contributed and how the work is made — on your terms.',
    status: 'soon',
  },
];

export const STATUS_LABEL = { live: 'Live', partial: 'In progress', soon: 'In development' };
export const RUNS_LABEL    = { online: 'Online', local: 'Local', both: 'Online or local' };

export function findSection(key) {
  return SECTIONS.find((s) => s.key === key) || LAYERS.find((l) => l.key === key) || null;
}
