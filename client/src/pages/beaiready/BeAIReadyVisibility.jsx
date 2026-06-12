// BeAIReadyVisibility — /visibility on the BE AI READY site.
// THE main selling point (V2 brochure p.3): be the answer AI gives.
import { Link } from 'react-router-dom';

export default function BeAIReadyVisibility() {
  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">AI Visibility · pillar 1</div>
        <h1>Be the answer AI gives.</h1>
        <p className="hub-lede">
          When a potential customer asks ChatGPT, Claude or Gemini who to trust in your industry,
          the answer comes back in seconds — assembled from whatever public information those systems
          can find about you. If your competitors are easier for AI to read, trust and cite,
          <b> they become the answer</b>.
        </p>
      </section>

      <section className="hub-band">
        <h2>Visibility is no longer about ranking on a results page.</h2>
        <p>
          The currency of the future is being the authority that LLMs bring back as the answer to
          people's questions. People are not reading your blog any more — they are learning about
          your business by questioning AI, all day, every day.
        </p>
      </section>

      <div className="hub-section-label">What the Visibility audit delivers</div>
      <section className="hub-grid">
        <div className="hub-card">
          <div className="hub-card-kicker">1 · Where you stand</div>
          <p>How your business is represented today across the major AI assistants — what they say,
          what they miss, and what they get wrong.</p>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">2 · Structured for AI</div>
          <p>Your content and data structured so AI systems read, trust and cite you correctly —
          accurately, currently, and with confidence.</p>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">3 · The plan</div>
          <p>A plan to make you the answer AI returns in your industry — not your competitor.</p>
        </div>
      </section>

      <section className="hub-band">
        <h2>Then your dashboard keeps watch.</h2>
        <p>
          AI changes weekly, and so does how it sees you. Your Be AI Ready dashboard tracks how you're
          represented across AI assistants over time — included for life in the once-off audit fee.
        </p>
      </section>

      <div className="hub-hero-cta" style={{ marginBottom: 24 }}>
        <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready%20scoping%20call" className="hub-btn hub-btn-solid">
          Book a scoping call
        </a>
        <Link to="/audit" className="hub-btn hub-btn-ghost">See the full audit</Link>
      </div>
    </div>
  );
}
