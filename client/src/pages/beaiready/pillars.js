// BE AI READY — the product's pillar structure, single source of truth.
// The nav, the home map and the pillar pages all read from this so they can't
// drift. Paul's definition (2026-06-12): six pillars, each with sub-features.
//
// `status` is HONEST about what exists today — this is also the build map:
//   'live'     — real and usable now
//   'partial'  — exists but limited / consultant-delivered / data-entry only
//   'building' — not built yet; the page says so plainly (no fake data)
//
// Each feature declares ONE destination:
//   to:   a direct public page on this site (tracker, toolbox, training).
//   dash: a per-client dashboard tool behind sign-in. The pillar links to the
//         feature GATEWAY (/feature/:slug) — a public explainer that sends a
//         signed-in user straight in, and a visitor to a friendly sign-in (never
//         a bare login screen). Requires `slug`.
//   node: a hosted Node (served by Caddy at `runUrl`, e.g. /nodes/aiready/app/).
//         The gateway sends a signed-in user straight into the Node and a visitor
//         to a friendly sign-in. Requires `slug` + `runUrl`.
//   neither (status 'building'): links to the gateway, which shows an honest
//         "in development" page. Requires `slug`.

export const STATUS_LABEL = {
  live: 'Live',
  partial: 'In progress',
  building: 'In development',
};

// "Book a scoping call" → a WhatsApp chat (not email).
export const SCOPING_WHATSAPP =
  'https://wa.me/27722337458?text=' +
  encodeURIComponent("Hi, I'd like to book a Be AI Ready scoping call.");

