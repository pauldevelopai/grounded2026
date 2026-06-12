// BeAIReadyToolbox — /toolbox on the BE AI READY site.
// The "active AI toolbox" (V2 brochure p.5) rendered IN this site — it pulls
// the same assessed-tools data the Grounded tracker maintains (shared public
// API), so the visitor never gets shoved off to another site. Real entries
// only; honest empty state if the feed is unavailable.
import { useEffect, useMemo, useState } from 'react';

export default function BeAIReadyToolbox() {
  const [tools, setTools] = useState(null);
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/public/tools', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTools(Array.isArray(d) ? d : []))
      .catch(() => setTools([]));
  }, []);

  const categories = useMemo(() => {
    const set = new Set((tools || []).map((t) => t.category).filter(Boolean));
    return ['all', ...[...set].sort()];
  }, [tools]);

  const visible = (tools || []).filter((t) =>
    (category === 'all' || t.category === category) &&
    (!q || `${t.name} ${t.vendor || ''} ${t.description || ''}`.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The active AI toolbox</div>
        <h1>The right tool, scored for data safety.</h1>
        <p className="hub-lede">
          A continuously updated guide to AI tools, methods and frameworks — what to use, what to
          avoid, and why — so your team is never guessing or experimenting with company data on the
          wrong platform. Audit clients get this mapped to their actual functions in their dashboard.
        </p>
      </section>

      {tools == null ? (
        <p style={{ color: '#8a8076' }}>Loading the toolbox…</p>
      ) : tools.length === 0 ? (
        <p style={{ color: '#8a8076' }}>The toolbox feed isn't available right now — try again shortly.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${tools.length} entries…`}
              style={{ flex: '1 1 220px', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14 }}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}
                    style={{ padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, background: '#fff' }}>
              {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
            </select>
          </div>

          <section className="hub-grid">
            {visible.map((t) => (
              <div key={t.id} className="hub-card">
                <div className="hub-card-kicker">{t.category || t.kind || 'tool'}{t.pricing ? ` · ${t.pricing}` : ''}</div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>
                  {t.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{t.name}</a> : t.name}
                  {t.vendor && <span style={{ color: '#8a8076', fontWeight: 400 }}> · {t.vendor}</span>}
                </h3>
                <p style={{ fontSize: 13, color: '#4a443d' }}>{t.description}</p>
                {(t.strengths || t.limitations) && (
                  <ul className="hub-card-points">
                    {t.strengths && <li><b>Use it for:</b> {t.strengths}</li>}
                    {t.limitations && <li><b>Watch out:</b> {t.limitations}</li>}
                  </ul>
                )}
              </div>
            ))}
            {visible.length === 0 && <p style={{ color: '#8a8076' }}>Nothing matches that filter.</p>}
          </section>
        </>
      )}
    </div>
  );
}
