import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import { usePulseEnabled } from '../../hooks/usePulseEnabled.js';
import { StatusBadge } from '../pulse/pulseUi.jsx';

// Insights — one "what's going on across Grounded" view. It COMPOSES the existing
// APIs (no new backend): GET /nodes/admin/overview (hosted usage + local installs
// + feedback, discovered across every node_<slug>_activity table) and, when the
// Pulse flag is on, GET /pulse/cycles. The Nodes page (/node-admin) stays the
// detailed per-node drill-down; this is the at-a-glance + "what needs me" layer.

const muted = { fontSize: 13, color: 'var(--text-secondary)' };
const num = { fontVariantNumeric: 'tabular-nums' };
const TYPE_COLOR = { bug: '#EF4444', suggestion: '#3B82F6', praise: '#10B981', question: '#8B5CF6', other: '#94A3B8' };

// Pulse statuses that are waiting on the newsroom / are terminal — everything
// else is sitting on Paul's desk.
const PULSE_WAITING = new Set(['Sent', 'Reported back', 'Cancelled']);

const OP_LABEL = {
  ingest: 'uploads', brief: 'briefs', setup: 'key setups',
  verify_claim_done: 'claim checks', inspect_url: 'origin tracks',
  listener_analyze_done: 'post analyses', listener_compare_done: 'comparisons',
  listener_brief_done: 'weekly briefs', listener_page_add: 'watchlist adds',
  judgment: 'result ratings', corpus_add: 'corpus adds',
  reporter_add: 'reporters added', entry_add: 'output logged',
  daily_report_parse_done: 'reports parsed', self_submit_done: 'reporter submits',
  inbound_email_done: 'emails ingested', connector_sync: 'metric syncs',
  metric_add: 'metrics added',
};
const opLabel = (op) => OP_LABEL[op] || (op || '').replace(/_/g, ' ');

function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}
function splitFeedback(message) {
  const m = /^\[(\w+)\]\s*([\s\S]*)$/.exec(message || '');
  return m ? { type: m[1], text: m[2] } : { type: 'other', text: message || '' };
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: accent, ...num }}>{value}</div>
      {sub && <div style={muted}>{sub}</div>}
    </div>
  );
}
function Empty({ children }) {
  return <div className="card" style={{ padding: 18, marginBottom: 24, ...muted }}>{children}</div>;
}
function SectionTitle({ children, count }) {
  return (
    <h3 style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 10px' }}>
      {children}{count != null && <span style={muted}> · {count}</span>}
    </h3>
  );
}

