// AdminArea — the platform-admin shell (Phase 1 · step 5).
//
// Gathers the GROUNDED platform operations (tracker ingestion, Nodes oversight,
// feedback, users, reference data, jobs, the command centre) into ONE admin
// area. This is the third bucket: it runs the product, so it stays inside the
// product world (reached via the admin-only "Admin" entry in ProductShell) —
// distinct from the newsroom product and from Develop AI's Studio back-office.
//
// Same dark operator chrome as StudioShell (a blue ADMIN badge vs Studio's
// amber) for a consistent operator feel. Component code + paths unchanged;
// layout/routing only. Reversible.

import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePulseEnabled } from '../hooks/usePulseEnabled.js';
import AiAssistantPanel from '../components/AiAssistantPanel.jsx';
import FeedbackBubble from '../components/FeedbackBubble.jsx';
import SectorSelect from './SectorSelect.jsx';
import NewsroomSwitcher from './NewsroomSwitcher.jsx';

const ADMIN_NAV = [
  { to: '/admin',                  label: 'Command centre',   group: 'Overview' },
  { to: '/insights',               label: 'Insights',         group: 'Overview' },
  { to: '/admin/questions',        label: 'Questions',        group: 'Overview' },
  { to: '/newsrooms-admin',        label: 'Newsrooms',        group: 'Newsrooms' },
  { to: '/scraper-dashboard',      label: 'Scraper Dashboard', group: 'AI Legal tracker' },
  { to: '/ingestion',              label: 'Ingestion',        group: 'AI Legal tracker' },
  { to: '/legal-sources',          label: 'Sources',          group: 'AI Legal tracker' },
  { to: '/use-cases-admin',        label: 'Use cases',        group: 'AI Legal tracker' },
  { to: '/node-admin',             label: 'Nodes',            group: 'Nodes' },
  { to: '/documents',              label: 'Policies & Security', group: 'Documents' },
  { to: '/feedback',               label: 'Feedback',         group: 'People & access' },
  { to: '/settings/team',          label: 'Team members',     group: 'People & access' },
  { to: '/settings/reference-data', label: 'Reference data',  group: 'System' },
  { to: '/settings/jobs',          label: 'Background jobs',   group: 'System' },
];

function AdminNavItem({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      style={({ isActive }) => ({
        display: 'block', padding: '8px 20px', fontSize: 14,
        color: isActive ? 'white' : 'var(--sidebar-text)',
        background: isActive ? 'var(--sidebar-active)' : 'transparent',
        textDecoration: 'none', transition: 'background 0.15s',
      })}
      onMouseEnter={(e) => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
      onMouseLeave={(e) => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'transparent'; }}
    >
      {item.label}
    </NavLink>
  );
}

export default function AdminArea() {
  const { user, logout } = useAuth();
  const pulseEnabled = usePulseEnabled();

  // Pulse is a product surface (it lives in ProductShell), but admins manage it
  // — surface a shortcut here only when the feature flag is on.
  const items = pulseEnabled
    ? [...ADMIN_NAV.slice(0, 3), { to: '/admin/pulse', label: 'Pulse', group: 'Overview' }, ...ADMIN_NAV.slice(3)]
    : ADMIN_NAV;

  let g = null;
  const nav = items.map((item) => {
    const showGroup = item.group !== g;
    if (showGroup) g = item.group;
    return (
      <div key={item.to}>
        {showGroup && (
          <div style={{ padding: '16px 20px 6px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sidebar-text-muted)' }}>
            {item.group}
          </div>
        )}
        <AdminNavItem item={item} />
      </div>
    );
  });

  return (
    <div className="app-layout">
      <aside style={{
        position: 'fixed', top: 0, left: 0,
        width: 'var(--sidebar-width)', height: '100vh',
        background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)',
        display: 'flex', flexDirection: 'column', zIndex: 50,
      }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: '#c75b39', padding: '2px 8px', borderRadius: 4, marginBottom: 8 }}>
            Admin
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Platform admin</div>
          <Link to="/sections" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--sidebar-text-muted)', textDecoration: 'none' }}>
            ← Back to the product
          </Link>
        </div>

        {/* Act-as-newsroom (Phase 2d) + the Develop AI sector filter */}
        <div style={{ padding: '12px 16px 0' }}>
          <NewsroomSwitcher dark />
        </div>
        <SectorSelect />

        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {nav}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13 }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{user?.name}</div>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--sidebar-text-muted)', fontSize: 13, padding: 0, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-content">
        <Outlet />
      </main>
      <AiAssistantPanel />
      <FeedbackBubble />
    </div>
  );
}
