// GatedFeature — puts a LIVE Be AI Ready feature behind the login wall, but with
// a friendly face (Paul's call, 2026-06-22): a logged-out visitor doesn't get a
// bare login screen — they get a short in-site explainer + a "Sign in to use"
// button that returns them right back to the feature after login. A signed-in
// visitor sees the real thing.
//
// Used two ways:
//   • wrapping a single page:   <GatedFeature title=… blurb=…><Page/></GatedFeature>
//   • as a layout for a group:  <Route element={<GatedFeature title=… blurb=… />}> …children… </Route>
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { SCOPING_WHATSAPP } from './pillars.js';

export default function GatedFeature({ title, blurb, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user) return children ?? <Outlet />;

  // Logged out → explainer + friendly sign-in, returning here afterwards.
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Be AI Ready · sign in to use</div>
        <h1>{title}</h1>
        {blurb && <p className="hub-lede">{blurb}</p>}
      </section>
      <section className="hub-band">
        <h2 style={{ marginTop: 0 }}>This is a live tool — sign in to use it</h2>
        <p>
          Be AI Ready tools sit behind your client sign-in. Sign in to open this — you’ll land right
          back here, ready to use. New to Be AI Ready? Book a scoping call and we’ll get you set up.
        </p>
        <div className="hub-hero-cta" style={{ margin: '8px 0 0' }}>
          <Link to={`/login?next=${next}`} className="hub-btn hub-btn-solid">Sign in to use</Link>
          <a href={SCOPING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-ghost">Book a scoping call</a>
        </div>
      </section>
    </div>
  );
}
