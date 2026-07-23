import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { publicFetch } from '../../hooks/usePublicApi.js';
import FeedbackBubble from '../../components/FeedbackBubble.jsx';
import QuestionBubble from '../../components/QuestionBubble.jsx';

// Lazy so the chatbot bundle doesn't block first paint — it's only used
// once a visitor clicks the 💬 button.
const PublicChatbot = lazy(() => import('./PublicChatbot.jsx'));

// The header is now the BE AI READY charcoal chrome, so nav links are light-on-dark.
const navStyle = ({ isActive }) => ({
  padding: '8px 12px',
  borderRadius: 'var(--radius)',
  fontSize: 14,
  fontWeight: isActive ? 600 : 500,
  color: isActive ? '#fff' : '#e7e0d8',
  background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
  textDecoration: 'none',
});

const inactiveStyle = navStyle({ isActive: false });

// The top-level groups. Builder = the tools you run/own (Nodes + tool search +
// the workflow composer). AI Policies = the AI Legal dataset (internal routes).
// Training = the learning hub, with Sources tucked underneath it.
//
// These arrays are the OFFLINE FALLBACK. The live menu is fetched from
// /api/public/nav (server/config/publicNav.js) — the single source of truth
// shared with the Nodes front door — so the two surfaces can't drift. Keep
// these in sync-ish, but the server wins at runtime.
const BUILDER_ITEMS = [
  { label: 'Nodes', to: '/nodes/', external: true },
  { label: 'Tool Search', to: '/tools/', external: true },
  { label: 'Workflow builder', to: '/builder', external: false },
  { label: 'Monetisation', to: '/monetisation', external: false },
];
const TRACKER_ITEMS = [
  { label: 'Dashboard', to: '/legal/dashboard' },
  { label: 'Lawsuits', to: '/legal/lawsuits' },
  { label: 'Regulations', to: '/legal/regulations' },
  { label: 'Connections', to: '/legal/explore' },
  { label: 'Use cases', to: '/legal/use-cases' },
  { label: 'Ethics', to: '/legal/ethics' },
  { label: 'Ethics Policy Builder', to: '/legal/ethics-builder' },
];
const TRAINING_ITEMS = [
  { label: 'Training & courses', to: '/training' },
  { label: 'Staff AI needs', to: '/dashboard/staff-needs' },
  { label: 'New-staff coach', to: '/dashboard/coach' },
  { label: 'Sources', to: '/legal/sources' },
];
// ── BE AI READY pillar menus (ported into the Grounded nav). Offline fallback;
// the server (/api/public/nav) wins at runtime. Tool links are behind sign-in. ──
const KNOWLEDGE_ITEMS = [
  { label: 'Your dashboard', to: '/business' },
  { label: 'KnowHow — capture & ask', to: '/dashboard/knowhow' },
  { label: 'How AI sees your newsroom', to: '/dashboard/visibility' },
  { label: 'Your documents', to: '/dashboard/extraction' },
  { label: 'Team AI workspace', to: '/dashboard/workspace' },
];
const GOVERNANCE_ITEMS = [
  { label: 'AI Policy builder', to: '/dashboard/governance' },
  { label: 'The rules that apply', to: '/dashboard/governance/legal' },
  { label: 'Controls Library', to: '/dashboard/governance/controls' },
  { label: 'Roles & Review', to: '/dashboard/governance/review' },
  { label: 'Governance Assessment', to: '/dashboard/governance/assessment' },
  { label: 'Governance Learning', to: '/dashboard/governance/learning' },
  { label: 'Legal & Regulation tracker', to: '/legal/dashboard' },
];
const CYBERSECURITY_ITEMS = [
  { label: 'AI System Register & Risk', to: '/dashboard/security' },
  { label: 'Awareness — data security', to: '/awareness' },
];
const TOOLS_ITEMS = [
  { label: 'Nodes', to: '/nodes/', external: true },
  { label: 'Functions directory', to: '/functions' },
  { label: 'Prompt library', to: '/dashboard/prompts' },
  { label: 'LeadFinder', to: '/leadfinder' },
  { label: 'Productivity & impact', to: '/dashboard/productivity' },
];
const STRATEGY_ITEMS = [
  { label: 'Goals & automation roadmap', to: '/dashboard/strategy' },
  { label: 'Measurement — goals & results', to: '/dashboard/productivity' },
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
          background: active || open ? 'rgba(255,255,255,0.10)' : 'transparent',
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
                     style={({ isActive }) => ({ ...dropItemStyle, background: isActive ? '#efe9e1' : 'transparent', fontWeight: isActive ? 600 : 500 })}>
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

  // Live menu from the single source of truth (/api/public/nav); the imported
  // constants are the offline fallback shown until/if the fetch resolves.
  const [menu, setMenu] = useState({
    builder: BUILDER_ITEMS, tracker: TRACKER_ITEMS, training: TRAINING_ITEMS,
    knowledge: KNOWLEDGE_ITEMS, governance: GOVERNANCE_ITEMS,
    cybersecurity: CYBERSECURITY_ITEMS, tools: TOOLS_ITEMS, strategy: STRATEGY_ITEMS,
  });
  useEffect(() => {
    const map = (arr) => (arr || []).map(i => ({ label: i.label, to: i.href, external: !!i.external }));
    publicFetch('/public/nav')
      .then(d => {
        if (!d) return;
        // Merge server groups over the fallback — keep any group the server
        // doesn't return yet (so a not-yet-deployed nav can't blank a menu).
        setMenu(prev => {
          const next = { ...prev };
          for (const key of Object.keys(prev)) if (Array.isArray(d[key])) next[key] = map(d[key]);
          return next;
        });
      })
      .catch(() => {});
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
        background: 'linear-gradient(180deg, #1c1b1a 0%, #232120 100%)',
        borderBottom: '2px solid #c75b39',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '14px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: '#fff' }}>Grounded</span>
              <span style={{ fontSize: 11, color: '#c75b39', fontWeight: 600 }}>
                Newsroom-owned AI &middot; by Develop&nbsp;AI
              </span>
            </div>
          </Link>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <NavLink to="/" end style={navStyle}>Home</NavLink>
            <NavDropdown label="Builder" items={menu.builder} activeWhen={p => p.startsWith('/monetisation')} />
            <NavDropdown label="AI Policies" items={menu.tracker} activeWhen={p => p.startsWith('/legal/') && !p.startsWith('/legal/sources')} />
            {/* BE AI READY pillar menus, ported next to the Grounded ones. */}
            <NavDropdown label="Knowledge" items={menu.knowledge} activeWhen={p => p === '/business' || p.startsWith('/dashboard/knowhow') || p.startsWith('/dashboard/visibility') || p.startsWith('/dashboard/extraction') || p.startsWith('/dashboard/workspace')} />
            <NavDropdown label="Training" items={menu.training} activeWhen={p => p.startsWith('/training') || p.startsWith('/legal/sources') || p.startsWith('/dashboard/staff-needs') || p.startsWith('/dashboard/coach')} />
            <NavDropdown label="Governance" items={menu.governance} activeWhen={p => p.startsWith('/dashboard/governance')} />
            <NavDropdown label="Cyber Security" items={menu.cybersecurity} activeWhen={p => p.startsWith('/dashboard/security') || p.startsWith('/awareness')} />
            <NavDropdown label="Tools" items={menu.tools} activeWhen={p => p.startsWith('/functions') || p.startsWith('/dashboard/prompts') || p.startsWith('/leadfinder') || p.startsWith('/dashboard/productivity')} />
            <NavDropdown label="Strategy" items={menu.strategy} activeWhen={p => p.startsWith('/dashboard/strategy')} />
            {user ? (
              <>
                {/* Logged-in users get a way into the app shell (sidebar +
                    dashboards). Admins → the Grounded command-centre; everyone
                    else → the tracker they can use. */}
                <Link to={user.role === 'admin' ? '/admin' : '/lawsuits'}
                      style={{ ...inactiveStyle, fontWeight: 600, color: 'white', background: 'var(--accent)' }}>
                  {user.role === 'admin' ? 'Admin' : 'Open app'}
                </Link>
                <span style={{ ...inactiveStyle, color: '#f2ede7', fontWeight: 600 }}>Hi, {firstName}</span>
                <button onClick={async () => { await logout(); window.location.reload(); }}
                        style={{ ...inactiveStyle, background: 'transparent', border: '1px solid rgba(231,224,216,0.35)', cursor: 'pointer' }}>
                  Sign out
                </button>
              </>
            ) : (
              <a href={`/login?next=${nextParam}`} style={{ ...inactiveStyle, color: '#fff', border: '1px solid #c75b39' }}>
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
      {/* Outbound questions WE ask — only renders for logged-in users. */}
      <QuestionBubble />

      <footer style={{
        background: '#1c1b1a', color: '#9a9087',
        padding: '20px 24px', marginTop: 48,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          fontSize: 12, color: '#9a9087',
        }}>
          <span>© Grounded · <a href="https://grounded.developai.co.za" style={{ color: '#c75b39' }}>grounded.developai.co.za</a></span>
          <span>Newsroom-owned AI tools · an open tracker of AI in law · by Develop AI</span>
        </div>
      </footer>
    </div>
  );
}
