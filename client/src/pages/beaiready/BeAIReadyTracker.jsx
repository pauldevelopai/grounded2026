// BeAIReadyTracker — /tracker on the BE AI READY site. The Governance pillar's
// Legal / Ethics / Regulation tracker: AI lawsuits AND regulations worldwide, in
// two tabs, newest first. It reads the SAME live public feeds the Grounded
// tracker maintains (already sorted by most-recent event), so the data behind a
// client's governance and their AI policy is exactly what's shown here. Each row
// links to its full detail page. Real data only; honest empty states.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

// Law and Regulation are peer first-class areas — not one tab hanging off the
// other (item 2). Each carries its own heading + lede so it reads as its own
// place. `countNoun` keeps the counts/search copy natural when the segment
// label is a short area name ("Law" → "40 lawsuits", not "40 law").
const SECTIONS = [
  { key: 'lawsuits',    label: 'Law',        name: 'case_name',       base: '/legal/lawsuits', countNoun: 'lawsuits',
    heading: 'Law — AI in the courts',
    lede: 'Every AI lawsuit we track worldwide — copyright, privacy, liability and more — newest first, each linking to the full case.' },
  { key: 'regulations', label: 'Regulation', name: 'regulation_name', base: '/legal/regulations', countNoun: 'regulations',
    heading: 'Regulation — the rules taking shape',
    lede: 'AI laws and regulations worldwide — enacted, proposed and in force — the frameworks your governance and AI policy are built against.' },
  { key: 'briefings',   label: 'Daily briefings', countNoun: 'briefings',
    heading: 'Daily briefings — where AI governance stands',
    lede: 'The archive of the daily “Today in AI governance” read — breaking developments the case and regulation feeds don’t capture on their own.' },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

// Relative age, anchored to *now*, so an old event reads plainly as past (not
// "future") and the freshness of the feed is honest at a glance.
const relAge = (d) => {
  if (!d) return '';
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 0) return 'upcoming';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) { const w = Math.round(days / 7); return `${w} week${w === 1 ? '' : 's'} ago`; }
  if (days < 365) { const m = Math.round(days / 30); return `${m} month${m === 1 ? '' : 's'} ago`; }
  const y = Math.round(days / 365); return `${y} year${y === 1 ? '' : 's'} ago`;
};

