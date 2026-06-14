// BeAIReadyPillar — renders one pillar from pillars.js (the :key route param).
// Honest: each sub-feature shows its real status; "in development" ones say so
// plainly and don't pretend to work (no fake data).
import { useParams, Navigate, Link } from 'react-router-dom';
import { findPillar, STATUS_LABEL, SCOPING_WHATSAPP } from './pillars.js';

const STATUS_STYLE = {
  live: { bg: '#dcfce7', fg: '#166534' },
  partial: { bg: '#fef3c7', fg: '#92400e' },
  building: { bg: '#e2e8f0', fg: '#475569' },
};

export default function BeAIReadyPillar() {
  const { key } = useParams();
  const pillar = findPillar(key);
  if (!pillar) return <Navigate to="/" replace />;

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Pillar · {pillar.label}</div>
        <h1>{pillar.tagline}</h1>
        <p className="hub-lede">{pillar.intro}</p>
      </section>

      <section className="hub-grid">
        {pillar.features.map((f) => {
          const s = STATUS_STYLE[f.status] || STATUS_STYLE.building;
          const inner = (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>{f.name}</h3>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
                  {STATUS_LABEL[f.status]}
                </span>
              </div>
              <p style={{ fontSize: 13.5, color: '#4a443d', margin: 0 }}>{f.what}</p>
              {(f.to || f.dash) && <p style={{ margin: '8px 0 0', color: '#c75b39', fontWeight: 600, fontSize: 13 }}>Open →</p>}
              {!f.to && !f.dash && f.slug && <p style={{ margin: '8px 0 0', color: '#8a8076', fontWeight: 600, fontSize: 13 }}>Learn more →</p>}
            </>
          );
          // Direct public page (tracker, toolbox, training) → link straight there.
          if (f.to) return <Link key={f.name} to={f.to} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>;
          // Dashboard tool or in-development feature → the feature gateway.
          if (f.slug) return <Link key={f.name} to={`/feature/${f.slug}`} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>;
          return <div key={f.name} className="hub-card">{inner}</div>;
        })}
      </section>

      <div className="hub-hero-cta" style={{ margin: '8px 0 24px' }}>
        <a href={SCOPING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">
          Book a scoping call
        </a>
        <Link to="/" className="hub-btn hub-btn-ghost">All six pillars</Link>
      </div>
    </div>
  );
}
