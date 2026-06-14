// BeAIReadyToolbox — /toolbox on the BE AI READY site.
// The comprehensive AI toolbox we maintain in GROUNDED, rendered IN this site:
// the same curated, scored catalog (GET /api/public/toolkit) — every tool rated
// for cost, adoption difficulty and how much of your data it sees. Real entries
// only; honest empty state if the feed is unavailable.
import { useEffect, useMemo, useState } from 'react';
import { publicFetch } from '../../hooks/usePublicApi.js';

// CDI scores run 1 (low) … 5 (high). Low is always the safer/cheaper/easier end,
// so we colour higher values warmer as a quick "watch this" signal.
const CDI = [
  ['cdi_cost', 'Cost'],
  ['cdi_difficulty', 'Difficulty'],
  ['cdi_invasiveness', 'Data exposure'],
];

function Meter({ label, value }) {
  if (value == null) return null;
  const v = Number(value);
  const dot = (n) => (n <= v ? (v >= 4 ? '#c2410c' : v === 3 ? '#b45309' : '#16a34a') : '#e4dcd2');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b6359' }}>
      {label}
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: dot(n) }} />
        ))}
      </span>
    </span>
  );
}

export default function BeAIReadyToolbox() {
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    publicFetch('/public/toolkit')
      .then((d) => {
        setItems(Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []));
        setCats(Array.isArray(d?.categories) ? d.categories : []);
      })
      .catch(() => setItems([]));
  }, []);

  const categories = useMemo(() => ['all', ...cats.map((c) => c.name)], [cats]);

  const visible = (items || []).filter((t) =>
    (category === 'all' || t.primary_category === category) &&
    (!q || `${t.name} ${t.description || ''} ${t.primary_category || ''}`.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The active AI toolbox</div>
        <h1>The right tool — scored for cost, effort and data safety.</h1>
        <p className="hub-lede">
          The comprehensive AI toolbox we maintain in Grounded, in one place: what to use for each job,
          how hard it is to adopt, and how much of your data it sees. Audit clients get this mapped to
          their own functions in their dashboard.
        </p>
      </section>

      {items == null ? (
        <p style={{ color: '#8a8076' }}>Loading the toolbox…</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#8a8076' }}>The toolbox feed isn't available right now — try again shortly.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${items.length} tools…`}
              style={{ flex: '1 1 220px', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14 }} />
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, background: '#fff' }}>
              {categories.map((c) => <option key={c} value={c}>{c === 'all' ? `All categories (${items.length})` : c}</option>)}
            </select>
          </div>

          <section className="hub-grid">
            {visible.map((t) => (
              <div key={t.slug} className="hub-card">
                <div className="hub-card-kicker">{t.primary_category || 'tool'}</div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>
                  {t.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{t.name}</a> : t.name}
                </h3>
                {t.description && <p style={{ fontSize: 13, color: '#4a443d' }}>{t.description}</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                  {CDI.map(([k, label]) => <Meter key={k} label={label} value={t[k]} />)}
                </div>
              </div>
            ))}
            {visible.length === 0 && <p style={{ color: '#8a8076' }}>Nothing matches that filter.</p>}
          </section>
        </>
      )}
    </div>
  );
}
