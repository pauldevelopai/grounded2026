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
      { name: 'Your data, structured for AI', status: 'building', slug: 'visibility-data',
        what: 'Your content and data shaped so AI systems read, trust and cite you correctly — accurately and currently.' },
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
    features: [
      { name: 'Legal, Ethics & Regulation tracker', status: 'live', to: '/tracker',
        what: 'A daily-updated feed of AI lawsuits and regulations worldwide — in one place, newest first — the live infrastructure that keeps your governance current.' },
      { name: 'Build your AI policy', status: 'live', dash: '/dashboard/governance', slug: 'ai-policy',
        what: 'A bespoke AI-use policy, generated from a short brief, then edited and owned by you — aligned with POPIA. Lives in your dashboard.' },
    ],
  },
  {
    key: 'data-security',
    nav: 'Data Security',
    label: 'Data Security',
    tagline: 'Know every tool. Plug every leak.',
    intro:
      'Every interaction with AI is a data decision. Log the AI tools your company actually uses, see what ' +
      'each one collects, and get a clear ruling on what is acceptable — and what to stop.',
    features: [
      { name: 'Log your company’s AI tools', status: 'live', dash: '/dashboard/security', slug: 'ai-tools-log',
        what: 'Log every AI tool in use — official and unofficial — and what data goes into each. Auto-matched to our assessed-tools database.' },
      { name: 'What’s acceptable, what isn’t', status: 'live', dash: '/dashboard/security', slug: 'acceptable-use',
        what: 'An acceptability ruling per tool (approved / restricted / avoid) with a prioritised fix — which leaks to plug first, and how.' },
    ],
  },
  {
    key: 'productivity',
    nav: 'Productivity',
    label: 'Productivity',
    tagline: 'Get more done — measured fairly.',
    intro:
      'AI should show whether work is moving, not watch your people. A set of tools built around how small ' +
      'and medium businesses actually run.',
    features: [
      { name: 'AI Toolbox', status: 'live', to: '/toolbox',
        what: 'A continuously updated guide to the best AI tools for each function — what to use, what to avoid, and why — scored for cost, difficulty and data safety.' },
      { name: 'Track employee productivity', status: 'live', dash: '/dashboard/productivity', slug: 'productivity-tracking',
        what: 'Five measures only — deliverables, revenue, time spent, AI hours saved, client outcomes — entered at the business level with your own baselines. Never used to police individuals.' },
      { name: 'BetterBoss', status: 'building', slug: 'betterboss',
        what: 'Capture a manager’s hard-won expertise and turn it into an AI guide that coaches junior staff through their real work.' },
    ],
  },
  {
    key: 'training',
    nav: 'Training',
    label: 'Training',
    tagline: 'Change what your team does on Monday.',
    intro:
      'Hands-on, practical AI training — and a living record of it in your dashboard.',
    features: [
      { name: 'Book a training', status: 'live', to: '/training',
        what: 'A hands-on one-day on-site training + three mentoring sessions (R35k, up to 30 people) — the strongest place to start. See the full offer and book a date.' },
      { name: 'Course materials — past & upcoming', status: 'partial', dash: '/dashboard/training', slug: 'training-materials',
        what: 'Every training and mentoring session you’ve had, and what’s scheduled — with the materials, accessible to your staff at any time.' },
      { name: 'Staff AI-competency', status: 'partial', dash: '/dashboard/training', slug: 'staff-competency',
        what: 'A read on where your team stands, drawn from the competency forms they complete — so training targets the real gaps.' },
    ],
  },
  {
    key: 'strategy',
    nav: 'Strategy',
    label: 'Your AI Strategy',
    tagline: 'Plot the goals. Find what to automate.',
    intro:
      'We map your company’s goals and your full workflow end to end, then identify exactly which parts ' +
      'are worth automating with AI — and in what order.',
    features: [
      { name: 'Goals & workflow map', status: 'building', slug: 'strategy-goals',
        what: 'A clear map of how your business actually runs — every step, every hand-off — built with your team.' },
      { name: 'Automation opportunities, prioritised', status: 'building', slug: 'strategy-automation',
        what: 'Which parts of that workflow AI should take on first, sized by effort and payoff — your practical automation roadmap.' },
    ],
  },
];

export function findPillar(key) {
  return PILLARS.find((p) => p.key === key) || null;
}

// Look up a feature (and its parent pillar) by its gateway slug.
export function findFeature(slug) {
  for (const pillar of PILLARS) {
    const feature = pillar.features.find((f) => f.slug === slug);
    if (feature) return { pillar, feature };
  }
  return null;
}
