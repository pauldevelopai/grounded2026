// BeAIReadyAudit — /audit on the BE AI READY site. The full offering: the
// three pillars, the consultant face-time, how it works, and pricing
// (V2 brochure pp.3–7). The home page links here instead of carrying all this.
import { Link } from 'react-router-dom';

const PILLARS = [
  {
    n: 1, key: 'visibility', title: 'Visibility', to: '/visibility',
    q: 'Is the right information about you reaching the AI systems people query?',
    points: [
      'How your business is represented today across the major AI assistants',
      'Your content and data structured so AI reads, trusts and cites you correctly',
      'A plan to make you the answer AI returns — not your competitor',
    ],
  },
  {
    n: 2, key: 'governance', title: 'Governance', to: '/governance',
    q: 'Are your AI rules and accountability sound?',
    points: [
      'Your AI-use policy and framework, written with you — not a generic template',
      'Clear accountability: who approves AI use, who answers when something goes wrong',
      'Aligned with POPIA and emerging AI regulation — defensible to partners and regulators',
    ],
  },
  {
    n: 3, key: 'security', title: 'Security', to: '/governance',
    q: 'Is everyone giving the right information to AI — and protecting the rest?',
    points: [
      'Every AI tool your team uses inventoried — official and unofficial',
      'A full map of where confidential, client and personal data is exposed',
      'A prioritised fix list: which leaks to plug first, how, and what each fix protects',
    ],
  },
];

export default function BeAIReadyAudit() {
  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The Be AI Ready audit</div>
        <h1>One structured audit. Three pillars. A plan you can act on.</h1>
        <p className="hub-lede">
          A structured audit that assesses your whole relationship with AI and gives you a clear,
          prioritised plan of action — built on one principle: <b>the right information, in the right
          place, under your control</b>. It ends with a living dashboard, not a report that gathers dust.
        </p>
      </section>

      <div className="hub-section-label">The three pillars</div>
      <section className="hub-grid">
        {PILLARS.map((p) => (
          <div key={p.key} className="hub-card">
            <div className="hub-card-kicker">Pillar {p.n} · {p.title}</div>
            <p className="hub-card-q"><em>{p.q}</em></p>
            <ul className="hub-card-points">
              {p.points.map((pt) => <li key={pt}>{pt}</li>)}
            </ul>
            <p style={{ marginTop: 8 }}><Link to={p.to}>More on {p.title.toLowerCase()} →</Link></p>
          </div>
        ))}
      </section>

      <section className="hub-band">
        <h2>A real expert, in your business — not a subscription.</h2>
        <p>
          Every audit includes working hours, in person, with a Develop&nbsp;AI consultant inside your
          business — <b>6 hours (Essential)</b>, <b>12 hours (Growth)</b> or <b>15 hours (Enterprise)</b> —
          hands-on sessions with your team, working meetings to shape your policy and fix list, and a
          full walkthrough of every finding: what to do, why, and in what order.
        </p>
      </section>

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

      <div className="hub-section-label" id="pricing">Investment — priced to your size</div>
      <section className="hub-tiers">
        <Tier name="Essential" size="Up to ~20 people · straightforward data" price="R50 000" hours="6 hours of consultant face-time" />
        <Tier name="Growth" size="~20–100 people · moderate data complexity" price="R85 000" hours="12 hours of consultant face-time" featured />
        <Tier name="Enterprise" size="100+ people · complex / regulated data" price="R120 000+" hours="15 hours of consultant face-time" />
      </section>
      <p className="hub-foot-note">
        Every figure is a once-off fee — nothing monthly — and includes the full audit, the findings
        report and action plan, and your dashboard with lifetime monitoring. Not sure where you sit?
        A short scoping call settles it: <a href="mailto:paul@developai.co.za">paul@developai.co.za</a>
      </p>
    </div>
  );
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
