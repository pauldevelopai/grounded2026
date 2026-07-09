// BeAIReadyHome — the public front door for BE AI READY. Deliberately SHORT:
// a map to the pillars, not the brochure. Reads the pillar structure from
// pillars.js; real tracker counts as live proof; no fake data.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import { VISIBLE_PILLARS, STATUS_LABEL, SCOPING_WHATSAPP } from './pillars.js';

const STATUS_DOT = { live: '#16a34a', partial: '#d97706', building: '#94a3b8' };

export default function BeAIReadyHome() {
  // The three daily briefings that lead the page (undefined = loading, null = none yet).
  const [briefings, setBriefings] = useState({ news: undefined, law: undefined, regulation: undefined });

  useEffect(() => {
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

      {/* ── Today in AI — a small daily newsroom: one lead story with a photo (rotates
          each day) + two shorter reads. Only shows once a briefing exists. ── */}
      <TodayInAI briefings={briefings} />

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

// Per-category visual identity — accent + gradient shades + a soft tint + a line icon.
const ICON = {
  news: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ maxWidth: 22, maxHeight: 22 }}>
      <rect x="3" y="5" width="13" height="14" rx="1.5" /><path d="M16 8h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2h-2" /><path d="M6 9h7M6 12h7M6 15h4" />
    </svg>
  ),
  law: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ maxWidth: 22, maxHeight: 22 }}>
      <path d="M12 4v16M7 20h10M5 8h14" /><circle cx="12" cy="4" r="1.1" /><path d="M5 8l-2.5 5a2.5 2.5 0 0 0 5 0L5 8zM19 8l-2.5 5a2.5 2.5 0 0 0 5 0L19 8z" />
    </svg>
  ),
  regulation: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ maxWidth: 22, maxHeight: 22 }}>
      <path d="M12 3l7 3v5.2c0 4.3-3 7.4-7 8.8-4-1.4-7-4.5-7-8.8V6l7-3z" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
};
const CATEGORY = {
  'AI News':    { key: 'news',       accent: '#2f6bed', mid: '#3a52d6', deep: '#1e2f8a', tint: '#eef3ff' },
  'AI Law':     { key: 'law',        accent: '#d0623d', mid: '#b64a2a', deep: '#7f3218', tint: '#fbeee7' },
  'Regulation': { key: 'regulation', accent: '#12936a', mid: '#0f8258', deep: '#0a5a3e', tint: '#e6f5ee' },
};

// ── Today in AI: a tiny daily newsroom — one lead story with a photo (the lead
// rotates each day so a different category is featured), plus two shorter reads. ──
function TodayInAI({ briefings }) {
  const stories = [
    { kicker: 'AI News', data: briefings.news, to: null },
    { kicker: 'AI Law', data: briefings.law, to: '/tracker' },
    { kicker: 'Regulation', data: briefings.regulation, to: '/tracker' },
  ].filter((s) => s.data?.summary);
  if (!stories.length) return null;

  const day = Math.floor(Date.now() / 86400000);   // stable per calendar day
  const leadIdx = day % stories.length;            // rotate which story leads (gets the photo)
  const lead = stories[leadIdx];
  const rest = stories.filter((_, i) => i !== leadIdx);

  return (
    <>
      <style>{`@media (max-width: 760px){ .today-grid{ grid-template-columns:1fr !important; } }`}</style>
      <div className="hub-section-label">Today in AI</div>
      <section className="today-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 20, marginBottom: 34, alignItems: 'start' }}>
        <LeadStory {...lead} seed={day} />
        {rest.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #eee5da', borderRadius: 14, overflow: 'hidden', boxShadow: '0 3px 12px rgba(60,40,20,0.04)' }}>
            {rest.map((s, i) => <SecondaryStory key={s.kicker} {...s} divider={i > 0} />)}
          </div>
        )}
      </section>
    </>
  );
}

