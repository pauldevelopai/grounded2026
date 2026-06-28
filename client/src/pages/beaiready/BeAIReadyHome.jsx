// BeAIReadyHome — the public front door for BE AI READY. Deliberately SHORT:
// a map to the pillars, not the brochure. Reads the pillar structure from
// pillars.js; real tracker counts as live proof; no fake data.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import { VISIBLE_PILLARS, STATUS_LABEL, SCOPING_WHATSAPP } from './pillars.js';

const STATUS_DOT = { live: '#16a34a', partial: '#d97706', building: '#94a3b8' };

export default function BeAIReadyHome() {
  const [stats, setStats] = useState({ lawsuits: null, regulations: null, tools: null });
  // The two daily briefings that lead the page (undefined = loading, null = none yet).
  const [briefings, setBriefings] = useState({ news: undefined, law: undefined });

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
    publicFetch('/public/ai-news-today').then((v) => setBriefings((b) => ({ ...b, news: v || null }))).catch(() => setBriefings((b) => ({ ...b, news: null })));
    publicFetch('/public/governance-today').then((v) => setBriefings((b) => ({ ...b, law: v || null }))).catch(() => setBriefings((b) => ({ ...b, law: null })));
  }, []);

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
        <div className="hub-hero-cta">
          <a href={SCOPING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">
            Book a scoping call
          </a>
        </div>
      </section>

      {/* ── Today in AI — the two daily briefings (News on top, Law below). Only
          shows once at least one has been generated; no empty cards. ── */}
      {(briefings.news?.summary || briefings.law?.summary) && (
        <>
          <div className="hub-section-label">Today in AI</div>
          <section style={{ display: 'grid', gap: 14, marginBottom: 28 }}>
            {briefings.news?.summary && (
              <BriefingCard kicker="AI News" data={briefings.news} />
            )}
            {briefings.law?.summary && (
              <BriefingCard kicker="AI Law" data={briefings.law} to="/tracker" toLabel="Open the tracker →" />
            )}
          </section>
        </>
      )}

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

// One daily briefing card: kicker, ~100-word summary, its source links, and the
// time it was generated. Used for both AI News and AI Law on the home page.
function BriefingCard({ kicker, data, to, toLabel }) {
  const when = data.generated_at
    ? new Date(data.generated_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : null;
  return (
    <div style={{ background: '#fff', border: '1px solid #eee5da', borderLeft: '3px solid #c75b39', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' }}>{kicker}</span>
        {when && <span style={{ fontSize: 11.5, color: '#a89e92' }}>{when}</span>}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.6, color: '#2a2724', whiteSpace: 'pre-wrap' }}>{data.summary}</p>
      {data.headlines?.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
          {data.headlines.slice(0, 4).map((h, i) => (
            h.url
              ? <a key={i} href={h.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#c75b39', textDecoration: 'none' }}>{trim(h.title)} ↗</a>
              : <span key={i} style={{ fontSize: 12, color: '#8a8076' }}>{trim(h.title)}</span>
          ))}
        </div>
      )}
      {to && (
        <p style={{ margin: '10px 0 0' }}>
          <Link to={to} style={{ fontSize: 13, fontWeight: 600, color: '#c75b39' }}>{toLabel}</Link>
        </p>
      )}
    </div>
  );
}

function trim(s) { s = s || ''; return s.length > 52 ? s.slice(0, 50).trimEnd() + '…' : s; }
