// BeAIReadyAdminShell — the BE AI READY admin portal chrome (admin-only, on the
// beaiready host). Deliberately DISTINCT from Grounded's admin: BE AI READY's
// own charcoal + terracotta. Landing page is "Today" (BeAIReadyAdminOverview) —
// the daily command centre; the rest of the nav are the per-area admin pages.
import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useAdminBase } from './adminBase.js';

const CHARCOAL = '#1c1b1a';
const TERRACOTTA = '#c75b39';

// Sub-paths are base-relative ('' = the "Today" overview); the base ('/admin' on
// the BE AI READY door, '/business-admin' on Grounded) is prefixed at render time.
const NAV = [
  { to: '', label: 'Today', end: true },
  { to: '/client', label: 'Client' },
  { to: '/mediamap', label: 'MediaMap' },
  { to: '/tools', label: 'Toolbox' },
  { to: '/nodes', label: 'Nodes' },
  { to: '/tracker', label: 'Tracker review' },
  { to: '/governance', label: 'Governance corpus' },
  { to: '/engagement', label: 'Engagement runner' },
  { to: '/training', label: 'Training' },
  { to: '/strategy', label: 'Strategy' },
  { to: '/insights', label: 'Insight' },
  { to: '/prompts', label: 'Prompt library' },
  { to: '/briefings', label: 'Briefings' },
  { to: '/knowhow', label: 'KnowHow' },
  { to: '/workspace', label: 'Workspace' },
  { to: '/data', label: 'Data' },
  { to: '/models', label: 'Models' },
  { to: '/vantage', label: 'Vantage' },
];

export default function BeAIReadyAdminShell() {
  const { user, logout } = useAuth();
  const { p, base } = useAdminBase();
  // On Grounded the portal sits alongside the platform admin, so "back" returns
  // to the Grounded admin; on the BE AI READY door it returns to the site root.
  const backHref = base === '/business-admin' ? '/admin' : '/';
  const backLabel = base === '/business-admin' ? '← Back to Grounded admin' : '← Back to the site';
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
          <a href={backHref} style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#9a9087', textDecoration: 'none' }}>{backLabel}</a>
        </div>
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={p(n.to)} end={n.end} style={itemStyle}>{n.label}</NavLink>
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
  const { p } = useAdminBase();
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{title}</h1>
      <p style={{ color: '#6b6359', marginBottom: 18 }}>{blurb}</p>
      <div style={{ border: '1px dashed #d8cfc4', borderRadius: 12, background: '#fff', padding: '28px 24px', color: '#8a8076' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: TERRACOTTA }}>In development</span>
        <p style={{ marginTop: 8 }}>This page is next. Start from your daily command centre.
          See <Link to={p()}>Today →</Link></p>
      </div>
    </div>
  );
}
