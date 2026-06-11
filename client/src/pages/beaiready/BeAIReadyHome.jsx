// BeAIReadyHome — the public front door for BE AI READY (beaiready.developai.co.za).
//
// Sibling of pages/public/PublicHome.jsx and built to the same conventions:
// reuses the hub-* styles, fetches REAL counts from the same public endpoints,
// and follows the repo's GOVERNING RULE: no fake data. Stats show real counts
// (or an em-dash while loading / if unavailable); nothing is fabricated.
//
// Copy follows the "Be AI Ready" brochure (June 2026): one audit, three pillars
// (Visibility, Governance, Security), a lifetime dashboard included in a
// once-off fee, and one-day training + three mentoring sessions at R35k.
//
// BE AI READY is the business-facing door into the same infrastructure that
// runs Grounded for newsrooms — the daily legal/regulatory/ethics scraping is
// shared, which is why the stat row can show real numbers from day one.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const PILLARS = [
  {
    n: 1,
    key: 'visibility',
    title: 'Visibility',
    q: 'Is the right information about you reaching the AI systems people query?',
    blurb:
      'The currency of the future is being the authority that LLMs bring back as the answer. ' +
      'We structure your data and content so your position as a leader in your industry appears ' +
      'in ChatGPT, Claude, Gemini and the other systems your customers ask — accurately and with confidence.',
    points: [
      'How your business is represented today across the major AI assistants',
      'Your content and data structured so AI systems read, trust and cite you correctly',
      'A plan to make you the answer AI returns in your industry — not your competitor',
    ],
  },
  {
    n: 2,
    key: 'governance',
    title: 'Governance',
    q: 'Are your AI rules and accountability sound?',
    blurb:
      'An AI policy and governance framework that fits your business — built around the AI you ' +
      'actually use, not a generic template. A living framework you own and can defend, aligned ' +
      'with POPIA and the AI rules emerging in your market, backed by our daily legal tracker.',
    points: [
      'A bespoke AI-use policy and framework, written for your business',
      'Clear accountability — who answers when AI is involved',
      'Alignment with data-protection law and emerging AI regulation',
    ],
  },
  {
    n: 3,
    key: 'security',
    title: 'Security',
    q: 'Is everyone giving the right information to AI — and protecting the rest?',
    blurb:
      'We map where your data is leaking — which AI tools your team uses, what each one collects — ' +
      'and give you a prioritised list of fixes to plug every leak. Every interaction with AI is a ' +
      'data decision; we make sure your team makes it deliberately.',
    points: [
      'A review of how your team actually uses AI day to day, tool by tool',
      'A prioritised list of fixes: exactly which leaks to plug, and how',
      'Clear, usable rules so the right information flows to AI and the rest stays protected',
    ],
  },
];

