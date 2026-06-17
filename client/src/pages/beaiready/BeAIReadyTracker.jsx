// BeAIReadyTracker — /tracker on the BE AI READY site. The Governance pillar's
// Legal / Ethics / Regulation tracker: AI lawsuits AND regulations worldwide, in
// two tabs, newest first. It reads the SAME live public feeds the Grounded
// tracker maintains (already sorted by most-recent event), so the data behind a
// client's governance and their AI policy is exactly what's shown here. Each row
// links to its full detail page. Real data only; honest empty states.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const TABS = [
  { key: 'lawsuits',    label: 'Lawsuits',    api: '/public/lawsuits?pageSize=40',    name: 'case_name',       base: '/legal/lawsuits' },
  { key: 'regulations', label: 'Regulations', api: '/public/regulations?pageSize=40', name: 'regulation_name', base: '/legal/regulations' },
  { key: 'briefings',   label: 'Daily briefings' },   // past "Today in AI governance" summaries
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
  const [tab, setTab] = useState('lawsuits');
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(null);
  const [facets, setFacets] = useState({ statuses: [], jurisdictions: [] });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [today, setToday] = useState(undefined); // undefined=loading, null=none yet
  const [history, setHistory] = useState(undefined); // past daily briefings
  const active = TABS.find((t) => t.key === tab);
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
    publicFetch('/public/governance-today').then((v) => setToday(v || null)).catch(() => setToday(null));
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

      {/* ── Today: a conversational, web-search-backed read on where AI governance
            stands right now — catches breaking news the lawsuit/regulation tracker
            doesn't (a model suspension, an enforcement action). Refreshed daily. ── */}
      {today && today.summary && (
        <section style={{ background: 'linear-gradient(180deg,#fff,#fbf7f4)', border: '1px solid #eaddd3', borderLeft: '4px solid #c75b39', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' }}>Today in AI governance</div>
            {today.generated_at && <div style={{ fontSize: 11.5, color: '#a89e92' }}>updated {fmtDate(today.generated_at)}</div>}
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.65, color: '#3a342e', margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{today.summary}</div>
          {today.headlines?.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {today.headlines.map((h, i) => (
                <a key={i} href={h.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: '#7a4636', background: '#f7ece7', padding: '3px 9px', borderRadius: 999, textDecoration: 'none', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.title} ↗
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e4dcd2', marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 15,
              fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? '#c75b39' : '#6b6359',
              borderBottom: tab === t.key ? '2px solid #c75b39' : '2px solid transparent', marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${active.label.toLowerCase()}…`} style={fInp} />
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
              {total != null ? `${total} ${active.label.toLowerCase()}${filtered ? ' (filtered)' : ''} · ` : ''}newest first
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
