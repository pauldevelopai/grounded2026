// BeAIReadyAdminShell — the BE AI READY admin portal chrome (admin-only, on the
// beaiready host). Deliberately DISTINCT from Grounded's admin: BE AI READY's
// own charcoal + terracotta. Four pages: Users (the client businesses + Pulse),
// Pillars, Data, Models.
import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';

const CHARCOAL = '#1c1b1a';
const TERRACOTTA = '#c75b39';

const NAV = [
  { to: '/admin', label: 'Users', end: true },
  { to: '/admin/pillars', label: 'Pillars' },
  { to: '/admin/tools', label: 'Toolbox' },
  { to: '/admin/nodes', label: 'Nodes' },
  { to: '/admin/tracker', label: 'Tracker review' },
  { to: '/admin/training', label: 'Training' },
  { to: '/admin/strategy', label: 'Strategy' },
  { to: '/admin/prompts', label: 'Prompt library' },
  { to: '/admin/briefings', label: 'Briefings' },
  { to: '/admin/knowhow', label: 'KnowHow' },
  { to: '/admin/data', label: 'Data' },
  { to: '/admin/models', label: 'Models' },
];

export default function BeAIReadyAdminShell() {
  const { user, logout } = useAuth();
  const itemStyle = ({ isActive }) => ({
    display: 'block', padding: '10px 20px', fontSize: 14, textDecoration: 'none',
    color: isActive ? '#fff' : '#cfc6bd',
    background: isActive ? 'rgba(199,91,57,0.22)' : 'transparent',
    borderLeft: isActive ? `3px solid ${TERRACOTTA}` : '3px solid transparent',
  });

  return (
    <div className="app-layout">
      <aside style={{ position: 'fixed', top: 0, left: 0, width: 'var(--sidebar-width)', height: '100vh',
        background: CHARCOAL, color: '#e7e0d8', display: 'flex', flexDirection: 'column', zIndex: 50 }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: TERRACOTTA, padding: '2px 8px', borderRadius: 4, marginBottom: 8 }}>
            Admin
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>Be AI Ready</div>
          <a href="/" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#9a9087', textDecoration: 'none' }}>← Back to the site</a>
        </div>
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} style={itemStyle}>{n.label}</NavLink>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13 }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{user?.name}</div>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#9a9087', fontSize: 13, padding: 0, cursor: 'pointer' }}>Sign out</button>
        </div>
      </aside>
      <main className="app-content" style={{ background: '#faf8f5' }}>
        <Outlet />
      </main>
    </div>
  );
}

// Shared placeholder for pages not built yet — honest, on-brand.
export function AdminStub({ title, blurb }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{title}</h1>
      <p style={{ color: '#6b6359', marginBottom: 18 }}>{blurb}</p>
      <div style={{ border: '1px dashed #d8cfc4', borderRadius: 12, background: '#fff', padding: '28px 24px', color: '#8a8076' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: TERRACOTTA }}>In development</span>
        <p style={{ marginTop: 8 }}>This page is next. The Users page (client businesses + Pulse) is built first.
          See <Link to="/admin">Users →</Link></p>
      </div>
    </div>
  );
}
