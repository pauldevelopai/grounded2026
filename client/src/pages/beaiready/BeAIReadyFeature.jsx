// BeAIReadyFeature — the public "feature gateway" at /feature/:slug.
// It exists so a marketing click never dead-ends at a bare login screen:
//   • a signed-in client is sent straight into the dashboard tool;
//   • a visitor sees a clean in-site explainer + a friendly sign-in (which
//     returns them right back here, ready to use);
//   • a feature still in development shows an honest "in development" page.
import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { findFeature, STATUS_LABEL, SCOPING_WHATSAPP } from './pillars.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function BeAIReadyFeature() {
  const { slug } = useParams();
  const { user } = useAuth();
  const found = findFeature(slug);

  // Signed-in client with a hosted Node → send them straight into it. The Node is
  // served by Caddy (not React Router), so this is a full-page navigation. Hooks
  // must run unconditionally, so compute the target before any early return.
  const nodeUrl = found?.feature?.node && user ? found.feature.runUrl : null;
  useEffect(() => { if (nodeUrl) window.location.replace(nodeUrl); }, [nodeUrl]);

  if (!found) return <Navigate to="/" replace />;
  const { pillar, feature } = found;

  // Signed-in client with a real dashboard tool → straight in (no extra hop).
  if (feature.dash && user) return <Navigate to={feature.dash} replace />;
  if (nodeUrl) return null; // redirecting into the Node via the effect above

  const isNode = !!feature.node;
  const inDev = !feature.dash && !isNode; // building features have no destination

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">{pillar.label} · {STATUS_LABEL[feature.status]}</div>
        <h1>{feature.name}</h1>
        <p className="hub-lede">{feature.what}</p>
      </section>

      {inDev ? (
        <section className="hub-band" style={{ background: '#f4f1ec' }}>
          <p style={{ margin: '0 0 14px' }}>
            <strong>This one is in development.</strong> It’s part of the {pillar.label} pillar and on our
            build roadmap — we build it with you as part of your Be AI Ready engagement, so it fits how
            your business actually works.
          </p>
          <div className="hub-hero-cta" style={{ margin: 0 }}>
            <a href={SCOPING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">Book a scoping call</a>
            <Link to={`/pillar/${pillar.key}`} className="hub-btn hub-btn-ghost">Back to {pillar.label}</Link>
          </div>
        </section>
      ) : (
        <section className="hub-band">
          <h2 style={{ marginTop: 0 }}>{isNode ? 'A tool you run in your browser' : 'This lives in your dashboard'}</h2>
          <p>
            {isNode
              ? 'It’s a Node — a small tool that runs right here in your browser (or on your own machine, if you’d rather). Sign in to open it — you’ll land straight in it. New to Be AI Ready? Book a scoping call and we’ll get you set up.'
              : 'It’s set up per business, so it sits behind your client sign-in. Sign in to open it — you’ll land right back on this tool, ready to use. New to Be AI Ready? Book a scoping call and we’ll get you set up.'}
          </p>
          <div className="hub-hero-cta" style={{ margin: '8px 0 0' }}>
            <Link to={`/login?next=${encodeURIComponent(isNode ? `/feature/${slug}` : feature.dash)}`} className="hub-btn hub-btn-solid">Sign in to open this</Link>
            <a href={SCOPING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-ghost">Book a scoping call</a>
          </div>
        </section>
      )}
    </div>
  );
}
