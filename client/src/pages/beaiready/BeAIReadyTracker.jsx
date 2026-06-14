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
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

export default function BeAIReadyTracker() {
  const [tab, setTab] = useState('lawsuits');
  const [data, setData] = useState({}); // key -> array of items
  const active = TABS.find((t) => t.key === tab);

  useEffect(() => {
    if (data[tab]) return; // already loaded (empty array counts as loaded)
    publicFetch(active.api)
      .then((d) => setData((s) => ({ ...s, [tab]: Array.isArray(d) ? d : (d?.items || []) })))
      .catch(() => setData((s) => ({ ...s, [tab]: [] })));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

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
    </div>
  );
}
