import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

// Usage + feedback for the GROUNDED Nodes. Every hosted Node writes its own
// node_<slug>_activity table; the overview discovers them all, so each Node
// (Audience Signal, Election Watch, …) reports here. Local installs = node_beacons;
// feedback = the Feedback widget, aggregated across Nodes. Read-only.

const muted = { fontSize: 13, color: 'var(--text-secondary)' };
const num = { fontVariantNumeric: 'tabular-nums' };
const TYPE_COLOR = { bug: '#EF4444', suggestion: '#3B82F6', praise: '#10B981', question: '#8B5CF6', other: '#94A3B8' };

// Friendly labels for the activity ops each Node logs.
const OP_LABEL = {
  ingest: 'uploads', brief: 'briefs', setup: 'key setups',
  verify_claim_done: 'claim checks', inspect_url: 'origin tracks',
  listener_analyze_done: 'post analyses', listener_compare_done: 'comparisons',
  listener_brief_done: 'weekly briefs', listener_page_add: 'watchlist adds',
  judgment: 'result ratings', corpus_add: 'corpus adds',
};
const opLabel = (op) => OP_LABEL[op] || (op || '').replace(/_/g, ' ');

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}
function splitFeedback(message) {
  const m = /^\[(\w+)\]\s*([\s\S]*)$/.exec(message || '');
  return m ? { type: m[1], text: m[2] } : { type: 'other', text: message || '' };
}

function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, ...num }}>{value}</div>
      {sub && <div style={muted}>{sub}</div>}
    </div>
  );
}
function Empty({ children }) {
  return <div className="card" style={{ padding: 18, marginBottom: 24, ...muted }}>{children}</div>;
}

const nameOf = (r) => r.member_name || r.member_email || (r.newsroom_id ? `Account ${String(r.newsroom_id).slice(0, 8)}` : 'Unknown');

