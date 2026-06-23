// BeAIReadyLayout — the public chrome for the BE AI READY subdomain.
// A clone-and-trim of PublicLayout: dark charcoal header with terracotta
// accents (the brochure look), a business nav, and the SAME bottom-corner
// widgets — but the chatbot in its business voice. Grounded's own PublicLayout
// is untouched; the host switch in App.jsx picks which layout wraps the public
// routes.
import { lazy, Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import FeedbackBubble from '../../components/FeedbackBubble.jsx';
import { VISIBLE_PILLARS } from './pillars.js';

const PublicChatbot = lazy(() => import('../public/PublicChatbot.jsx'));

const CHARCOAL = '#1c1b1a';
const TERRACOTTA = '#c75b39';

const linkStyle = { color: '#e7e0d8', textDecoration: 'none', fontSize: 14, fontWeight: 500, padding: '8px 10px' };

export default function BeAIReadyLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Log out, then drop straight onto the sign-in screen so you can come back as a
  // different user (e.g. switch between a client login and the Develop AI admin).
  const signOut = async () => {
    try { await logout(); } catch { /* ignore */ }
    navigate('/login');
  };

  useEffect(() => {
    const prev = document.title;
    document.title = 'Be AI Ready — by Develop AI';
    return () => { document.title = prev; };
  }, []);

  const nextParam = encodeURIComponent(location.pathname + location.search);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--content-bg)', color: 'var(--text-primary)' }}>
      <header style={{
        background: `linear-gradient(180deg, ${CHARCOAL} 0%, #232120 100%)`,
        borderBottom: `2px solid ${TERRACOTTA}`, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
              Be AI Ready
            </span>
            <span style={{ fontSize: 10.5, color: TERRACOTTA, fontWeight: 600 }}>by Develop&nbsp;AI</span>
          </Link>
          <nav style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* The live pillar tabs (Training, Governance, Tools, Strategy). */}
            {VISIBLE_PILLARS.map((p) => (
              <Link key={p.key} to={`/pillar/${p.key}`} style={{ ...linkStyle, padding: '8px 8px', fontSize: 13.5 }}>{p.nav}</Link>
            ))}
            {/* A clear gap, then the sign-in / account box. */}
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginLeft: 22 }}>
              {user ? (
                <>
                  <Link to={user.role === 'admin' ? '/admin' : '/dashboard'} style={{ ...linkStyle, color: '#fff', background: TERRACOTTA, borderRadius: 6, fontWeight: 600 }}>
                    {user.role === 'admin' ? 'Admin' : 'My dashboard'}
                  </Link>
                  <button onClick={signOut} title={`Signed in as ${user.email || user.name || ''}`}
                    style={{ ...linkStyle, background: 'none', border: '1px solid rgba(231,224,216,0.35)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Sign out
                  </button>
                </>
              ) : (
                <a href={`/login?next=${nextParam}`} style={{ ...linkStyle, color: '#fff', border: `1px solid ${TERRACOTTA}`, borderRadius: 6 }}>
                  Client sign in
                </a>
              )}
            </span>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        <Outlet />
      </main>

      {/* Same widgets as PublicLayout — chatbot in its business voice. */}
      <Suspense fallback={null}><PublicChatbot audience="business" /></Suspense>
      <FeedbackBubble />

      <footer style={{ background: CHARCOAL, color: '#9a9087', padding: '20px 24px', marginTop: 48 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
          <span>© Be AI Ready · by Develop&nbsp;AI</span>
          <span>
            <a href="mailto:paul@developai.co.za" style={{ color: TERRACOTTA }}>paul@developai.co.za</a>
            &nbsp;·&nbsp;
            <a href="https://developai.substack.com" target="_blank" rel="noreferrer" style={{ color: TERRACOTTA }}>Newsletter</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
