// StudioShell — Develop AI's back-office shell (Phase 1 · step 4).
//
// The concept-note three-bucket split puts Develop AI's own business ops (CRM,
// fundraising pipeline, curriculum, mentoring, outreach, newsletter,
// intelligence, knowledge, database, learning/agents) behind their own shell —
// same codebase, admin-gated, visually distinct from the newsroom product.
//
// This is layout/routing only: the back-office page components are unchanged
// and keep their existing paths (so internal links and bookmarks all survive);
// only the wrapping shell + nav placement change. Reversible.

import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AiAssistantPanel from '../components/AiAssistantPanel.jsx';
import FeedbackBubble from '../components/FeedbackBubble.jsx';
import SectorSelect from './SectorSelect.jsx';

// The studio nav. Mirrors the route definitions mounted under StudioShell in
// App.jsx. (Profile, reference-data, team, jobs etc. are NOT here — they belong
// to the product / platform-admin buckets, not the back-office.)
const STUDIO_NAV = [
  { to: '/dashboard',            label: 'Dashboard',         group: 'Overview' },
  { to: '/agents',               label: 'Agents & jobs',     group: 'Overview' },
  { to: '/contacts',             label: 'Contacts',          group: 'CRM' },
  { to: '/organisations',        label: 'Organisations',     group: 'CRM' },
  { to: '/programmes',           label: 'Cohorts',           group: 'CRM' },
  { to: '/assessments',          label: 'Assessments',       group: 'CRM' },
  { to: '/leads',                label: 'Leads',             group: 'CRM' },
  { to: '/training-materials',   label: 'Training Materials', group: 'Curriculum' },
  { to: '/course-builder',       label: 'Course Builder',    group: 'Curriculum' },
  { to: '/curriculum',           label: 'Courses',           group: 'Curriculum' },
  { to: '/mentoring',            label: 'Mentoring',         group: 'Delivery' },
  { to: '/services',             label: 'Services',          group: 'Delivery' },
  { to: '/marketing/campaigns',  label: 'Campaigns',         group: 'Outreach' },
  { to: '/marketing/social',     label: 'Social Content',    group: 'Outreach' },
  { to: '/fundraising',          label: 'Pipeline',          group: 'Fundraising' },
  { to: '/fundraising/funders',  label: 'Funders',           group: 'Fundraising' },
  { to: '/newsletter',           label: 'Briefings',         group: 'AI tools' },
  { to: '/intelligence',         label: 'Intelligence',      group: 'AI tools' },
  { to: '/knowledge',            label: 'Knowledge',         group: 'AI tools' },
  { to: '/database',             label: 'Database',          group: 'Data' },
  { to: '/learning',             label: 'Learning journeys', group: 'Data' },
  { to: '/bair',                 label: 'AI-readiness audits', group: 'BAIR' },
  { to: '/settings/sectors',     label: 'Sectors',           group: 'Settings' },
  { to: '/settings/gmail',       label: 'Gmail',             group: 'Settings' },
];

function StudioNavItem({ item }) {
  return (
    <NavLink
      to={item.to}
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

export default function StudioShell() {
  const { user, logout } = useAuth();

  let g = null;
  const nav = STUDIO_NAV.map((item) => {
    const showGroup = item.group !== g;
    if (showGroup) g = item.group;
    return (
      <div key={item.to}>
        {showGroup && (
          <div style={{ padding: '16px 20px 6px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sidebar-text-muted)' }}>
            {item.group}
          </div>
        )}
        <StudioNavItem item={item} />
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
        {/* Header — a STUDIO badge marks this as the back-office, distinct from
            the newsroom product, with a one-click way back. */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0F172A', background: '#FBBF24', padding: '2px 8px', borderRadius: 4, marginBottom: 8 }}>
            Studio
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Develop&nbsp;AI back-office</div>
          <Link to="/admin" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--sidebar-text-muted)', textDecoration: 'none' }}>
            ← Back to Grounded admin
          </Link>
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
