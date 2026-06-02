import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

// Grounded command-centre: users (+ last seen), feedback, Node usage, and
// AI-legal-tracker counts in one place. Read-only; admin-gated by the route.

const muted = { fontSize: 13, color: 'var(--text-secondary)' };
const num = { fontVariantNumeric: 'tabular-nums' };
const TYPE_COLOR = { bug: '#EF4444', feature: '#6366F1', improvement: '#10B981', ui: '#F59E0B' };

function fmt(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function Stat({ label, value, sub, to }) {
  const inner = (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, ...num }}>{value}</div>
      {sub && <div style={muted}>{sub}</div>}
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [nodes, setNodes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/admin/overview').then(setData).catch(e => setError(e.message || 'Could not load'));
    apiFetch('/nodes/admin/overview').then(setNodes).catch(() => setNodes({ nodes: [], local: [], feedback: [] }));
  }, []);

  if (error) return (<div><PageHeader title="Grounded admin" /><div className="empty-state"><h3>{error}</h3></div></div>);
  if (!data) return (<div><PageHeader title="Grounded admin" /><p style={muted}>Loading…</p></div>);

  const { users = [], userStats = {}, feedbackRecent = [], feedbackStats = {}, legal = {} } = data;
  const nodeList = nodes?.nodes || [];
  const local = nodes?.local || [];
  // Distinct newsrooms that have used any hosted Node online.
  const hostedNewsrooms = new Set();
  nodeList.forEach((n) => (n.newsrooms || []).forEach((r) => r.newsroom_id && hostedNewsrooms.add(r.newsroom_id)));
  const nameOf = (u) => u.user_name || u.user_email || 'Unknown';

  return (
    <div>
      <PageHeader title="Grounded admin" />
      <p style={{ ...muted, marginTop: -8, marginBottom: 20 }}>
        Everything across Grounded in one place — users, feedback, Node usage, and the AI Legal tracker.
      </p>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <Stat label="Users" value={userStats.total ?? 0} sub={`${userStats.active ?? 0} active · ${userStats.admins ?? 0} admin`} />
        <Stat label="Feedback" value={feedbackStats.total ?? 0} sub={`${feedbackStats.pending ?? 0} pending`} to="/feedback" />
        <Stat label="Hosted newsrooms" value={hostedNewsrooms.size} sub="using a Node online" to="/node-admin" />
        <Stat label="Local installs" value={local.length} sub="opted-in beacons" to="/node-admin" />
        <Stat label="Lawsuits" value={legal.lawsuits ?? '—'} to="/lawsuits" />
        <Stat label="Regulations" value={legal.regulations ?? '—'} to="/regulation-tracker" />
      </div>

      {/* ── Users ── */}
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Users <span style={muted}>· {users.length}</span>
        <Link to="/settings/team" style={{ ...muted, marginLeft: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>manage →</Link>
      </h3>
      <div className="card" style={{ padding: 0, marginBottom: 28, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '10px 12px' }}>Name</th>
              <th style={{ padding: '10px 12px' }}>Email</th>
              <th style={{ padding: '10px 12px' }}>Role</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px' }}>Joined</th>
              <th style={{ padding: '10px 12px' }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{u.name || '—'}</td>
                <td style={{ padding: '10px 12px', ...muted }}>{u.email}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: 'white', background: u.role === 'admin' ? '#6366F1' : '#94A3B8' }}>{u.role}</span>
                </td>
                <td style={{ padding: '10px 12px', ...muted }}>{u.is_active ? (u.tracker_access ? 'Active' : 'No access') : 'Disabled'}</td>
                <td style={{ padding: '10px 12px', ...muted }}>{fmt(u.created_at)}</td>
                <td style={{ padding: '10px 12px', ...muted }}>{u.last_login ? fmt(u.last_login) : 'never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Recent feedback ── */}
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Recent feedback
        <Link to="/feedback" style={{ ...muted, marginLeft: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>see all →</Link>
      </h3>
      {feedbackRecent.length === 0 ? (
        <div className="empty-state"><h3>No feedback yet.</h3></div>
      ) : (
        feedbackRecent.map(f => (
          <div key={f.id} className="card" style={{ marginBottom: 8, padding: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'white', background: TYPE_COLOR[f.category] || '#94A3B8', padding: '2px 8px', borderRadius: 10 }}>{f.category}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.priority} · {f.status}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{nameOf(f)}</span>
              {f.page && <span style={{ ...muted, fontFamily: 'monospace', fontSize: 11 }}>{f.page}</span>}
              <span style={{ ...muted, marginLeft: 'auto' }}>{fmt(f.created_at)}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.content}</div>
          </div>
        ))
      )}
    </div>
  );
}