function NodeBlock({ node }) {
  const { label, newsrooms = [], ops = [], recent = [], totals = {}, has_stories } = node;
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        {label}{' '}
        <span style={muted}>· {totals.newsrooms || 0} newsroom{totals.newsrooms === 1 ? '' : 's'} · {totals.runs || 0} action{totals.runs === 1 ? '' : 's'}{totals.errors ? ` · ${totals.errors} error${totals.errors === 1 ? '' : 's'}` : ''}</span>
      </h3>

      {/* Op breakdown chips */}
      {ops.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 12px' }}>
          {ops.map((o) => (
            <span key={o.op} style={{ fontSize: 12, background: 'var(--bg-secondary, #F1F5F9)', color: 'var(--text-primary)', padding: '3px 9px', borderRadius: 999 }}>
              <strong style={num}>{o.n}</strong> {opLabel(o.op)}
            </span>
          ))}
        </div>
      )}

      {newsrooms.length === 0 ? (
        <Empty>No newsroom has used {label} online yet.</Empty>
      ) : (
        <div className="card" style={{ padding: 0, marginBottom: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '10px 12px' }}>Newsroom</th>
              {has_stories && <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stories</th>}
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Errors</th>
              <th style={{ padding: '10px 12px' }}>Last active</th>
            </tr></thead>
            <tbody>
              {newsrooms.map((r) => (
                <tr key={r.newsroom_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{nameOf(r)}</td>
                  {has_stories && <td style={{ padding: '10px 12px', textAlign: 'right', ...num }}>{Number(r.stories || 0)}</td>}
                  <td style={{ padding: '10px 12px', textAlign: 'right', ...num }}>{Number(r.runs || 0)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', ...num, color: Number(r.errors) ? '#EF4444' : undefined }}>{Number(r.errors || 0)}</td>
                  <td style={{ padding: '10px 12px', ...muted }}>{fmtDate(r.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recent.length > 0 && (
        <details>
          <summary style={{ ...muted, cursor: 'pointer', marginBottom: 6 }}>Recent activity ({recent.length})</summary>
          <div className="card" style={{ padding: 0 }}>
            {recent.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 14px', borderBottom: i < recent.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.member_email || 'Unknown'}</span>
                <span style={{ fontSize: 13, color: r.kind === 'error' ? '#EF4444' : 'var(--text-primary)' }}>
                  {r.kind === 'error' ? 'hit an error' : r.kind === 'feedback' ? 'sent feedback' : opLabel(r.op)}
                </span>
                <span style={{ ...muted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtDate(r.ts)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function NodesAdmin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/nodes/admin/overview').then(setData).catch((e) => setError(e.message || 'Could not load'));
  }, []);

  if (error) return (<div><PageHeader title="Nodes" /><div className="empty-state"><h3>{error}</h3></div></div>);
  if (!data) return (<div><PageHeader title="Nodes" /><p style={muted}>Loading…</p></div>);

  const { nodes = [], feedback = [], local = [] } = data;
  const newsroomIds = new Set();
  nodes.forEach((n) => (n.newsrooms || []).forEach((r) => r.newsroom_id && newsroomIds.add(r.newsroom_id)));
  const totalActions = nodes.reduce((a, n) => a + Number(n.totals?.runs || 0), 0);
  const activeNodes = nodes.filter((n) => (n.totals?.newsrooms || 0) > 0).length;

  return (
    <div>
      <PageHeader title="Nodes" />
      <p style={{ ...muted, marginTop: -8, marginBottom: 20 }}>
        How newsrooms are using the GROUNDED Nodes — online (hosted) and on their own machines (opt-in).
      </p>

      {/* ── Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
        <Stat label="Nodes in use" value={activeNodes} sub={`of ${nodes.length} hosted`} />
        <Stat label="Newsrooms online" value={newsroomIds.size} />
        <Stat label="Actions" value={totalActions} sub="hosted, all Nodes" />
        <Stat label="Local installs" value={local.length} sub="reported in" />
        <Stat label="Feedback" value={feedback.length} />
      </div>

      {/* ── Per-node hosted usage ── */}
      {nodes.length === 0 ? (
        <Empty>No hosted Node has recorded activity yet. When someone signs in at a Node (e.g. <code>/nodes/verifier/app/</code>) and uses it, it appears here.</Empty>
      ) : (
        nodes.map((n) => <NodeBlock key={n.slug} node={n} />)
      )}

      {/* ── Local installs ── */}
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Local installs <span style={muted}>· {local.length}</span>
      </h3>
      {local.length === 0 ? (
        <Empty>No downloaded installs have reported in yet. A Node pings here on startup with its newsroom, version, OS and counts (never story content) — unless its owner sets <code>GROUNDED_TELEMETRY=off</code>.</Empty>
      ) : (
        <div className="card" style={{ padding: 0, marginBottom: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '10px 12px' }}>Newsroom / install</th>
              <th style={{ padding: '10px 12px' }}>Version</th>
              <th style={{ padding: '10px 12px' }}>OS</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stories</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Uploads</th>
              <th style={{ padding: '10px 12px' }}>Last seen</th>
            </tr></thead>
            <tbody>
              {local.map((r) => (
                <tr key={r.install_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{r.newsroom || 'Unnamed'}</div>
                    <div style={muted}>{r.node_slug} · {String(r.install_id).slice(0, 8)}</div>
                  </td>
                  <td style={{ padding: '10px 12px', ...muted }}>{r.node_version || '—'}</td>
                  <td style={{ padding: '10px 12px', ...muted }}>{r.os || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', ...num }}>{Number(r.story_count || 0)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', ...num }}>{Number(r.ingests || 0)}</td>
                  <td style={{ padding: '10px 12px', ...muted }}>{fmtDate(r.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Feedback ── */}
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Feedback <span style={muted}>· {feedback.length}</span></h3>
      {feedback.length === 0 ? (
        <Empty>No feedback yet. The Feedback button inside each Node (and on the site) lands here.</Empty>
      ) : (
        feedback.map((f, i) => {
          const { type, text } = splitFeedback(f.message);
          return (
            <div key={i} className="card" style={{ marginBottom: 8, padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'white', background: TYPE_COLOR[type] || TYPE_COLOR.other, padding: '2px 8px', borderRadius: 10 }}>{type}</span>
                {f.node && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '1px 7px', borderRadius: 10 }}>{f.node}</span>}
                <span style={{ fontWeight: 600, fontSize: 13 }}>{f.member_name || f.member_email || 'Unknown'}</span>
                <span style={{ ...muted, marginLeft: 'auto' }}>{fmtDate(f.ts)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
