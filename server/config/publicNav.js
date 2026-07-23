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
// The BE AI READY pillars are surfaced separately, as top-nav TABS that open the
// pillar splash pages (/pillar/:key) — see PublicLayout.jsx — not as entries here.

export const PUBLIC_NAV = {
  builder: [
    // Nodes lives in the Tools pillar (and its own front door) — not duplicated here.
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
    { label: 'Sources', href: '/legal/sources' },
  ],
  training: [
    { label: 'Training', href: '/training' },
    { label: 'Sources', href: '/legal/sources' },
  ],
};