// The featured story: a daily generated cover image, a headline, a 2-sentence dek that
// expands to the full read, and cited-source chips.
function LeadStory({ kicker, data, to, seed }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY[kicker] || CATEGORY['AI News'];
  const headline = cleanHeadline(data.headlines?.[0]?.title) || kicker;
  return (
    <article style={{ background: '#fff', border: '1px solid #eee5da', borderRadius: 14, overflow: 'hidden', boxShadow: '0 5px 20px rgba(60,40,20,0.07)' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 6.5' }}>
        <HeroCover cat={cat} image={data.hero_image} />
        <span style={{ position: 'absolute', top: 12, left: 14, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: '#fff', background: 'rgba(20,12,8,0.34)', padding: '5px 11px', borderRadius: 999 }}>{kicker}</span>
      </div>
      <div style={{ padding: '18px 22px 22px' }}>
        <div style={{ fontSize: 12, color: '#a89e92', marginBottom: 7 }}>{fmtWhen(data.generated_at)}</div>
        <h3 style={{ margin: 0, fontSize: 23, lineHeight: 1.2, fontWeight: 800, color: '#211d18', letterSpacing: '-0.02em' }}>{headline}</h3>
        <p style={{ margin: '11px 0 0', fontSize: 15, lineHeight: 1.62, color: '#443d35', whiteSpace: 'pre-wrap' }}>
          {open ? data.summary : dek(data.summary, 2)}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {!open && <button onClick={() => setOpen(true)} style={linkBtn(cat.accent, 14)}>Read the full brief →</button>}
          {open && to && <Link to={to} style={linkBtn(cat.accent, 14)}>Open the tracker →</Link>}
        </div>
        {open && <Chips cat={cat} headlines={data.headlines} />}
      </div>
    </article>
  );
}

// A shorter read in the sidebar column — icon + category, headline, one-line dek that
// expands to the full brief.
function SecondaryStory({ kicker, data, to, divider }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORY[kicker] || CATEGORY['AI News'];
  const headline = cleanHeadline(data.headlines?.[0]?.title) || kicker;
  return (
    <article style={{ padding: '16px 18px', borderTop: divider ? '1px solid #f1eae1' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: cat.tint, color: cat.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 4 }}>{ICON[cat.key]}</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: cat.accent }}>{kicker}</span>
        <span style={{ fontSize: 11, color: '#b7ada1', marginLeft: 'auto' }}>{fmtWhen(data.generated_at)}</span>
      </div>
      <h4 style={{ margin: 0, fontSize: 16, lineHeight: 1.3, fontWeight: 700, color: '#2a241f' }}>{headline}</h4>
      <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.55, color: '#5c554d', whiteSpace: 'pre-wrap' }}>
        {open ? data.summary : dek(data.summary, 1)}
      </p>
      <div style={{ marginTop: 9, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {!open && <button onClick={() => setOpen(true)} style={linkBtn(cat.accent, 12.5)}>Read →</button>}
        {open && to && <Link to={to} style={linkBtn(cat.accent, 12.5)}>Open the tracker →</Link>}
      </div>
      {open && <Chips cat={cat} headlines={data.headlines} small />}
    </article>
  );
}

// The daily "photo" for the lead story: a real photo scraped from the day's top cited
// article and self-hosted (data.hero_image, same-origin so it always loads). The category
// gradient sits behind it — shown instantly, and as a graceful fallback if there's no
// image that day or it fails to load.
function HeroCover({ cat, image }) {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${cat.accent}, ${cat.deep})` }} />
      {image && (
        <img
          src={image} alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {/* Subtle top-darkening so the category tag stays legible over any photo. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,10,6,0.34) 0%, rgba(15,10,6,0) 36%)' }} />
    </>
  );
}

function Chips({ cat, headlines, small }) {
  if (!headlines?.length) return null;
  return (
    <div style={{ marginTop: 13, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {headlines.slice(0, small ? 2 : 3).map((h, i) => (
        h.url
          ? <a key={i} href={h.url} target="_blank" rel="noreferrer" title={h.title}
               style={{ fontSize: 11, fontWeight: 600, color: cat.accent, background: cat.tint, padding: '3px 10px', borderRadius: 999, textDecoration: 'none', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trim(cleanHeadline(h.title))} ↗</a>
          : <span key={i} style={{ fontSize: 11, color: '#8a8076', background: '#f4efe9', padding: '3px 10px', borderRadius: 999 }}>{trim(h.title)}</span>
      ))}
    </div>
  );
}

function linkBtn(color, size = 13.5) {
  return { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: size, fontWeight: 700, color, textDecoration: 'none' };
}
function cleanHeadline(t) { return (t || '').split(' | ')[0].split(' – ')[0].trim(); }
function dek(s, n) { const parts = (s || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean); return parts.slice(0, n).join(' '); }
function fmtWhen(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : ''; }
function trim(s) { s = s || ''; return s.length > 44 ? s.slice(0, 42).trimEnd() + '…' : s; }