export default function Insights() {
  const pulseEnabled = usePulseEnabled();
  const [data, setData] = useState(null);
  const [cycles, setCycles] = useState(null);   // null = unknown/loading, [] = none
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/nodes/admin/overview').then(setData).catch((e) => setError(e.message || 'Could not load'));
  }, []);

  useEffect(() => {
    if (!pulseEnabled) return;
    apiFetch('/pulse/cycles').then(setCycles).catch(() => setCycles([]));
  }, [pulseEnabled]);

  if (error) return (<div><PageHeader title="Insights" /><div className="empty-state"><h3>{error}</h3></div></div>);
  if (!data) return (<div><PageHeader title="Insights" /><p style={muted}>Loading…</p></div>);

  const { nodes = [], feedback = [], local = [] } = data;

  // ── Roll-ups across every hosted node ──
  const newsroomIds = new Set();
  nodes.forEach((n) => (n.newsrooms || []).forEach((r) => r.newsroom_id && newsroomIds.add(r.newsroom_id)));
  const totalActions = nodes.reduce((a, n) => a + Number(n.totals?.runs || 0), 0);
  const totalErrors = nodes.reduce((a, n) => a + Number(n.totals?.errors || 0), 0);
  const activeNodes = nodes.filter((n) => (n.totals?.newsrooms || 0) > 0).length;

  // ── One merged activity stream across all nodes (newest first) ──
  const activity = nodes
    .flatMap((n) => (n.recent || []).map((r) => ({ ...r, node: n.label || n.slug })))
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .slice(0, 30);

  // ── Pulse: split into "needs you" vs waiting ──
  const cyc = Array.isArray(cycles) ? cycles : [];
  const needsYou = cyc.filter((c) => c.status && !PULSE_WAITING.has(c.status));
  const openCycles = cyc.filter((c) => c.status !== 'Reported back' && c.status !== 'Cancelled');

  return (
    <div>
      <PageHeader title="Insights" />
      <p style={{ ...muted, marginTop: -8, marginBottom: 20 }}>
        What's happening across the GROUNDED Nodes — usage, feedback, and the Pulse feedback loop, in one place.
        For per-node detail see <Link to="/node-admin">Nodes</Link>{pulseEnabled && <> · for the full loop see <Link to="/admin/pulse">Pulse</Link></>}.
      </p>

      {/* ── KPI strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
        <Stat label="Newsrooms active" value={newsroomIds.size} sub="used a Node online" />
        <Stat label="Nodes in use" value={activeNodes} sub={`of ${nodes.length} hosted`} />
        <Stat label="Actions" value={totalActions} sub="hosted, all Nodes" />
        <Stat label="Errors" value={totalErrors} accent={totalErrors ? '#EF4444' : undefined} />
        <Stat label="Local installs" value={local.length} />
        <Stat label="Feedback" value={feedback.length} />
        {pulseEnabled && <Stat label="Open Pulse cycles" value={openCycles.length} sub={needsYou.length ? `${needsYou.length} need you` : 'all waiting'} accent={needsYou.length ? '#6366F1' : undefined} />}
      </div>

      {/* ── Needs your attention ── */}
      {(needsYou.length > 0 || totalErrors > 0) && (
        <div className="card" style={{ padding: 16, marginBottom: 28, borderLeft: '3px solid #6366F1' }}>
          <SectionTitle>Needs your attention</SectionTitle>
          {needsYou.length === 0 && <div style={muted}>No Pulse cycle is waiting on you.</div>}
          {needsYou.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
              <StatusBadge status={c.status} />
              <Link to={`/admin/pulse/cycles/${c.id}`} style={{ fontWeight: 600, fontSize: 13 }}>{c.newsroom || c.cycleId || 'Cycle'}</Link>
              <span style={muted}>{c.nodeInstall}</span>
              <span style={{ ...muted, marginLeft: 'auto', textAlign: 'right' }}>{c.blocking}</span>
            </div>
          ))}
          {totalErrors > 0 && (
            <div style={{ ...muted, marginTop: needsYou.length ? 10 : 0 }}>
              ⚠ {totalErrors} error{totalErrors === 1 ? '' : 's'} logged across Nodes — see the activity stream below or the <Link to="/node-admin">Nodes</Link> page.
            </div>
          )}
        </div>
      )}

      {/* ── Pulse cycles ── */}
      {pulseEnabled && (
        <>
          <SectionTitle count={cyc.length}>Pulse cycles</SectionTitle>
          {cyc.length === 0 ? (
            <Empty>No Pulse cycles yet. Start one from <Link to="/admin/pulse">Pulse → Trigger new cycle</Link>.</Empty>
          ) : (
            <div className="card" style={{ padding: 0, marginBottom: 28, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 12px' }}>Newsroom</th>
                  <th style={{ padding: '10px 12px' }}>Node</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>What's next</th>
                </tr></thead>
                <tbody>
                  {cyc.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        <Link to={`/admin/pulse/cycles/${c.id}`}>{c.newsroom || c.cycleId || 'Cycle'}</Link>
                      </td>
                      <td style={{ padding: '10px 12px', ...muted }}>{c.nodeInstall || '—'}</td>
                      <td style={{ padding: '10px 12px' }}><StatusBadge status={c.status} /></td>
                      <td style={{ padding: '10px 12px', ...muted }}>{c.blocking}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Recent activity across all nodes ── */}
      <SectionTitle count={activity.length}>Recent activity</SectionTitle>
      {activity.length === 0 ? (
        <Empty>No hosted activity recorded yet. When a newsroom signs in at a Node and uses it, it shows here.</Empty>
      ) : (
        <div className="card" style={{ padding: 0, marginBottom: 28 }}>
          {activity.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 14px', borderBottom: i < activity.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '1px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>{r.node}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.member_email || 'Unknown'}</span>
              <span style={{ fontSize: 13, color: r.kind === 'error' ? '#EF4444' : 'var(--text-primary)' }}>
                {r.kind === 'error' ? 'hit an error' : r.kind === 'feedback' ? 'sent feedback' : opLabel(r.op)}
              </span>
              <span style={{ ...muted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtDateTime(r.ts)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Latest feedback ── */}
      <SectionTitle count={feedback.length}>Latest feedback</SectionTitle>
      {feedback.length === 0 ? (
        <Empty>No feedback yet. The Feedback button inside each Node (and on the site) lands here.</Empty>
      ) : (
        feedback.slice(0, 8).map((f, i) => {
          const { type, text } = splitFeedback(f.message);
          return (
            <div key={i} className="card" style={{ marginBottom: 8, padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'white', background: TYPE_COLOR[type] || TYPE_COLOR.other, padding: '2px 8px', borderRadius: 10 }}>{type}</span>
                {f.node && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '1px 7px', borderRadius: 10 }}>{f.node}</span>}
                <span style={{ fontWeight: 600, fontSize: 13 }}>{f.member_name || f.member_email || 'Unknown'}</span>
                <span style={{ ...muted, marginLeft: 'auto' }}>{fmtDateTime(f.ts)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text}</div>
            </div>
          );
        })
      )}
      {feedback.length > 8 && (
        <p style={muted}><Link to="/node-admin">See all {feedback.length} feedback items →</Link></p>
      )}
    </div>
  );
}
