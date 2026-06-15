// BairShell — the BAIR area chrome. A sibling to the Studio back-office (NOT
// nested in it), mirroring the schema separation in the UI: its own green-badged
// header, reached via a "BAIR" entry in the Studio nav. Admin-gated by the route.
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import FeedbackBubble from '../../components/FeedbackBubble.jsx';

const INK = '#0f2e24';      // deep green — distinct from Studio's amber/charcoal
const ACCENT = '#34d399';

export default function BairShell() {
  const { logout } = useAuth();
  return (
    <div style={{ minHeight: '100vh', background: '#f7f6f3' }}>
      <header style={{ background: INK, color: '#e7efe9', borderBottom: `2px solid #1f6f54`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK, background: ACCENT, padding: '2px 8px', borderRadius: 4 }}>BAIR</span>
            <Link to="/bair" style={{ color: '#fff', textDecoration: 'none', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>AI-Readiness Audits</Link>
          </div>
          <nav style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 13 }}>
            <Link to="/bair" style={{ color: '#cfe0d8', textDecoration: 'none' }}>Audits</Link>
            <Link to="/dashboard" style={{ color: '#9fbcae', textDecoration: 'none' }}>← Studio</Link>
            <button onClick={logout} style={{ background: 'none', border: 'none', color: '#9fbcae', cursor: 'pointer', fontSize: 13, padding: 0 }}>Sign out</button>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px' }}>
        <Outlet />
      </main>
      <FeedbackBubble />
    </div>
  );
}