export default function BeAIReadyTracker() {
  // Deep-links from the governance views (e.g. /tracker?q=EU%20AI%20Act) land you
  // in the Regulation section, pre-searched — regulations are what those views cite.
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [tab, setTab] = useState(initialQ ? 'regulations' : 'lawsuits');
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(null);
  const [facets, setFacets] = useState({ statuses: [], jurisdictions: [] });
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [history, setHistory] = useState(undefined); // past daily briefings
  const active = SECTIONS.find((t) => t.key === tab);
  const filtered = !!(q.trim() || status || jurisdiction);
  const switchTab = (key) => { setTab(key); setItems(null); setQ(''); setStatus(''); setJurisdiction(''); };

  // Load the active feed (lawsuits / regulations) with filters; debounced on search.
  useEffect(() => {
    if (tab === 'briefings') return;
    const p = new URLSearchParams({ pageSize: '100' });
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (jurisdiction) p.set('jurisdiction', jurisdiction);
    const run = setTimeout(() => {
      publicFetch(`/public/${tab}?${p}`)
        .then((d) => {
          // Truly newest-first by recent ACTIVITY (latest event / last update) — the
          // server's GREATEST() sort can hoist a 2024 law with a future effective date
          // above this week's developments, which buried the fresh auto-added entries.
          const recency = (x) => new Date(x.latest_event_date || x.updated_at || x.created_at || 0).getTime();
          const list = (Array.isArray(d) ? d : (d?.items || [])).slice().sort((a, b) => recency(b) - recency(a));
          setItems(list);
          setTotal(typeof d?.total === 'number' ? d.total : list.length);
          // Capture filter options from the unfiltered load so they stay stable while filtering.
          if (!q.trim() && !status && !jurisdiction) {
            const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
            setFacets({ statuses: uniq(list.map((x) => x.status)), jurisdictions: uniq(list.map((x) => x.jurisdiction)) });
          }
        })
        .catch(() => { setItems([]); setTotal(0); });
    }, q ? 250 : 0);
    return () => clearTimeout(run);
  }, [tab, q, status, jurisdiction]);

  useEffect(() => {
    publicFetch('/public/governance-today/history').then((v) => setHistory(Array.isArray(v) ? v : [])).catch(() => setHistory([]));
  }, []);

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Governance · the tracker</div>
        <h1>AI law &amp; regulation, tracked daily.</h1>
        <p className="hub-lede">
          Every AI lawsuit and regulation we track, worldwide — newest first. The live infrastructure
          behind your governance: updated daily, the same feed your AI policy is built against.
        </p>
      </section>

      {/* The daily "Today in AI" read lives on the home page now — not repeated here.
          The archive is still available under the "Daily briefings" tab below. */}

      {/* Section switcher — Law and Regulation as peer first-class areas (item 2),
          styled as a segmented control rather than a thin secondary-tab underline. */}
      <div role="tablist" aria-label="Tracker sections"
        style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#f4efe9', border: '1px solid #e4dcd2', borderRadius: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {SECTIONS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => switchTab(t.key)}
            style={{
              padding: '9px 18px', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14.5,
              fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#fff' : '#6b6359',
              background: tab === t.key ? '#c75b39' : 'transparent',
              boxShadow: tab === t.key ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Each section leads with its own heading + lede, so Regulation reads as a
          first-class area in its own right — not a sub-view of the case tracker. */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: '#2b2620' }}>{active.heading}</h2>
        <p style={{ fontSize: 13.5, color: '#6b6359', margin: 0, maxWidth: '68ch', lineHeight: 1.55 }}>{active.lede}</p>
      </div>

      {tab === 'briefings' ? (
        // Past daily briefings — the archive of the "Today in AI governance" summary.
        history === undefined ? (
          <p style={{ color: '#8a8076' }}>Loading…</p>
        ) : history.length === 0 ? (
          <p style={{ color: '#8a8076' }}>No briefings yet — the first one publishes with the next daily run (05:00).</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {history.map((b) => (
              <li key={b.digest_date} className="hub-card">
                <div style={{ fontSize: 12, fontWeight: 700, color: '#c75b39' }}>{fmtDate(b.generated_at || b.digest_date)}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: '#3a342e', margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{b.summary}</div>
                {b.headlines?.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {b.headlines.map((h, i) => (
                      <a key={i} href={h.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: '#7a4636', background: '#f7ece7', padding: '3px 9px', borderRadius: 999, textDecoration: 'none', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.title} ↗
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {/* Filters — search, status, jurisdiction (server-side via the public API). */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${active.countNoun}…`} style={fInp} />
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={fInp}>
              <option value="">All statuses</option>
              {facets.statuses.map((s) => <option key={s} value={s}>{String(s).replace(/_/g, ' ')}</option>)}
            </select>
            <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} style={fInp}>
              <option value="">All jurisdictions</option>
              {facets.jurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
            {filtered && <button onClick={() => { setQ(''); setStatus(''); setJurisdiction(''); }} style={fClear}>Clear</button>}
          </div>

          {items != null && (
            <div style={{ fontSize: 11.5, color: '#a89e92', margin: '-2px 0 12px' }}>
              {total != null ? `${total} ${active.countNoun}${filtered ? ' (filtered)' : ''} · ` : ''}newest first
              {items.length > 0 && (() => {
                const newest = items[0]?.latest_event_date || items[0]?.updated_at;
                const a = relAge(newest);
                return newest ? ` · latest entry ${a}` : '';
              })()}
            </div>
          )}

          {items == null ? (
            <p style={{ color: '#8a8076' }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ color: '#8a8076' }}>{filtered ? 'No matches — try clearing the filters.' : 'Nothing to show right now.'}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {items.map((it) => (
                <li key={it.id}>
                  <Link to={`${active.base}/${it.id}`} className="hub-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15.5 }}>{it[active.name]}</span>
                      <span style={{ fontSize: 12, color: '#8a8076', whiteSpace: 'nowrap' }}>
                        {fmtDate(it.latest_event_date || it.updated_at)}
                        {(() => { const a = relAge(it.latest_event_date || it.updated_at); return a ? ` · ${a}` : ''; })()}
                        {it.status ? ` · ${String(it.status).replace(/_/g, ' ')}` : ''}
                      </span>
                    </div>
                    {it.latest_event_title && <div style={{ fontSize: 12.5, color: '#c75b39', marginTop: 2 }}>{it.latest_event_title}</div>}
                    {it.summary && <p style={{ fontSize: 13, color: '#4a443d', margin: '6px 0 0' }}>{it.summary}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

const fInp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: '#3a342e', flex: '1 1 200px', minWidth: 0 };
const fClear = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
