// BeAIReadyPillar — renders one pillar from pillars.js (the :key route param).
// Honest: each sub-feature shows its real status; "in development" ones say so
// plainly and don't pretend to work (no fake data).
import { useParams, Navigate, Link } from 'react-router-dom';
import { findPillar, STATUS_LABEL, SCOPING_WHATSAPP } from './pillars.js';
import { isBeAIReadyDoor } from './bizNav.js';

const STATUS_STYLE = {
  live: { bg: '#dcfce7', fg: '#166534' },
  partial: { bg: '#fef3c7', fg: '#92400e' },
  building: { bg: '#e2e8f0', fg: '#475569' },
};

// Grounded-only extras: on the newsroom door the two old top-nav dropdowns are
// folded into the pillars — Builder → Tools (productivity), AI Policies → Governance.
// These render only on the Grounded door (their routes, e.g. /builder, live there),
// so the beaiready door's pillar pages are unchanged.
const GROUNDED_EXTRAS = {
  productivity: {
    label: 'Build & run',
    items: [
      { name: 'Workflow builder', to: '/builder', what: 'Compose functions into saved workflows your team can run — no code, no prompts.' },
      { name: 'Tool Search', to: '/tools/', what: 'Search the full AIKit tool directory.' },
      { name: 'Monetisation', to: '/monetisation', what: 'The business of journalism — audience, revenue and distribution, treated with first-class AI tooling.' },
    ],
  },
  governance: {
    label: 'The AI-law tracker',
    items: [
      { name: 'Tracker dashboard', to: '/legal/dashboard', what: 'Lawsuits, regulations and use-cases in one newsroom view.' },
      { name: 'Lawsuits', to: '/legal/lawsuits', what: 'Every AI lawsuit we track, worldwide — newest first.' },
      { name: 'Regulations', to: '/legal/regulations', what: 'AI laws and regulations worldwide — enacted, proposed and in force.' },
      { name: 'Connections', to: '/legal/explore', what: 'The network of parties, cases and regulations, visualised.' },
      { name: 'Use cases', to: '/legal/use-cases', what: 'How other newsrooms and organisations actually put AI to work.' },
      { name: 'Ethics', to: '/legal/ethics', what: 'Ethics guidance for AI in the newsroom.' },
      { name: 'Ethics Policy Builder', to: '/legal/ethics-builder', what: 'Build a newsroom AI-ethics policy grounded in your own work.' },
      { name: 'Sources', to: '/legal/sources', what: 'The ingestion sources behind the tracker.' },
    ],
  },
};

export default function BeAIReadyPillar() {
  const { key } = useParams();
  const pillar = findPillar(key);
  if (!pillar) return <Navigate to="/" replace />;
  // Grounded door only — the folded-in Builder / AI Policies items for this pillar.
  const extra = isBeAIReadyDoor() ? null : GROUNDED_EXTRAS[key];

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
              {(f.to || f.dash || f.node) && <p style={{ margin: '8px 0 0', color: '#c75b39', fontWeight: 600, fontSize: 13 }}>Open →</p>}
              {!f.to && !f.dash && !f.node && f.slug && <p style={{ margin: '8px 0 0', color: '#8a8076', fontWeight: 600, fontSize: 13 }}>Learn more →</p>}
            </>
          );
          // Direct public page (tracker, toolbox, training) → link straight there.
          if (f.to) return <Link key={f.name} to={f.to} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>;
          // Dashboard tool or in-development feature → the feature gateway.
          if (f.slug) return <Link key={f.name} to={`/feature/${f.slug}`} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>;
          return <div key={f.name} className="hub-card">{inner}</div>;
        })}
      </section>

      {/* Grounded door: the folded-in Builder / AI Policies links for this pillar. */}
      {extra && (
        <>
          <div className="hub-section-label" style={{ marginTop: 8 }}>{extra.label}</div>
          <section className="hub-grid">
            {extra.items.map((it) => (
              <Link key={it.name} to={it.to} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>{it.name}</h3>
                <p style={{ fontSize: 13.5, color: '#4a443d', margin: 0 }}>{it.what}</p>
                <p style={{ margin: '8px 0 0', color: '#c75b39', fontWeight: 600, fontSize: 13 }}>Open →</p>
              </Link>
            ))}
          </section>
        </>
      )}

      <div className="hub-hero-cta" style={{ margin: '8px 0 24px' }}>
        <a href={SCOPING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">
          Book a scoping call
        </a>
        <Link to="/" className="hub-btn hub-btn-ghost">All six pillars</Link>
      </div>
    </div>
  );
}
