// BeAIReadyTraining — /training on the BE AI READY site (host-aware: on the
// Grounded host /training still shows the newsroom training library).
// The strongest entry point for new customers (V2 brochure p.8).
import { Link } from 'react-router-dom';

export default function BeAIReadyTraining() {
  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Hands-on training</div>
        <h1>One day that changes how your team works with AI.</h1>
        <p className="hub-lede">
          Audits tell you where you stand. <b>Training changes what your people do on Monday
          morning.</b> A focused, practical one-day AI training for your team — anywhere in South
          Africa — built around your business, your tools and your real work.
        </p>
      </section>

      <section className="hub-band">
        <h2>One-day training + three mentoring sessions — R35k</h2>
        <p>
          A full day on-site with your team, anywhere in South Africa (travel and accommodation
          excluded). Up to 30 people. The price includes <b>three 45-minute mentoring sessions</b> in
          the weeks that follow — working directly with your team to guide implementation, solve the
          snags that only show up in real work, and make the new habits stick.
        </p>
      </section>

      <div className="hub-section-label">How the day works</div>
      <section className="hub-grid">
        <div className="hub-card">
          <div className="hub-card-kicker">Tailored</div>
          <p>To your business — your tools, your data, your everyday tasks. Not a generic slideshow.</p>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">Practical</div>
          <p>Hands-on the whole day. Everyone works with AI; nobody just watches.</p>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">Mentored</div>
          <p>Three follow-up sessions included — the day is the start, not the product.</p>
        </div>
      </section>

      <section className="hub-band">
        <h2>Trained across Africa, Europe and beyond.</h2>
        <p>
          Develop&nbsp;AI has trained teams from Cape Town and Johannesburg to Zambia, Zimbabwe, Kenya,
          Namibia, Moldova and Ukraine — on behalf of international organisations including
          DW&nbsp;Akademie (Germany), the Thomson Reuters Foundation (UK) and International Media
          Support (Denmark). That experience is distilled into a format judged on one thing: whether
          your team actually uses AI better afterwards.
        </p>
      </section>

      <section className="hub-band" style={{ background: '#f4f1ec' }}>
        <p style={{ margin: 0 }}>
          Training pairs naturally with the <Link to="/audit">Be AI Ready audit</Link> — train first,
          then audit; or audit first, then train against the findings. Either order works. All training
          and mentoring materials live on in your dashboard, accessible to your staff at any time.
        </p>
      </section>

      <div className="hub-hero-cta" style={{ margin: '8px 0 24px' }}>
        <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready%20training" className="hub-btn hub-btn-solid">
          Book a training day
        </a>
        <Link to="/audit" className="hub-btn hub-btn-ghost">See the audit</Link>
      </div>
    </div>
  );
}
