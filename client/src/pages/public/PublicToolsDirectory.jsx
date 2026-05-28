// Open-source tools directory — published by the tools scraper + AI pipeline.
// A browsable, newsroom-focused catalogue of open-source tools/modules to use
// or download. Part of the Builder section.
import { useEffect, useState } from 'react';

export default function PublicToolsDirectory() {
  const [tools, setTools] = useState([]);
  const [cat, setCat] = useState('all');

  useEffect(() => {
    fetch('/api/public/oss-tools')
      .then(r => r.json())
      .then(d => setTools(d.items || []))
      .catch(() => setTools([]));
  }, []);

  const categories = ['all', ...Array.from(new Set(tools.map(t => t.category).filter(Boolean))).sort()];
  const shown = cat === 'all' ? tools : tools.filter(t => t.category === cat);

  return (
    <div>
      <section style={{ marginBottom: 24, maxWidth: 760 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
          Builder · Open source
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '0 0 12px 0', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Open-source tools for newsrooms
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Free, open-source tools, modules and downloads a newsroom can adopt — surfaced and
          summarised automatically, then curated by the team.
        </p>
      </section>

      {tools.length === 0 ? (
        <div className="card" style={{ padding: 24, color: 'var(--text-secondary)' }}>
          No tools published yet — they'll appear here as the team curates them.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {categories.map(c => (
              <button key={c} onClick={() => setCat(c)}
                      style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', textTransform: 'capitalize',
                               border: '1px solid var(--border-color)', background: cat === c ? 'var(--accent)' : 'var(--card-bg)', color: cat === c ? '#fff' : 'var(--text-primary)' }}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {shown.map(t => (
              <div key={t.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent)' }}>{t.category}</span>
                  {t.language && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>· {t.language}</span>}
                  {t.license && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>· {t.license}</span>}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px 0' }}>
                  {t.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{t.name}</a> : t.name}
                </h3>
                {t.description && <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 10px 0', flex: 1 }}>{t.description}</p>}
                {t.newsroom_use && <p style={{ fontSize: 12.5, color: 'var(--text-primary)', margin: 0 }}><b>For newsrooms:</b> {t.newsroom_use}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
