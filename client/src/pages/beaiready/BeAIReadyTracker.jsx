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
  const [data, setData] = useState({}); // key -> array of items
  const [today, setToday] = useState(undefined); // undefined=loading, null=none yet
  const [history, setHistory] = useState(undefined); // past daily briefings
  const active = TABS.find((t) => t.key === tab);

  useEffect(() => {
    if (tab === 'briefings' || data[tab]) return; // briefings has no item feed; empty array counts as loaded
    publicFetch(active.api)
      .then((d) => setData((s) => ({ ...s, [tab]: Array.isArray(d) ? d : (d?.items || []) })))
      .catch(() => setData((s) => ({ ...s, [tab]: [] })));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    publicFetch('/public/governance-today').then((v) => setToday(v || null)).catch(() => setToday(null));
    publicFetch('/public/governance-today/history').then((v) => setHistory(Array.isArray(v) ? v : [])).catch(() => setHistory([]));
  }, []);

  const items = data[tab];

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
          <button key={t.key} onClick={() => setTab(t.key)}
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
          {items != null && items.length > 0 && (
            <div style={{ fontSize: 11.5, color: '#a89e92', margin: '-6px 0 12px' }}>
              Newest first · as of {fmtDate(new Date())}
              {(() => {
                const newest = items[0]?.latest_event_date || items[0]?.updated_at;
                const a = relAge(newest);
                return newest ? ` · latest entry ${a}` : '';
              })()}
            </div>
          )}

          {items == null ? (
            <p style={{ color: '#8a8076' }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ color: '#8a8076' }}>Nothing to show right now.</p>
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

          <div className="hub-hero-cta" style={{ margin: '20px 0 24px' }}>
            <Link to={active.base} className="hub-btn hub-btn-ghost">Open the full {active.label.toLowerCase()} tracker, with filters →</Link>
          </div>
        </>
      )}
    </div>
  );
}
