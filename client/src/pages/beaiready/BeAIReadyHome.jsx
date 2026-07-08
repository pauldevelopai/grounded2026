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
  // The three daily briefings that lead the page (undefined = loading, null = none yet).
  const [briefings, setBriefings] = useState({ news: undefined, law: undefined, regulation: undefined });

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
    publicFetch('/public/regulation-today').then((v) => setBriefings((b) => ({ ...b, regulation: v || null }))).catch(() => setBriefings((b) => ({ ...b, regulation: null })));
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

      {/* ── Today in AI — the three daily briefings (News, then Law, then Regulation).
          Only shows once at least one has been generated; no empty cards. ── */}
      {(briefings.news?.summary || briefings.law?.summary || briefings.regulation?.summary) && (
        <>
          <div className="hub-section-label">Today in AI</div>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
            {briefings.news?.summary && (
              <BriefingCard kicker="AI News" data={briefings.news} />
            )}
            {briefings.law?.summary && (
              <BriefingCard kicker="AI Law" data={briefings.law} to="/tracker" toLabel="Open the tracker →" />
            )}
            {briefings.regulation?.summary && (
              <BriefingCard kicker="Regulation" data={briefings.regulation} to="/tracker" toLabel="Open the tracker →" />
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

// Per-category visual identity — an accent colour + a soft tint + a line icon, so the
// three daily reads read as distinct cards rather than one wall of text.
const ICON = {
  news: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="13" height="14" rx="1.5" /><path d="M16 8h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2h-2" />
      <path d="M6 9h7M6 12h7M6 15h4" />
    </svg>
  ),
  law: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v16M7 20h10M5 8h14" /><circle cx="12" cy="4" r="1.1" />
      <path d="M5 8l-2.5 5a2.5 2.5 0 0 0 5 0L5 8zM19 8l-2.5 5a2.5 2.5 0 0 0 5 0L19 8z" />
    </svg>
  ),
  regulation: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5.2c0 4.3-3 7.4-7 8.8-4-1.4-7-4.5-7-8.8V6l7-3z" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
};
const CATEGORY = {
  'AI News':    { key: 'news',       accent: '#2563eb', tint: '#eef3ff' },
  'AI Law':     { key: 'law',        accent: '#c75b39', tint: '#fbeee7' },
  'Regulation': { key: 'regulation', accent: '#0f8a5f', tint: '#e6f5ee' },
};

// One daily briefing card: an icon badge + category, the ~100-word read, cited-source
// chips, and (for Law/Regulation) a link into the tracker.
function BriefingCard({ kicker, data, to, toLabel }) {
  const cat = CATEGORY[kicker] || CATEGORY['AI News'];
  const when = data.generated_at
    ? new Date(data.generated_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #eee5da', borderTop: `3px solid ${cat.accent}`, borderRadius: 14, padding: '18px 18px 16px', boxShadow: '0 3px 12px rgba(60,40,20,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: cat.tint, color: cat.accent, flexShrink: 0 }}>
          {ICON[cat.key]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#241f1a', letterSpacing: '-0.01em' }}>{kicker}</div>
          {when && <div style={{ fontSize: 11.5, color: '#a89e92' }}>{when}</div>}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.62, color: '#413b34', whiteSpace: 'pre-wrap', flex: 1 }}>{data.summary}</p>
      {data.headlines?.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data.headlines.slice(0, 3).map((h, i) => (
            h.url
              ? <a key={i} href={h.url} target="_blank" rel="noreferrer" title={h.title}
                   style={{ fontSize: 11.5, fontWeight: 600, color: cat.accent, background: cat.tint, padding: '4px 10px', borderRadius: 999, textDecoration: 'none', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trim(h.title)} ↗</a>
              : <span key={i} style={{ fontSize: 11.5, color: '#8a8076', background: '#f4efe9', padding: '4px 10px', borderRadius: 999 }}>{trim(h.title)}</span>
          ))}
        </div>
      )}
      {to && (
        <p style={{ margin: '14px 0 0' }}>
          <Link to={to} style={{ fontSize: 13, fontWeight: 700, color: cat.accent, textDecoration: 'none' }}>{toLabel}</Link>
        </p>
      )}
    </div>
  );
}

function trim(s) { s = s || ''; return s.length > 46 ? s.slice(0, 44).trimEnd() + '…' : s; }
