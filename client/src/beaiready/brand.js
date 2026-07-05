// Host-aware page metadata (item 7).
//
// The same Vite bundle + the same static client/dist/index.html serves BOTH
// doors — grounded.developai.co.za (the newsroom side) and
// beaiready.developai.co.za (the business side) — so index.html hard-codes the
// "Grounded" title + OG tags for both. A blind global swap would rebrand the
// newsroom door too, so we fix the title/OG at runtime, keyed on the host.
//
// This is the client-side head-manager: it updates the VISIBLE browser-tab
// title + the OG/Twitter meta on every BAIR page for real (JS-running)
// visitors. Note: social crawlers don't run JS, so for the BAIR *root* they
// still see index.html's Grounded defaults — that (crawler OG on the marketing
// root) needs infra (route the BAIR root through Node, or a build-time second
// shell) and is tracked separately. BAIR detail-page OG is handled server-side
// in server/routes/public-html.js.

// Same detection as App.jsx's IS_BEAIREADY (kept in sync deliberately): the
// live host, plus a DEV-only sessionStorage flag because the browser can't
// resolve beaiready.localhost.
export const IS_BEAIREADY =
  typeof window !== 'undefined' &&
  (window.location.hostname.startsWith('beaiready') ||
    (import.meta.env.DEV && window.sessionStorage.getItem('beaiready') === '1'));

const BEAIREADY_META = {
  title:       'Be AI Ready — get your business AI-ready',
  siteName:    'Be AI Ready',
  description: 'Be AI Ready gets your business ready to use AI safely and well — capture your knowledge, train your team, put governance in place, and measure what AI saves you. By Develop AI.',
};

function setMeta(selector, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute('content', value);
}

// Rewrite the head for the BAIR door. No-op on the Grounded door so the
// newsroom side keeps its own title/OG untouched.
export function applyBrandHead() {
  if (!IS_BEAIREADY) return;
  document.title = BEAIREADY_META.title;
  setMeta('meta[property="og:title"]',     BEAIREADY_META.title);
  setMeta('meta[name="twitter:title"]',    BEAIREADY_META.title);
  setMeta('meta[property="og:site_name"]', BEAIREADY_META.siteName);
  setMeta('meta[name="description"]',       BEAIREADY_META.description);
  setMeta('meta[property="og:description"]',  BEAIREADY_META.description);
  setMeta('meta[name="twitter:description"]', BEAIREADY_META.description);
}
