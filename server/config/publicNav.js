// Canonical public-site navigation — the SINGLE SOURCE OF TRUTH for the
// top-nav dropdowns shown across Grounded. Both consumers fetch it via
// GET /api/public/nav and keep their own hardcoded copy only as an offline
// fallback:
//   • the tracker SPA  → client/src/pages/public/PublicLayout.jsx
//   • the Nodes front door → pauldevelopai/nodes → chrome.js
// Edit the menu HERE; both surfaces pick it up on next load. (Home + the auth
// area are rendered by each surface itself and are not part of this payload.)
//
// Item shape: { label, href, external? }  (external = leaves the SPA / full nav)
//
// The first three groups (builder / tracker / training) are the original
// Grounded menus — the Nodes front door renders exactly these keys. The
// remaining groups (knowledge / governance / cybersecurity / tools / strategy)
// are the BE AI READY pillar menus, ported into the Grounded nav so a newsroom
// can find the full toolset from the top bar. Their tool links are behind
// sign-in (the /dashboard/* + /business product routes); a logged-out visitor
// clicking one lands on the sign-in prompt.

export const PUBLIC_NAV = {
  builder: [
    { label: 'Nodes', href: '/nodes/', external: true },
    { label: 'Tool Search', href: '/tools/', external: true },
    { label: 'Workflow builder', href: '/builder' },
    { label: 'Monetisation', href: '/monetisation' },
  ],
  tracker: [
    { label: 'Dashboard', href: '/legal/dashboard' },
    { label: 'Lawsuits', href: '/legal/lawsuits' },
    { label: 'Regulations', href: '/legal/regulations' },
    { label: 'Connections', href: '/legal/explore' },
    { label: 'Use cases', href: '/legal/use-cases' },
    { label: 'Ethics', href: '/legal/ethics' },
    { label: 'Ethics Policy Builder', href: '/legal/ethics-builder' },
  ],
  training: [
    { label: 'Training & courses', href: '/training' },
    { label: 'Staff AI needs', href: '/dashboard/staff-needs' },
    { label: 'New-staff coach', href: '/dashboard/coach' },
    { label: 'Sources', href: '/legal/sources' },
  ],

  // ── BE AI READY pillar menus (ported) ──────────────────────────────────────
  knowledge: [
    { label: 'Your dashboard', href: '/business' },
    { label: 'KnowHow — capture & ask', href: '/dashboard/knowhow' },
    { label: 'How AI sees your newsroom', href: '/dashboard/visibility' },
    { label: 'Your documents', href: '/dashboard/extraction' },
    { label: 'Team AI workspace', href: '/dashboard/workspace' },
  ],
  governance: [
    { label: 'AI Policy builder', href: '/dashboard/governance' },
    { label: 'The rules that apply', href: '/dashboard/governance/legal' },
    { label: 'Controls Library', href: '/dashboard/governance/controls' },
    { label: 'Roles & Review', href: '/dashboard/governance/review' },
    { label: 'Governance Assessment', href: '/dashboard/governance/assessment' },
    { label: 'Governance Learning', href: '/dashboard/governance/learning' },
    { label: 'Legal & Regulation tracker', href: '/legal/dashboard' },
  ],
  cybersecurity: [
    { label: 'AI System Register & Risk', href: '/dashboard/security' },
    { label: 'Awareness — data security', href: '/awareness' },
  ],
  tools: [
    { label: 'Nodes', href: '/nodes/', external: true },
    { label: 'Functions directory', href: '/functions' },
    { label: 'Prompt library', href: '/dashboard/prompts' },
    { label: 'LeadFinder', href: '/leadfinder' },
    { label: 'Productivity & impact', href: '/dashboard/productivity' },
  ],
  strategy: [
    { label: 'Goals & automation roadmap', href: '/dashboard/strategy' },
    { label: 'Measurement — goals & results', href: '/dashboard/productivity' },
  ],
};
