import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import FeedbackBubble from '../../components/FeedbackBubble.jsx';

// Lazy so the chatbot bundle doesn't block first paint — it's only used
// once a visitor clicks the 💬 button.
const PublicChatbot = lazy(() => import('./PublicChatbot.jsx'));

const navStyle = ({ isActive }) => ({
  padding: '8px 12px',
  borderRadius: 'var(--radius)',
  fontSize: 14,
  fontWeight: isActive ? 600 : 500,
  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
  background: isActive ? '#EEF2FF' : 'transparent',
  textDecoration: 'none',
});

const inactiveStyle = navStyle({ isActive: false });

// The two top-level groups. Builder = the tools you run/own (external apps);
// Tracker = the AI Legal dataset (internal routes).
const BUILDER_ITEMS = [
  { label: 'Nodes', to: '/nodes/', external: true },
  { label: 'Tools', to: '/tools/', external: true },
  { label: 'Open source', to: '/open-source', external: false },
];
const TRACKER_ITEMS = [
  { label: 'Lawsuits', to: '/legal/lawsuits' },
  { label: 'Regulations', to: '/legal/regulations' },
  { label: 'Connections', to: '/legal/explore' },
  { label: 'Use cases', to: '/legal/use-cases' },
  { label: 'Sources', to: '/legal/sources' },
];
const MONETISATION_ITEMS = [
  { label: 'Extracting value from your archive', to: '/monetisation#archive' },
  { label: 'Accommodating AI crawlers for cash', to: '/monetisation#crawlers' },
  { label: 'Answer Engine Optimization', to: '/monetisation#aeo' },
  { label: 'Collective bargaining', to: '/monetisation#bargaining' },
];

const dropItemStyle = {
  display: 'block', padding: '8px 12px', fontSize: 14,
  color: 'var(--text-primary)', textDecoration: 'none',
  borderRadius: 6, whiteSpace: 'nowrap',
};

// A top-nav dropdown: click to toggle, closes on outside-click or item-click.
function NavDropdown({ label, items, activeWhen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const active = items.some(i => !i.external && location.pathname.startsWith(i.to)) || activeWhen?.(location.pathname);

  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...navStyle({ isActive: active }),
          display: 'flex', alignItems: 'center', gap: 4,
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: active || open ? '#EEF2FF' : 'transparent',
        }}
      >
        {label} <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 180,
          background: 'var(--card-bg)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: 6, zIndex: 20, display: 'flex', flexDirection: 'column',
        }}>
          {items.map(it => it.external ? (
            <a key={it.to} href={it.to} style={dropItemStyle} onClick={() => setOpen(false)}>{it.label}</a>
          ) : (
            <NavLink key={it.to} to={it.to} onClick={() => setOpen(false)}
                     style={({ isActive }) => ({ ...dropItemStyle, background: isActive ? '#EEF2FF' : 'transparent', fontWeight: isActive ? 600 : 500 })}>
              {it.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PublicLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  useEffect(() => {
    const prev = document.title;
    document.title = 'Grounded — Newsroom-owned AI';
    return () => { document.title = prev; };
  }, []);

  // Where to bring the user back to after a successful sign-in.
  const nextParam = encodeURIComponent(location.pathname + location.search);
  const firstName = user?.name?.split(' ')[0] || user?.email || 'admin';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--content-bg)', color: 'var(--text-primary)',
    }}>
      <header style={{
        borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'var(--text-primary)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Grounded</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Newsroom-owned AI &middot; by Develop&nbsp;AI
              </span>
            </div>
          </Link>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <NavLink to="/" end style={navStyle}>Home</NavLink>
            <NavDropdown label="Builder" items={BUILDER_ITEMS} />
            <NavDropdown label="Tracker" items={TRACKER_ITEMS} />
            <NavDropdown label="Monetisation" items={MONETISATION_ITEMS} activeWhen={p => p.startsWith('/monetisation')} />
            {user ? (
              <>
                {/* Logged-in users get a way into the app shell (sidebar +
                    dashboards). Admins → the Grounded command-centre; everyone
                    else → the tracker they can use. */}
                <Link to={user.role === 'admin' ? '/admin' : '/lawsuits'}
                      style={{ ...inactiveStyle, fontWeight: 600, color: 'white', background: 'var(--accent)' }}>
                  {user.role === 'admin' ? 'Admin' : 'Open app'}
                </Link>
                <span style={{ ...inactiveStyle, color: 'var(--text-primary)', fontWeight: 600 }}>Hi, {firstName}</span>
                <button onClick={async () => { await logout(); window.location.reload(); }}
                        style={{ ...inactiveStyle, background: 'transparent', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
                  Sign out
                </button>
              </>
            ) : (
              <a href={`/login?next=${nextParam}`} style={{ ...inactiveStyle, border: '1px solid var(--border-color)' }}>
                Sign&nbsp;in&nbsp;/&nbsp;Register
              </a>
            )}
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        <Outlet />
      </main>

      <Suspense fallback={null}><PublicChatbot /></Suspense>
      {/* The universal "submit anything about Grounded" entry point. Shown to
          everyone; logged-out visitors get a sign-in prompt inside it. */}
      <FeedbackBubble />

      <footer style={{
        borderTop: '1px solid var(--border-color)', background: 'var(--card-bg)',
        padding: '20px 24px', marginTop: 48,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span>© Grounded · <a href="https://grounded.developai.co.za" style={{ color: 'var(--text-secondary)' }}>grounded.developai.co.za</a></span>
          <span>Newsroom-owned AI tools · an open tracker of AI in law · by Develop AI</span>
        </div>
      </footer>
    </div>
  );
}
