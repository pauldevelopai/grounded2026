// BeAIReadyHome — the public front door for BE AI READY (beaiready.developai.co.za).
// Copy source of truth: Be_AI_Ready_Develop_AI V2.pdf. Deliberately SHORT —
// the home page is a map, not the brochure; each section links to its real
// page (/visibility, /audit, /governance, /toolbox, /training). Real counts
// from the shared tracker; no fake data.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const PILLARS = [
  {
    n: 1, title: 'Visibility', to: '/visibility',
    line: 'Be the answer AI gives when customers ask ChatGPT, Claude or Gemini who to trust in your industry.',
  },
  {
    n: 2, title: 'Governance', to: '/governance',
    line: 'Your AI-use policy and accountability framework, written with you — aligned with POPIA and emerging AI law.',
  },
  {
    n: 3, title: 'Security', to: '/governance',
    line: 'Every AI tool your team uses mapped, every data leak found, and a prioritised fix list to plug them.',
  },
];

export default function BeAIReadyHome() {
  const [stats, setStats] = useState({ lawsuits: null, regulations: null, tools: null });

  useEffect(() => {
    Promise.allSettled([
      publicFetch('/public/lawsuits?pageSize=1').then((r) => r.total),
      publicFetch('/public/regulations?pageSize=1').then((r) => r.total),
      // /public/tools returns an ARRAY (no .total) — the real count is its length.
      publicFetch('/public/tools').then((r) => (Array.isArray(r) ? r.length : (r?.total ?? null))),
    ]).then(([l, rg, t]) =>
      setStats({
        lawsuits: l.status === 'fulfilled' ? l.value : null,
        regulations: rg.status === 'fulfilled' ? rg.value : null,
        tools: t.status === 'fulfilled' ? t.value : null,
      })
    );
  }, []);

  return (
    <div className="hub hub-beaiready">
      {/* ── Hero (V2 cover) ── */}
      <section className="hub-hero">
        <div className="hub-eyebrow">Be AI Ready · for small &amp; medium businesses</div>
        <h1>Your customers are asking their AI questions, but is your business appearing as the answer?</h1>
        <p className="hub-lede">
          One structured audit of <b>how AI sees you</b>, <b>how your people use it</b> and <b>how your
          business is governed for it</b> — with a living dashboard included for life in a once-off fee.
        </p>
        <div className="hub-hero-cta">
          <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready%20scoping%20call" className="hub-btn hub-btn-solid">
            Book a scoping call
          </a>
          <Link to="/audit" className="hub-btn hub-btn-ghost">See the audit</Link>
        </div>
      </section>

      {/* ── The three pillars — one line each, real pages behind them ── */}
      <section className="hub-grid">
        {PILLARS.map((p) => (
          <Link key={p.n} to={p.to} className="hub-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="hub-card-kicker">Pillar {p.n} · {p.title}</div>
            <p style={{ fontSize: 13.5, color: '#4a443d' }}>{p.line}</p>
            <p style={{ margin: '6px 0 0', color: '#c75b39', fontWeight: 600, fontSize: 13 }}>More →</p>
          </Link>
        ))}
      </section>

      {/* ── Live proof from the shared tracker ── */}
      <div className="hub-section-label">Built on live infrastructure, not guesswork</div>
      <section className="hub-stats">
        <Link className="hub-stat" to="/legal/lawsuits">
          <div className="hub-stat-value">{n(stats.lawsuits)}</div>
          <div className="hub-stat-label">AI lawsuits tracked daily</div>
        </Link>
        <Link className="hub-stat" to="/legal/regulations">
          <div className="hub-stat-value">{n(stats.regulations)}</div>
          <div className="hub-stat-label">AI regulations tracked</div>
        </Link>
        <Link className="hub-stat" to="/toolbox">
          <div className="hub-stat-value">{n(stats.tools)}</div>
          <div className="hub-stat-label">AI tools assessed in the toolbox</div>
        </Link>
      </section>

      {/* ── Dashboard + training, one band each ── */}
      <section className="hub-band">
        <h2>A living dashboard, included for life.</h2>
        <p>
          Most audits end with a report that gathers dust. This one ends with a dashboard — track how
          AI represents you, monitor your governance and security posture, and act on plain-language
          recommendations. Once-off fee, lifetime monitoring, no recurring costs.
        </p>
      </section>

      <section className="hub-band">
        <h2>One day that changes how your team works with AI.</h2>
        <p>
          One-day on-site training + three mentoring sessions — R35k, up to 30 people, anywhere in
          South Africa. <Link to="/training">The training →</Link>
        </p>
      </section>

      {/* ── Pricing ── */}
      <div className="hub-section-label">Investment — once-off, nothing monthly</div>
      <section className="hub-tiers">
        <Tier name="Essential" size="Up to ~20 people" price="R50 000" hours="6 hours of consultant face-time" />
        <Tier name="Growth" size="~20–100 people" price="R85 000" hours="12 hours of consultant face-time" featured />
        <Tier name="Enterprise" size="100+ people" price="R120 000+" hours="15 hours of consultant face-time" />
      </section>
      <p className="hub-foot-note">
        Every tier includes the full three-pillar audit, the findings report and action plan, and your
        dashboard with lifetime monitoring. <Link to="/audit">Full details →</Link> Or talk to Paul
        directly: <a href="mailto:paul@developai.co.za">paul@developai.co.za</a>
      </p>
    </div>
  );
}

function n(v) { return v == null ? '—' : v.toLocaleString(); }

function Tier({ name, size, price, hours, featured }) {
  return (
    <div className={featured ? 'hub-tier hub-tier-featured' : 'hub-tier'}>
      {featured && <div className="hub-tier-ribbon">Most common</div>}
      <h3>{name}</h3>
      <div className="hub-tier-size">{size}</div>
      <div className="hub-tier-price">{price}</div>
      <div className="hub-tier-note">Full audit · dashboard · lifetime monitoring</div>
      <div className="hub-tier-note" style={{ color: '#c75b39', fontWeight: 600 }}>{hours}</div>
    </div>
  );
}
