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

// ── National Treasury eTender OCDS API (a REAL adapter) ─────────────────────
// SA's central eTender Publication Portal exposes every national / provincial /
// municipal / SOE tender as an Open Contracting Data Standard (OCDS) JSON feed —
// no auth, date-filterable. Docs: https://ocds-api.etenders.gov.za/swagger
//   GET /api/OCDSReleases?PageNumber&PageSize&dateFrom&dateTo  ->  { releases: [...] }
//
// We pull the releases advertised in the source's lookback window, keep the ones
// that fit the tenant's business (category / keyword prefilter from config so we
// don't run the whole national feed through extraction), and hand each to the
// pipeline as a labelled notice the field-extractor can read. The pipeline dedups
// on (source_id, external_id=ocid), so an overlapping lookback re-sees recent
// tenders cheaply and only processes genuinely new ones.
//
//   source.location = API base (default https://ocds-api.etenders.gov.za)
//   source.config   = {
//     lookback_days?: number   (default 3 — overlap absorbs a missed run; dedup is cheap)
//     categories?:  string[]   (OCDS mainProcurementCategory; default ['works'] = construction/infra)
//     keywords?:    string[]   (optional OR-match on title+description; [] = no keyword filter)
//     max_items?:   number     (safety cap on items handed downstream; default 200)
//     page_size?:   number     (default 50)
//   }
const ETENDERS_DEFAULT_BASE = 'https://ocds-api.etenders.gov.za';
const ETENDERS_DEAD_STATUS = ['cancelled', 'unsuccessful', 'withdrawn', 'complete'];
const ETENDERS_MAX_PAGES = 40;      // hard bound so a bad feed can't loop forever
const ETENDERS_TIMEOUT_MS = 30000;

const ymd = (d) => d.toISOString().slice(0, 10);

function etendersNoticeText(rel) {
  const t = rel.tender || {};
  const buyer = rel.buyer?.name || t.procuringEntity?.name || null;
  const val = t.value || {};
  const period = t.tenderPeriod || {};
  return [
    t.title ? `Title: ${t.title}` : null,
    t.id ? `Reference: ${t.id}` : null,
    buyer ? `Issuing body: ${buyer}` : null,
    t.mainProcurementCategory ? `Category: ${t.mainProcurementCategory}` : null,
    (t.procurementMethodDetails || t.procurementMethod) ? `Procurement method: ${t.procurementMethodDetails || t.procurementMethod}` : null,
    (val.amount != null && val.amount !== 0) ? `Estimated value: ${val.amount} ${val.currency || 'ZAR'}` : null,
    period.startDate ? `Advertised: ${period.startDate}` : null,
    period.endDate ? `Closing date: ${period.endDate}` : null,
    t.status ? `Status: ${t.status}` : null,
    t.description ? `\nDescription:\n${t.description}` : null,
  ].filter(Boolean).join('\n');
}

function etendersMatches(rel, { categories, keywords }) {
  const t = rel.tender || {};
  if (ETENDERS_DEAD_STATUS.includes(String(t.status || '').toLowerCase())) return false;
  if (categories.length) {
    const cat = String(t.mainProcurementCategory || '').toLowerCase();
    if (!categories.includes(cat)) return false;
  }
  if (keywords.length) {
    const hay = `${t.title || ''} ${t.description || ''}`.toLowerCase();
    if (!keywords.some((k) => hay.includes(k))) return false;
  }
  return true;
}

async function fetchEtendersOcds(source) {
  const cfg = source.config || {};
  const base = String(source.location || ETENDERS_DEFAULT_BASE).replace(/\/+$/, '');
  const lookbackDays = Number.isFinite(cfg.lookback_days) ? cfg.lookback_days : 3;
  const categories = (Array.isArray(cfg.categories) ? cfg.categories : ['works']).map((c) => String(c).toLowerCase());
  const keywords = (Array.isArray(cfg.keywords) ? cfg.keywords : []).map((k) => String(k).toLowerCase());
  const maxItems = Number.isFinite(cfg.max_items) ? cfg.max_items : 200;
  const pageSize = Number.isFinite(cfg.page_size) ? cfg.page_size : 50;

  const now = new Date();
  const dateFrom = ymd(new Date(now.getTime() - lookbackDays * 86400000));
  const dateTo = ymd(now);

  const items = [];
  const seen = new Set();
  let scanned = 0;
  let page = 1;

  try {
    for (let p = 0; p < ETENDERS_MAX_PAGES && items.length < maxItems; p++) {
      const url = `${base}/api/OCDSReleases?PageNumber=${page}&PageSize=${pageSize}&dateFrom=${dateFrom}&dateTo=${dateTo}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ETENDERS_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      } finally { clearTimeout(timer); }

      if (!res.ok) {
        return { items, note: `etenders OCDS: HTTP ${res.status} on page ${page} — kept ${items.length} before stopping.` };
      }
      const body = await res.json();
      const releases = Array.isArray(body?.releases) ? body.releases : [];
      if (releases.length === 0) break;
      scanned += releases.length;

      for (const rel of releases) {
        if (items.length >= maxItems) break;
        const ocid = rel.ocid || rel.tender?.id;
        if (!ocid || seen.has(String(ocid))) continue;
        if (!etendersMatches(rel, { categories, keywords })) continue;
        seen.add(String(ocid));
        items.push({
          text: etendersNoticeText(rel),
          externalId: String(ocid),
          url: `${base}/api/OCDSReleases/release/${encodeURIComponent(ocid)}`,
        });
      }
      if (releases.length < pageSize) break;  // last page
      page++;
    }
  } catch (err) {
    const why = err.name === 'AbortError' ? 'request timed out' : err.message;
    return { items, note: `etenders OCDS: ${why} — kept ${items.length} before stopping.` };
  }

  const filterDesc = `${categories.join('/') || 'all categories'}${keywords.length ? ' + keywords' : ''}`;
  return { items, note: `etenders OCDS: scanned ${scanned} release(s) ${dateFrom}→${dateTo}, kept ${items.length} matching ${filterDesc}.` };
}

const ADAPTERS = {
  upload:         fetchUpload,
  etenders_ocds:  fetchEtendersOcds,
  html:           fetchPortalStub,
  rss:            fetchPortalStub,
  puppeteer:      fetchPortalStub,
  email:          fetchPortalStub,
};

// Returns { items: [{text, externalId, url}], note? }.
export async function fetchSource(source) {
  const adapter = ADAPTERS[source.kind] || fetchPortalStub;
  const out = await adapter(source);
  return Array.isArray(out) ? { items: out } : out;
}

export const WIRED_KINDS = ['upload', 'etenders_ocds']; // kinds that actually produce items today
