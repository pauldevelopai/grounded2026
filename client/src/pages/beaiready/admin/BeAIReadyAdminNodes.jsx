// BeAIReadyAdminNodes — Nodes oversight for the BE AI READY admin. Read-only.
// Who's using which node, whether it's working (errors), what they're running
// (extractions/ops), recent activity, feedback, and — for BYOK nodes like Extract
// PDF — which clients have configured a key (never the key itself; it's encrypted).
// Reads the platform's existing node telemetry (node_<slug>_activity + _store).
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

export default function BeAIReadyAdminNodes() {
  const [data, setData] = useState(null);   // { nodes, feedback, local }
  const [keys, setKeys] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/nodes/admin/overview').then(setData).catch((e) => setErr(e.message));
    apiFetch('/nodes/admin/node-keys').then(setKeys).catch(() => setKeys([]));
  }, []);

  const fmt = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const keysFor = (slug) => keys.find((k) => k.slug === slug)?.tenants || [];

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Nodes</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '70ch' }}>
        Oversight of the Nodes your clients run — who's using each, whether it's working, what they're
        running, and (for keyed nodes like Extract PDF) who has set up a key. Read-only; live from node telemetry.
      </p>
      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {data == null && !err && <p style={{ color: '#8a8076' }}>Loading…</p>}

      {data?.nodes?.length === 0 && (
        <div style={{ ...card, color: '#8a8076' }}>No node usage recorded yet. Activity appears here once a client runs a hosted node.</div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {(data?.nodes || []).map((n) => {
          const nodeKeys = keysFor(n.slug);
          const healthy = n.totals.errors === 0;
          return (
            <section key={n.slug} style={card}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{n.label}</h2>
                <span style={{ ...pill, background: healthy ? '#dcfce7' : '#fee2e2', color: healthy ? '#166534' : '#991b1b' }}>
                  {healthy ? '● working' : `● ${n.totals.errors} error${n.totals.errors === 1 ? '' : 's'}`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 22, margin: '8px 0 12px', flexWrap: 'wrap' }}>
                <Stat n={n.totals.newsrooms} label="clients using" />
                <Stat n={n.totals.runs} label="runs" />
                <Stat n={n.totals.errors} label="errors" />
                {nodeKeys.length > 0 && <Stat n={nodeKeys.length} label="keys configured" />}
              </div>

              {/* Per-client usage */}
              {n.newsrooms?.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={tbl}>
                    <thead><tr>{['Client / member', 'Runs', 'Errors', 'Last used'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {n.newsrooms.map((u, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f0ebe3' }}>
                          <td style={td}>{u.member_name || u.member_email || u.newsroom_id?.slice(0, 8) || '—'}{u.member_email && u.member_name ? <span style={muted}> · {u.member_email}</span> : ''}</td>
                          <td style={td}>{u.runs}</td>
                          <td style={{ ...td, color: u.errors > 0 ? '#b91c1c' : '#3a342e' }}>{u.errors}</td>
                          <td style={{ ...td, ...muted }}>{fmt(u.last_activity_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* What they're running */}
              {n.ops?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={lbl}>What they run</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {n.ops.map((o) => <span key={o.op} style={chip}>{o.op} · {o.n}</span>)}
                  </div>
                </div>
              )}

              {/* BYOK keys */}
              {nodeKeys.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={lbl}>API keys configured (encrypted — values never shown)</div>
                  <ul style={list}>
                    {nodeKeys.map((t, i) => (
                      <li key={i} style={{ fontSize: 13 }}>🔑 {t.member_name || t.member_email || 'a client'}<span style={muted}> · set {fmt(t.updated_at)}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recent activity */}
              {n.recent?.length > 0 && (
                <details>
                  <summary style={{ fontSize: 12.5, color: '#c75b39', cursor: 'pointer' }}>Recent activity ({n.recent.length})</summary>
                  <ul style={{ ...list, marginTop: 6 }}>
                    {n.recent.map((r, i) => (
                      <li key={i} style={{ fontSize: 12.5, color: '#6b6359' }}>
                        <span style={{ color: r.kind === 'error' ? '#b91c1c' : '#166534' }}>{r.kind}</span>{r.op ? ` · ${r.op}` : ''} · {r.member_email || '—'} · {fmt(r.ts)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>

      {/* Feedback across nodes */}
      {data?.feedback?.length > 0 && (
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px' }}>Client feedback</h2>
          <ul style={list}>
            {data.feedback.slice(0, 30).map((f, i) => (
              <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                <strong>{labelOf(data.nodes, f.node)}</strong> · {f.member_name || f.member_email || '—'}: {f.message || '(no message)'}
                <span style={muted}> · {f.ts ? new Date(f.ts).toLocaleDateString() : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Local installs */}
      {data?.local?.length > 0 && (
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px' }}>Local installs (opted-in)</h2>
          <ul style={list}>
            {data.local.map((l) => (
              <li key={l.install_id} style={{ fontSize: 13 }}>{l.node_slug} · {l.newsroom || 'unknown'} <span style={muted}>· v{l.node_version || '?'} · last seen {l.last_seen ? new Date(l.last_seen).toLocaleDateString() : '—'}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function labelOf(nodes, slug) { return (nodes || []).find((n) => n.slug === slug)?.label || slug; }
function Stat({ n, label }) {
  return <div><div style={{ fontSize: 24, fontWeight: 800, color: '#c75b39', lineHeight: 1 }}>{n ?? 0}</div><div style={{ fontSize: 11, color: '#8a8076', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div></div>;
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
const pill = { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 };
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th = { textAlign: 'left', padding: '6px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076', borderBottom: '1px solid #e4dcd2' };
const td = { padding: '7px 10px', color: '#3a342e' };
const muted = { color: '#a89e92', fontWeight: 400 };
const lbl = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076', marginBottom: 4 };
const chip = { fontSize: 12, fontWeight: 600, color: '#6b6359', background: '#f4f1ec', padding: '3px 9px', borderRadius: 999 };
const list = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 };
