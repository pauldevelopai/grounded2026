// BeAIReadyHome — the public front door for BE AI READY (beaiready.developai.co.za).
//
// Copy is checked against the current brochure: "Be_AI_Ready_Develop_AI V2.pdf"
// (Develop AI, for small & medium businesses). Sibling of PublicHome.jsx, same
// conventions: reuses hub-* styles, fetches REAL counts from the shared public
// tracker, and follows the GOVERNING RULE — no fake data (stats show real
// counts or an em-dash).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

// The three audit pillars — wording from the V2 brochure (pp.3–4).
const PILLARS = [
  {
    n: 1,
    key: 'visibility',
    title: 'Visibility',
    q: 'Is the right information about you reaching the AI systems people query?',
    blurb:
      'When a customer asks ChatGPT, Claude or Gemini who to trust in your industry, the answer comes ' +
      'back in seconds — assembled from whatever public information those systems can find about you. ' +
      'If your competitors are easier for AI to read, trust and cite, they become the answer. We audit ' +
      'how your business is represented today across the major AI assistants, then structure your data ' +
      'and content so your position as a leader appears — accurately, currently, and with confidence.',
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
      'We review how AI is actually used across your business today, then write your AI-use policy and ' +
      'governance framework with you — fitted to your tools, your data and your sector, not a generic ' +
      'template. You walk away with a written, living policy your business owns.',
    points: [
      'Your AI-use policy and framework, written with you — not handed down',
      'Clear accountability: who approves AI use, and who answers when something goes wrong',
      'Aligned with POPIA and the AI rules emerging in your market — and defensible to partners and regulators',
    ],
  },
  {
    n: 3,
    key: 'security',
    title: 'Security',
    q: 'Is everyone giving the right information to AI — and protecting the rest?',
    blurb:
      'We inventory every AI tool your team actually uses — official and unofficial — and establish what ' +
      'each one collects and where that data goes. Then we map where confidential, client and personal ' +
      'information is exposed, and hand you a prioritised fix list.',
    points: [
      'A full map of where your confidential, client and personal data is exposed',
      'A prioritised fix list: which leaks to plug first, how, and what each fix protects',
      'Clear, usable sharing rules your team is walked through — the right information flows, the rest stays protected',
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
      {/* ── Hero (V2 cover) ── */}
      <section className="hub-hero">
        <div className="hub-eyebrow">Be AI Ready · for small &amp; medium businesses</div>
        <h1>Your customers are asking their AI questions, but is your business appearing as the answer?</h1>
        <p className="hub-lede">
          We help you take command of <b>how AI sees you</b>, <b>how your people use it</b>, and <b>how your
          business is governed for it</b> — one structured audit across all three, with a living dashboard
          included for life in a once-off fee, plus hands-on team training. By Develop&nbsp;AI.
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

      {/* ── Why this matters now — sourced market stats (V2 p.2) ── */}
      <div className="hub-section-label">Why this matters now</div>
      <p className="hub-layers-lede" style={{ marginTop: -4 }}>
        A growing share of decisions — which supplier to trust, which company to call — now begins inside an
        AI assistant, not a search engine. The assistant gives one answer, drawn from whatever it can find
        and trust about you. Get deliberate about it before your competitors do.
      </p>
      <section className="hub-stats hub-market-stats">
        <div className="hub-stat"><div className="hub-stat-value">80%</div>
          <div className="hub-stat-label">of consumers now rely on AI-generated results for at least 40% of their searches.<sup>1</sup></div></div>
        <div className="hub-stat"><div className="hub-stat-value">60%</div>
          <div className="hub-stat-label">of searches now end without the user clicking through to any website — the AI answer is the impression.<sup>1</sup></div></div>
        <div className="hub-stat"><div className="hub-stat-value">38%</div>
          <div className="hub-stat-label">of organisations have a formal AI policy — while 90% say their employees are using AI at work.<sup>2</sup></div></div>
      </section>
      <p className="hub-footnotes">
        1. Bain &amp; Company, &ldquo;Consumer reliance on AI search results signals new era of marketing,&rdquo; Feb 2025 — bain.com.&nbsp;
        2. ISACA, 2026 AI Pulse Poll of 3,400 digital trust professionals — isaca.org.
      </p>

      {/* ── The three pillars ── */}
      <div className="hub-section-label" id="pillars">The audit · three pillars</div>
      <section className="hub-grid">
        {PILLARS.map((p) => (
          <div key={p.key} className="hub-card">
            <div className="hub-card-kicker">Pillar {p.n} · {p.title}</div>
            <p className="hub-card-q"><em>{p.q}</em></p>
            <p>{p.blurb}</p>
            <ul className="hub-card-points">
              {p.points.map((pt) => <li key={pt}>{pt}</li>)}
            </ul>
          </div>
        ))}
      </section>

      {/* ── Real expert face-time (V2 p.3) ── */}
      <section className="hub-band">
        <h2>A real expert, in your business — not a subscription.</h2>
        <p>
          This is not software you sign up for and figure out alone. Every audit includes working hours, in
          person, with a Develop&nbsp;AI consultant inside your business — <b>6 hours (Essential)</b>,
          <b> 12 hours (Growth)</b> or <b>15 hours (Enterprise)</b>, included in the price. Bespoke, face to
          face, and guided end to end.
        </p>
      </section>

      {/* ── Productivity (V2 p.5) ── */}
      <div className="hub-section-label">Productivity — without surveillance</div>
      <section className="hub-grid">
        <div className="hub-card">
          <div className="hub-card-kicker">Five measures that matter</div>
          <p>AI should show you whether work is moving, not watch your people. We set up just five measures, with your own baselines and targets — never used to police individuals.</p>
          <ul className="hub-card-points">
            <li>Deliverables completed · Revenue generated · Time spent</li>
            <li>AI hours saved · Client &amp; customer outcomes</li>
          </ul>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">An active AI toolbox</div>
          <p>A continuously updated guide to the best AI tools for each function — sales, admin, finance, operations — with plain use-this / avoid-that guidance scored for data safety, so your team never guesses with company data.</p>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">BetterBoss · coming soon</div>
          <p>Capture a manager's hard-won expertise — a sales lead's client knowledge, an operations head's judgement — and turn it into an AI guide that coaches junior staff through their real work. Institutional knowledge stops walking out the door.</p>
        </div>
      </section>

      {/* ── The dashboard (V2 p.6) ── */}
      <div className="hub-section-label">Your dashboard</div>
      <section className="hub-band">
        <h2>A living dashboard, included for life.</h2>
        <p>
          Most audits end with a report that gathers dust. This one ends with a dashboard — a live view of
          your Visibility, Governance and Security that keeps working after we leave. <b>Track</b> how you're
          represented across AI assistants over time, <b>monitor</b> your governance and security posture, and
          <b> act</b> on prioritised, plain-language recommendations. Covered by the once-off fee, lifetime
          monitoring, no recurring costs. <b>Pulse</b> sends your team one quick question a day about how AI is
          going. And if your team has trained with Develop&nbsp;AI, all training and mentoring materials live
          here too.
        </p>
      </section>

      {/* ── Training (V2 p.8) ── */}
      <div className="hub-section-label" id="training">Hands-on training</div>
      <section className="hub-band">
        <h2>One-day training + three mentoring sessions — R35k</h2>
        <p>
          A full day on-site with your team, anywhere in South Africa (travel and accommodation excluded),
          up to 30 people — built around your business, your tools and your real work. The price includes
          three 45-minute mentoring sessions in the weeks that follow; the day is the start, not the product.
          Develop&nbsp;AI has trained teams across Africa and Europe for international organisations including
          DW&nbsp;Akademie, the Thomson Reuters Foundation and International Media Support.
        </p>
      </section>

      {/* ── How it works ── */}
      <div className="hub-section-label">How it works</div>
      <section className="hub-steps">
        {[
          ['Scope', 'A short scoping call to understand your business, your size and how you use AI today — the quote follows from there.'],
          ['Audit', 'We assess all three pillars in working sessions with your team — how you’re seen, how your people work, how you govern.'],
          ['Report & plan', 'A full walkthrough of every finding with prioritised, plain-language actions — what to fix first, and why.'],
          ['Dashboard & monitoring', 'Your dashboard goes live — covered by the once-off fee, for life.'],
        ].map(([t, d], i) => (
          <div key={t} className="hub-step">
            <div className="hub-step-n">{i + 1}</div>
            <div><strong>{t}</strong><p>{d}</p></div>
          </div>
        ))}
      </section>

      {/* ── Pricing (V2 p.7) ── */}
      <div className="hub-section-label">Investment</div>
      <section className="hub-tiers">
        <Tier name="Essential" size="Up to ~20 people · straightforward data" price="R50 000" hours="6 hours of consultant face-time" />
        <Tier name="Growth" size="~20–100 people · moderate data complexity" price="R85 000" hours="12 hours of consultant face-time" featured />
        <Tier name="Enterprise" size="100+ people · complex / regulated data" price="R120 000+" hours="15 hours of consultant face-time" />
      </section>
      <p className="hub-foot-note">
        Every figure is a once-off fee — nothing monthly — and includes the full audit, the findings report and
        action plan, and your Be AI Ready dashboard with lifetime monitoring. Not sure where you sit? A short
        scoping call settles it. Develop&nbsp;AI is a Cape Town–based AI consultancy. Contact Paul McNally
        directly: <a href="mailto:paul@developai.co.za">paul@developai.co.za</a>
        &nbsp;· <a href="https://developai.substack.com" target="_blank" rel="noreferrer">developai.substack.com</a>
        &nbsp;· <a href="https://developai.co.za" target="_blank" rel="noreferrer">developai.co.za</a>
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

function Tier({ name, size, price, hours, featured }) {
  return (
    <div className={featured ? 'hub-tier hub-tier-featured' : 'hub-tier'}>
      {featured && <div className="hub-tier-ribbon">Most common</div>}
      <h3>{name}</h3>
      <div className="hub-tier-size">{size}</div>
      <div className="hub-tier-price">{price}</div>
      <div className="hub-tier-note">Once-off fee · full audit · dashboard · lifetime monitoring</div>
      <div className="hub-tier-note" style={{ color: '#c75b39', fontWeight: 600 }}>{hours}</div>
    </div>
  );
}