export const PILLARS = [
  {
    key: 'visibility',
    nav: 'Visibility',
    label: 'Visibility',
    tagline: 'Be the answer AI gives.',
    intro:
      'When a customer asks ChatGPT, Claude or Gemini who to trust in your industry, the answer comes ' +
      'back in seconds — assembled from whatever those systems can find about you. We take command of how ' +
      'AI sees your business, and structure your data so you appear as the answer.',
    features: [
      { name: 'How AI sees your business', status: 'partial', dash: '/dashboard/visibility', slug: 'visibility-scan',
        what: 'Run a scan of how AI describes your business — whether you’re named, how, and what’s wrong or missing. v1 queries Claude; ChatGPT & Gemini added once keys are configured.' },
    ],
  },
  {
    key: 'governance',
    nav: 'Governance',
    label: 'Governance',
    tagline: 'Sound rules, clear accountability.',
    intro:
      'The ethical, legal and regulatory side of running an AI-first business — tracked daily and turned ' +
      'into a policy your business actually owns.',
    // Only two panels on the pillar page (Paul, 2026-07-08): the live tracker and
    // the policy builder. Everything else is surfaced as panels INSIDE the policy
    // dashboard (dashPanels below) rather than on the pillar page.
    features: [
      { name: 'Legal, Ethics & Regulation tracker', status: 'live', to: '/tracker',
        what: 'A daily-updated feed of AI lawsuits and regulations worldwide — in one place, newest first — the live infrastructure that keeps your governance current.' },
      { name: 'Build your AI policy', status: 'live', dash: '/dashboard/governance', slug: 'ai-policy',
        what: 'A bespoke AI-use policy — pick the sections you need (data & POPIA, acceptable use, tool rules, EU AI Act alignment and more), generated from your own governance data, then edited and owned by you. Lives in your dashboard.' },
    ],
    // The governance toolkit — reached from panels on /dashboard/governance (the
    // "Build your AI policy" page), not the pillar page. Data Security's two
    // features are folded in here by the re-home step below.
    dashPanels: [
      { name: 'The rules that apply to you', status: 'live', dash: '/dashboard/governance/legal', slug: 'legal-framework',
        what: 'A plain-language read of the legal frameworks you operate under — POPIA and the EU AI Act — mapped onto the AI systems you\'ve logged, so you can see which rules bite hardest.' },
      { name: 'Controls Library', status: 'live', dash: '/dashboard/governance/controls', slug: 'controls-library',
        what: 'The safeguards your business runs — adopt framework-backed starters, get suggestions grounded in governance sources, and link each control to the AI systems it covers.' },
      { name: 'Roles & Review', status: 'live', dash: '/dashboard/governance/review', slug: 'roles-review',
        what: 'Name who’s accountable, set a review cadence, and keep the log of reviews and incidents — the routine that stops your governance going stale.' },
      { name: 'Governance Assessment', status: 'live', dash: '/dashboard/governance/assessment', slug: 'gov-assessment',
        what: 'Self-assess whether your business is up to scratch on AI governance — scored across four domains, with a clear picture of your gaps.' },
      { name: 'Governance Learning', status: 'live', dash: '/dashboard/governance/learning', slug: 'gov-learning',
        what: 'A four-part course teaching your staff the ins and outs of AI governance — foundations, the rules, building it in, and governing AI in use.' },
    ],
  },
  {
    key: 'data-security',
    nav: 'AI Data Security',
    label: 'AI Data Security',
    tagline: 'Know every tool. Plug every leak.',
    intro:
      'Every interaction with AI is a data decision. Log the AI tools your company actually uses, see what ' +
      'each one collects, and get a clear ruling on what is acceptable — and what to stop.',
    features: [
      { name: 'AI System Register & Risk', status: 'live', dash: '/dashboard/security', slug: 'ai-tools-log',
        what: 'A living register of every AI system — purpose, owner, data, paid/free, lifecycle — with an EU AI Act risk tier for each, classified against live governance sources and cited.' },
      { name: 'What’s acceptable, what isn’t', status: 'live', dash: '/dashboard/security', slug: 'acceptable-use',
        what: 'An acceptability ruling per tool (approved / restricted / avoid) with a prioritised fix — which leaks to plug first, and how.' },
    ],
  },
  {
    key: 'productivity',   // key kept for routing/recs continuity; displayed as "Tools"
    nav: 'Tools',
    label: 'Tools',
    tagline: 'The AI tools your team actually uses.',
    intro:
      'The practical AI tools for getting work done — a continuously scored toolbox of the best AI tools for ' +
      'each job, and the Nodes your business runs and owns. (Your team’s shared, knowledge-grounded AI now ' +
      'lives in KnowHow, under Knowledge.)',
    features: [
      { name: 'AI Toolbox', status: 'live', to: '/toolbox',
        what: 'A continuously updated guide to the best AI tools for each function — what to use, what to avoid, and why — scored for cost, difficulty and data safety.' },
      { name: 'Prompt library', status: 'live', dash: '/dashboard/prompts', slug: 'prompt-library',
        what: 'The prompts we recommend for the AI model your team uses — scored per model — plus your own saved versions. Copy, rate, and build your own library.' },
      { name: 'Nodes', status: 'live', to: '/nodes',
        what: 'Small AI tools your business runs and owns — like Extract PDF: drop in a document, get trusted structured data back. Run them here, or download and run on your own machine.' },
      { name: 'Measure what AI is saving your team', status: 'live', dash: '/dashboard/productivity', slug: 'productivity-tracking',
        what: 'Five measures only — deliverables, revenue, time spent, AI hours saved, client outcomes — entered at the business level with your own baselines. Never used to police individuals.' },
    ],
  },
  {
    key: 'training',
    nav: 'Training',
    label: 'Training',
    tagline: 'Change what your team does on Monday.',
    intro:
      'Hands-on, practical AI training — with a living record of it in your dashboard, a read on where ' +
      'your team needs support, and the tools to capture their hard-won know-how.',
    features: [
      { name: 'Book a training', status: 'live', to: '/training/book',
        what: 'A hands-on one-day on-site training + three mentoring sessions (R35k, up to 30 people) — the strongest place to start. See the full offer and book a date.' },
      { name: 'Course materials — past & upcoming', status: 'partial', to: '/training',
        what: 'Every training and mentoring session you’ve had, and what’s scheduled — with the materials, accessible to your staff at any time.' },
      { name: 'KnowHow', status: 'live', dash: '/dashboard/knowhow', slug: 'knowhow',
        what: 'Your team’s AI, grounded in your own knowledge — ask anything, add your documents, website and notes, and capture the know-how in people’s heads. Every answer is kept, so the business builds on it.' },
    ],
  },
  {
    key: 'strategy',
    nav: 'Strategy',
    label: 'Strategy',
    tagline: 'The bigger picture — and what’s next.',
    intro:
      'Once your knowledge shows how the business really runs, this is where we advise on using AI to your ' +
      'advantage: where it genuinely saves time and money, and which friction is worth fixing first.',
    features: [
      { name: 'Goals, workflow & automation roadmap', status: 'partial', dash: '/dashboard/strategy', slug: 'strategy-roadmap',
        what: 'A clear map of how your business runs — every step and hand-off — and which parts AI should take on first, sized by effort and payoff: your practical automation roadmap, built with your team.' },
      // Measurement lives here as a card (Paul, 2026-07-13) rather than its own top-nav
      // tab — links to the Measurement pillar page (/pillar/measurement), still intact.
      { name: 'Measurement — goals & results', status: 'live', to: '/pillar/measurement',
        what: 'Agree clear goals at the start — time saved, cost cut, capability gained — then measure the results against them, so the value of the work is something you can see, not just claim.' },
      // Defined here for continuity, but re-homed to Training by the block below.
      { name: 'Staff AI Needs', status: 'partial', dash: '/dashboard/staff-needs', slug: 'staff-needs',
        what: 'A read on where your team stands and what they need, drawn from the competency forms they complete — so your AI strategy targets the real gaps.' },
    ],
  },

  // ── Knowledge (the foundation) ──────────────────────────────────────────────────
  // Be AI Ready starts here: capture the hard-won knowledge in people's heads and
  // scattered files, organise it into something the business can actually use (kept
  // private), and surface the right parts of it to the world. Features assembled in
  // the consolidation block below: KnowHow (capture) + the two Visibility features
  // (knowledge surfaced outward, Paul 2026-06-24).
  {
    key: 'knowledge',
    nav: 'Knowledge',
    label: 'Knowledge',
    tagline: 'Start with what you already know.',
    intro:
      'Most businesses sit on hard-won knowledge that lives in people’s heads and scattered files, and is easily ' +
      'lost when they’re busy or leave. Be AI Ready begins by capturing it and organising it into something you ' +
      'can actually use — kept private to your business — and surfacing the right parts of it so AI systems ' +
      'describe you correctly.',
    features: [],   // assembled in the consolidation block below
  },

  // ── Measurement ─────────────────────────────────────────────────────────────────
  // Agree the goals up front, then prove the results against them. Takes productivity
  // tracking (moved from Tools) plus the goals-and-results flow.
  {
    key: 'measurement',
    nav: 'Measurement',
    label: 'Measurement',
    tagline: 'Agree the goals. Prove the results.',
    intro:
      'We agree clear goals at the start — how much time will be saved, how much cost cut, how much more capable ' +
      'the business has become — then measure the results against them, so you can see in concrete terms that ' +
      'the work was worth doing.',
    features: [
      { name: 'Goals & results', status: 'live', dash: '/dashboard/productivity', slug: 'goals-results',
        what: 'Measurable goals agreed at the start of the engagement — baseline to target — tracked against your real metrics, so the value of the work is something you can see, not just claim.' },
    ],
  },
];

