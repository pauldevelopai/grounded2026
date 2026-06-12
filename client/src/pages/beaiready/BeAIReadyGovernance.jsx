// BeAIReadyGovernance — /governance on the BE AI READY site.
// The Governance + Security offering in BUSINESS framing (V2 brochure p.4),
// backed by live counts from the same daily legal tracker that powers Grounded
// — pulled via the shared public API, never duplicated, never faked.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

export default function BeAIReadyGovernance() {
  const [stats, setStats] = useState({ lawsuits: null, regulations: null });

  useEffect(() => {
    Promise.allSettled([
      publicFetch('/public/lawsuits?pageSize=1').then((r) => r.total),
      publicFetch('/public/regulations?pageSize=1').then((r) => r.total),
    ]).then(([l, rg]) => setStats({
      lawsuits: l.status === 'fulfilled' ? l.value : null,
      regulations: rg.status === 'fulfilled' ? rg.value : null,
    }));
  }, []);

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Governance &amp; Security · pillars 2 + 3</div>
        <h1>Your AI policy, written. Your data leaks, plugged.</h1>
        <p className="hub-lede">
          Your people have folded AI into how they work — drafting, summarising, analysing — often
          pasting company information into tools without anyone deciding what is safe to share. And
          the rules that govern all of this, from POPIA to emerging AI regulation, are tightening.
          A business that is brilliantly visible but leaking client data is not AI ready.
        </p>
      </section>

      <div className="hub-section-label">Governance — what we do, practically</div>
      <section className="hub-band">
        <p style={{ marginBottom: 8 }}>
          We review how AI is actually used across your business today, then <b>write your AI-use policy
          and governance framework with you</b> — fitted to your tools, your data and your sector, not a
          generic template. We set clear accountability (who approves AI use, who answers when something
          goes wrong) and align it all with POPIA and the AI rules emerging in your market.
        </p>
        <p style={{ margin: 0 }}>
          <b>You walk away with:</b> a written, living AI policy and framework your business owns — not
          a PDF that gathers dust.
        </p>
      </section>

      <div className="hub-section-label">Security — what we do, practically</div>
      <section className="hub-band">
        <p style={{ marginBottom: 8 }}>
          We inventory every AI tool your team actually uses — official and unofficial — and establish
          what each one collects and where that data goes. We map exactly where confidential, client and
          personal information is exposed, and hand you a <b>prioritised fix list</b>: which leaks to plug
          first, how to plug them, and what each fix protects.
        </p>
        <p style={{ margin: 0 }}>
          <b>You walk away with:</b> a full map of your AI data exposure, a prioritised fix list, and a
          team that treats every interaction with AI as a deliberate data decision.
        </p>
      </section>

      <div className="hub-section-label">Backed by a live tracker, not guesswork</div>
      <p className="hub-layers-lede" style={{ marginTop: -4 }}>
        Your governance framework stays current because it sits on the same infrastructure that tracks
        AI law and regulation daily — the live numbers below come straight from it.
      </p>
      <section className="hub-stats">
        <Link className="hub-stat" to="/legal/lawsuits">
          <div className="hub-stat-value">{stats.lawsuits == null ? '—' : stats.lawsuits.toLocaleString()}</div>
          <div className="hub-stat-label">AI lawsuits tracked daily · browse them →</div>
        </Link>
        <Link className="hub-stat" to="/legal/regulations">
          <div className="hub-stat-value">{stats.regulations == null ? '—' : stats.regulations.toLocaleString()}</div>
          <div className="hub-stat-label">AI regulations tracked · browse them →</div>
        </Link>
      </section>

      <div className="hub-hero-cta" style={{ margin: '8px 0 24px' }}>
        <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready%20scoping%20call" className="hub-btn hub-btn-solid">
          Book a scoping call
        </a>
        <Link to="/audit" className="hub-btn hub-btn-ghost">See the full audit</Link>
      </div>
    </div>
  );
}