export default function BeAIReadyHome() {
  // Real counts from the shared tracker — the same infrastructure Grounded runs
  // for newsrooms. These endpoints are public and live today.
  const [stats, setStats] = useState({ lawsuits: null, regulations: null, tools: null });

  useEffect(() => {
    Promise.allSettled([
      publicFetch('/public/lawsuits?pageSize=1').then((r) => r.total),
      publicFetch('/public/regulations?pageSize=1').then((r) => r.total),
      // /public/tools returns the published list as an ARRAY (no .total), so the
      // real count is its length — never a fabricated number.
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
      {/* ── Hero ── */}
      <section className="hub-hero">
        <div className="hub-eyebrow">Be AI Ready · by Develop&nbsp;AI</div>
        <h1>Your customers are asking their AI questions. Is your business the answer?</h1>
        <p className="hub-lede">
          One structured audit across the three places AI touches your business —
          <b> Visibility, Governance, Security</b> — with a living dashboard included for life
          in a once-off fee. Built for small and medium businesses, on the same infrastructure
          that tracks AI law and ethics <b>daily</b>.
        </p>
        <div className="hub-hero-cta">
          <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready%20scoping%20call" className="hub-btn hub-btn-solid">
            Book a scoping call
          </a>
          <Link to="/login" className="hub-btn hub-btn-ghost">Client sign in</Link>
        </div>
      </section>

      {/* ── Real numbers from the shared tracker (no fake data) ── */}
      <section className="hub-stats">
        <Stat value={stats.lawsuits} label="AI lawsuits tracked daily" to="/legal/lawsuits" />
        <Stat value={stats.regulations} label="AI regulations tracked" to="/legal/regulations" />
        <Stat value={stats.tools} label="AI tools assessed" to="/tools/" external />
      </section>

      {/* ── Why this matters now — sourced market stats (brochure p2) ── */}
      <div className="hub-section-label">Why this matters now</div>
      <section className="hub-stats hub-market-stats">
        <div className="hub-stat"><div className="hub-stat-value">80%</div>
          <div className="hub-stat-label">of consumers now rely on AI-generated results for at least 40% of their searches.<sup>1</sup></div></div>
        <div className="hub-stat"><div className="hub-stat-value">60%</div>
          <div className="hub-stat-label">of searches end without a click to any website — the AI answer is the impression.<sup>1</sup></div></div>
        <div className="hub-stat"><div className="hub-stat-value">38%</div>
          <div className="hub-stat-label">of organisations have a formal AI policy — while 90% say employees use AI at work.<sup>2</sup></div></div>
      </section>
      <p className="hub-footnotes">
        1. Bain &amp; Company, &ldquo;Consumer reliance on AI search results signals new era of marketing,&rdquo; Feb 2025 — bain.com.&nbsp;
        2. ISACA, 2026 AI Pulse Poll (3,400 professionals) — isaca.org.
      </p>

      {/* ── The three pillars ── */}
      <div className="hub-section-label" id="pillars">One audit · three pillars</div>
      <section className="hub-grid">
        {PILLARS.map((p) => (
          <div key={p.key} className="hub-card">
            <div className="hub-card-kicker">Pillar {p.n}</div>
            <h3>{p.title}</h3>
            <p className="hub-card-q"><em>{p.q}</em></p>
            <p>{p.blurb}</p>
            <ul className="hub-card-points">
              {p.points.map((pt) => <li key={pt}>{pt}</li>)}
            </ul>
          </div>
        ))}
      </section>

      {/* ── The dashboard ── */}
      <div className="hub-section-label">Not a one-off report</div>
      <section className="hub-band">
        <h2>A living dashboard, included for life.</h2>
        <p>
          Every audit includes your own Be AI Ready dashboard — covered by the once-off fee,
          with lifetime monitoring, no recurring costs. Track how AI represents you, monitor
          your governance and security posture, and act on plain-language recommendations.
          If your team has trained with Develop AI, all training and mentoring materials live
          in the dashboard too — accessible to your staff at any time.
        </p>
      </section>

      {/* ── Training ── */}
      <div className="hub-section-label" id="training">Hands-on training</div>
      <section className="hub-band">
        <h2>One-day training + three mentoring sessions — R35k</h2>
        <p>
          A full day on-site with your team, anywhere in South Africa (travel and accommodation
          excluded). Up to 30 people. The price includes three 45-minute mentoring sessions in
          the weeks that follow — the day is the start, not the product. Delivered with the
          experience of training teams across Africa and Europe for international organisations.
        </p>
      </section>

      {/* ── How it works (brochure p4) ── */}
      <div className="hub-section-label">How it works</div>
      <section className="hub-steps">
        {[
          ['Scope', 'A short conversation to understand your business, your size and how you use AI today.'],
          ['Audit', 'We assess all three pillars and gather the evidence — how you’re seen, how your people work, how you govern.'],
          ['Report & plan', 'A clear findings report with prioritised, practical actions — what to fix first, and why.'],
          ['Dashboard & monitoring', 'Your dashboard goes live — covered by the once-off fee, for life.'],
        ].map(([t, d], i) => (
          <div key={t} className="hub-step">
            <div className="hub-step-n">{i + 1}</div>
            <div><strong>{t}</strong><p>{d}</p></div>
          </div>
        ))}
      </section>

      {/* ── Pricing ── */}
      <div className="hub-section-label">Investment</div>
      <section className="hub-tiers">
        <Tier name="Essential" size="Up to ~20 people · straightforward data" price="R50k" />
        <Tier name="Growth" size="~20–100 people · moderate data complexity" price="R85k" featured />
        <Tier name="Enterprise" size="100+ people · complex / regulated data" price="R120k+" />
      </section>
      <p className="hub-foot-note">
        Every tier includes the full three-pillar audit, the findings report and action plan,
        and your dashboard with lifetime monitoring — a once-off fee, nothing recurring.
        Contact Paul McNally directly: <a href="mailto:paul@developai.co.za">paul@developai.co.za</a>
        &nbsp;· Newsletter: <a href="https://developai.substack.com" target="_blank" rel="noreferrer">developai.substack.com</a>
      </p>
    </div>
  );
}

function Stat({ value, label, to, external }) {
  const body = (
    <>
      <div className="hub-stat-value">{value == null ? '—' : value.toLocaleString()}</div>
      <div className="hub-stat-label">{label}</div>
    </>
  );
  if (external) return <a className="hub-stat" href={to}>{body}</a>;
  return <Link className="hub-stat" to={to}>{body}</Link>;
}

function Tier({ name, size, price, featured }) {
  return (
    <div className={featured ? 'hub-tier hub-tier-featured' : 'hub-tier'}>
      {featured && <div className="hub-tier-ribbon">Most common</div>}
      <h3>{name}</h3>
      <div className="hub-tier-size">{size}</div>
      <div className="hub-tier-price">{price}</div>
      <div className="hub-tier-note">Full audit · dashboard · lifetime monitoring</div>
    </div>
  );
}