// Re-home features so the six visible pillars match the Be AI Ready model (Paul,
// 2026-06-24). One source of truth per feature: the original pillar defs (Visibility,
// Data Security) stay intact and their /dashboard tools keep working — features are
// just moved by reference into the pillar that now owns them.
//   • Knowledge (foundation) absorbs KnowHow (capture) + Visibility (knowledge
//     surfaced to the world).
//   • Governance absorbs Data Security (keeping that knowledge safe to use & share).
//   • Measurement takes productivity tracking (from Tools).
//   • Staff AI Needs sits with Training (a training-needs read).
(() => {
  const byKey = (k) => PILLARS.find((p) => p.key === k);
  const pull = (pillarKey, slug) => {
    const p = byKey(pillarKey);
    const f = p && p.features.find((x) => x.slug === slug);
    if (f) p.features = p.features.filter((x) => x.slug !== slug);
    return f;
  };
  const training = byKey('training');
  const knowledge = byKey('knowledge');
  const measurement = byKey('measurement');

  // Knowledge = KnowHow (the one tool: ask + your documents + capture) + the AI-visibility scan.
  knowledge.features = [
    pull('training', 'knowhow'),
    pull('visibility', 'visibility-scan'),
  ].filter(Boolean);

  // Staff AI Needs: Strategy → Training.
  const staffNeeds = pull('strategy', 'staff-needs');
  if (staffNeeds) training.features = [...training.features, staffNeeds];

  // AI Data Security is now its OWN top-level pillar (Paul, 2026-07-13) — no longer
  // folded into Governance. It keeps its two features (register + acceptable use), so
  // the /pillar/data-security page renders them directly.

  // Measurement takes productivity tracking (ahead of the Goals & results stub).
  const productivity = pull('productivity', 'productivity-tracking');
  if (productivity) measurement.features = [productivity, ...measurement.features];
})();

// Pillars shown in the nav + on the home page (Paul, 2026-07-13): Knowledge leads
// (the inside-out foundation), then Training, Governance, AI Data Security, Tools,
// Strategy. Measurement is no longer a top-level tab — it's surfaced as a card on the
// Strategy page (its /pillar/measurement page still exists). The array order here is
// the displayed order.
const VISIBLE_KEYS = ['knowledge', 'training', 'governance', 'data-security', 'productivity', 'strategy'];
export const VISIBLE_PILLARS = VISIBLE_KEYS.map((k) => PILLARS.find((p) => p.key === k)).filter(Boolean);

export function findPillar(key) {
  return PILLARS.find((p) => p.key === key) || null;
}

// Look up a feature (and its parent pillar) by its gateway slug. Searches both the
// pillar-page features and the dashboard-only panels (dashPanels) so a moved
// feature's /feature/:slug gateway still resolves.
export function findFeature(slug) {
  for (const pillar of PILLARS) {
    const feature = [...(pillar.features || []), ...(pillar.dashPanels || [])].find((f) => f.slug === slug);
    if (feature) return { pillar, feature };
  }
  return null;
}
