// LeadFinder — source-fetch dispatcher.
//
// Given a leadfinder.sources row, return the NEW documents to run through the
// pipeline as [{ text, externalId, url }]. The source model is configurable
// across kinds (build brief §4A); each kind has its own adapter. 'upload' is the
// always-available kind (documents are pushed in via the surface, not pulled),
// so it yields nothing on a scheduled pull. Portal kinds (html/rss/puppeteer)
// are wired per real source — until a tenant configures one with the selectors
// it needs, the adapter honestly returns nothing rather than fabricate leads.
//
// Adding a real portal later = writing its adapter here + the source's `config`
// (selectors/auth) — no schema or pipeline change.

// eslint-disable-next-line no-unused-vars
async function fetchUpload(source) {
  // Uploads are ingested at upload time (surface POST /tenders/upload), not pulled.
  return [];
}

async function fetchPortalStub(source) {
  // Placeholder for html/puppeteer/rss adapters. Real implementation reads
  // source.config (list URL, item selectors, pagination) and returns items.
  // Returns [] + a note so a run logs "adapter not wired" instead of inventing data.
  return { items: [], note: `Adapter for kind '${source.kind}' not wired yet — configure the portal + selectors.` };
}

const ADAPTERS = {
  upload:    fetchUpload,
  html:      fetchPortalStub,
  rss:       fetchPortalStub,
  puppeteer: fetchPortalStub,
  email:     fetchPortalStub,
};

// Returns { items: [{text, externalId, url}], note? }.
export async function fetchSource(source) {
  const adapter = ADAPTERS[source.kind] || fetchPortalStub;
  const out = await adapter(source);
  return Array.isArray(out) ? { items: out } : out;
}

export const WIRED_KINDS = ['upload']; // kinds that actually produce items today
