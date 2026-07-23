// BeAIReadyHome — the public front door for BE AI READY. Deliberately SHORT:
// a map to the pillars, not the brochure. Reads the pillar structure from
// pillars.js; real tracker counts as live proof; no fake data.
//
// The "Today in AI" daily newsroom now lives in a shared component
// (components/TodayInAI.jsx) so the exact same news experience renders here AND
// on the Grounded front page.
import { Link } from 'react-router-dom';
import { VISIBLE_PILLARS } from './pillars.js';
import TodayInAI from '../../components/TodayInAI.jsx';

const STATUS_DOT = { live: '#16a34a', partial: '#d97706', building: '#94a3b8' };

export default function BeAIReadyHome() {
  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Be AI Ready · for organisations of every size, public or private</div>
        <h1>Is your organisation ready for an AI‑first world?</h1>
        <p className="hub-lede">
          One structured programme that works from the inside out — <b>starting with what your business already
          knows</b>. We capture the knowledge trapped in your people and documents, train your team, keep it safe
          and legal, put the right AI tools in their hands, and prove the results. A living dashboard, included
          for life.
        </p>
        <div className="hub-hero-cta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/training" className="hub-btn hub-btn-solid">Your Trainings</Link>
          <Link to="/feature/prompt-library" className="hub-btn hub-btn-solid">Your Prompts</Link>
          <Link to="/nodes" className="hub-btn hub-btn-solid">Your Tools</Link>
        </div>
      </section>

      {/* ── Today in AI — a small daily newsroom: one lead story with a photo (rotates
          each day) + two shorter reads. Only shows once a briefing exists. ── */}
      <TodayInAI trackerTo="/tracker" />

      {/* ── The pillars — the whole offering, one card each ── */}
      <div className="hub-section-label">The pillars of being AI ready</div>
      <p style={{ color: '#6b6359', fontSize: 14, margin: '-4px 0 14px', maxWidth: '64ch' }}>
        Six parts that reinforce each other — and they begin with your own knowledge. The more your team’s AI work
        is pooled here, the more the business learns and the sharper everything else gets.
      </p>
      <section className="hub-grid">
        {VISIBLE_PILLARS.map((p) => (
          <Link key={p.key} to={`/pillar/${p.key}`} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="hub-card-kicker">{p.label}</div>
            <p style={{ fontSize: 14, fontWeight: 650, color: '#1c1b1a', margin: '0 0 4px' }}>{p.tagline}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {p.features.map((f) => (
                <span key={f.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#6b6359' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[f.status] }} />
                  {f.name}
                </span>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', color: '#c75b39', fontWeight: 600, fontSize: 13 }}>More →</p>
          </Link>
        ))}
      </section>

      {/* ── Closing / contact (no pricing — scoped per engagement) ── */}
      <p className="hub-foot-note">
        Every engagement includes the full audit across all pillars, the findings report and action plan, and
        your dashboard with lifetime monitoring. Get in touch:
        &nbsp;<a href="mailto:paul@developai.co.za">paul@developai.co.za</a>
        &nbsp;· <a href="https://developai.co.za" target="_blank" rel="noreferrer">developai.co.za</a>
      </p>
    </div>
  );
}
