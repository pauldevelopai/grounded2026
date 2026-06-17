// BeAIReadyHome — the public front door for BE AI READY. Deliberately SHORT:
// a map to the pillars, not the brochure. Reads the pillar structure from
// pillars.js; real tracker counts as live proof; no fake data.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import { PILLARS, STATUS_LABEL, SCOPING_WHATSAPP } from './pillars.js';

const STATUS_DOT = { live: '#16a34a', partial: '#d97706', building: '#94a3b8' };

export default function BeAIReadyHome() {
  const [stats, setStats] = useState({ lawsuits: null, regulations: null, tools: null });

  useEffect(() => {
    Promise.allSettled([
      publicFetch('/public/lawsuits?pageSize=1').then((r) => r.total),
      publicFetch('/public/regulations?pageSize=1').then((r) => r.total),
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
      <section className="hub-hero">
        <div className="hub-eyebrow">Be AI Ready · for organisations of every size, public or private</div>
        <h1>Is your organisation ready for an AI‑first world?</h1>
        <p className="hub-lede">
          One structured programme to get any organisation AI ready — across <b>how you govern it</b>, <b>how you
          secure your data</b>, <b>how productively your team works with it</b>, <b>how they’re trained</b>,
          <b> how AI sees you</b>, and <b>your AI strategy</b>. A living dashboard, included for life.
        </p>
        <div className="hub-hero-cta">
          <a href={SCOPING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">
            Book a scoping call
          </a>
        </div>
      </section>

      {/* ── The pillars — the whole offering, one card each ── */}
      <div className="hub-section-label">The six pillars of being AI ready</div>
      <section className="hub-grid">
        {PILLARS.map((p) => (
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

      {/* ── Live proof from the shared tracker ── */}
      <div className="hub-section-label">Built on live infrastructure, not guesswork</div>
      <section className="hub-stats">
        <Link className="hub-stat" to="/tracker">
          <div className="hub-stat-value">{n(stats.lawsuits)}</div><div className="hub-stat-label">AI lawsuits tracked daily</div>
        </Link>
        <Link className="hub-stat" to="/tracker">
          <div className="hub-stat-value">{n(stats.regulations)}</div><div className="hub-stat-label">AI regulations tracked</div>
        </Link>
        <Link className="hub-stat" to="/toolbox">
          <div className="hub-stat-value">{n(stats.tools)}</div><div className="hub-stat-label">AI tools assessed in the toolbox</div>
        </Link>
      </section>

      {/* ── Closing / contact (no pricing — scoped per engagement) ── */}
      <p className="hub-foot-note">
        Every engagement includes the full audit across all pillars, the findings report and action plan, and
        your dashboard with lifetime monitoring. Get in touch:
        &nbsp;<a href="mailto:paul@developai.co.za">paul@developai.co.za</a>
        &nbsp;· <a href="https://developai.co.za" target="_blank" rel="noreferrer">developai.co.za</a>
      </p>

      <p style={{ fontSize: 11.5, color: '#a89e92', marginTop: 18 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT.live }} /> Live</span>
        &nbsp;&nbsp;<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT.partial }} /> In progress</span>
        &nbsp;&nbsp;<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT.building }} /> In development</span>
      </p>
    </div>
  );
}

function n(v) { return v == null ? '—' : v.toLocaleString(); }
