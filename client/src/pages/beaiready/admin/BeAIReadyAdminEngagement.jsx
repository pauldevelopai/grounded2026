// BeAIReadyAdminEngagement — the AI-governance delivery manual AS a workflow. Pick a
// client and see where they are across the six phases (Scope → Discovery → Classify →
// Gap → Controls/Policy → Monitor), each computed from the real governance data they've
// built. The consultant's at-a-glance view of every engagement. Admin-only.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const STATUS = {
  done: { bg: '#dcfce7', fg: '#166534', label: 'Done', dot: '#16a34a' },
  in_progress: { bg: '#fef3c7', fg: '#92400e', label: 'In progress', dot: '#d97706' },
  todo: { bg: '#f1f5f9', fg: '#475569', label: 'To do', dot: '#94a3b8' },
};

export default function BeAIReadyAdminEngagement() {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/beaiready/admin/clients').then((c) => { setClients(c); if (c.length && !clientId) setClientId(c[0].id); }).catch((e) => setErr(e.message));
  }, []);

  const load = useCallback((id) => {
    if (!id) return;
    setLoading(true); setErr(''); setRun(null);
    apiFetch(`/beaiready/admin/governance/runner?newsroom_id=${id}`).then(setRun).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (clientId) load(clientId); }, [clientId, load]);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Engagement runner</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '72ch' }}>
        The delivery manual as a live workflow. Pick a client to see how far their AI-governance
        engagement has progressed across the six phases — each computed from the real data they've built
        (register, risk tiers, controls, policy, reviews).
      </p>
      {err && <div style={banner}>{err}</div>}

      <select style={{ ...inp, maxWidth: 360, marginBottom: 18 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
        <option value="">{clients === null ? 'Loading clients…' : 'Select a client…'}</option>
        {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {loading && <p style={muted}>Loading…</p>}
      {run && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <strong style={{ fontSize: 15 }}>{run.done}/{run.total} phases complete</strong>
            <span style={muted}>· {run.evidence} evidence item{run.evidence === 1 ? '' : 's'} on file</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {run.phases.map((p, i) => {
              const s = STATUS[p.status] || STATUS.todo;
              return (
                <div key={p.key} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 999, background: s.bg, color: s.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{p.label}</strong>
                        <span style={{ ...pill, background: s.bg, color: s.fg }}>{s.label}</span>
                      </div>
                      <div style={muted}>{p.detail}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ ...muted, marginTop: 14 }}>
            Monitoring is continuous: the daily governance ingest + the <a href="/admin/governance" style={{ color: '#c75b39' }}>corpus</a> and
            the <a href="/tracker" style={{ color: '#c75b39' }}>legal &amp; regulation tracker</a> keep every client's grounding current.
          </p>
        </>
      )}
      {run && run.phases.every((p) => p.status === 'todo' || p.key === 'scope') && (
        <p style={{ ...muted, marginTop: 8 }}>This client is just starting — guide them to build their AI register first.</p>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff' };
const pill = { fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase', whiteSpace: 'nowrap' };
const muted = { color: '#8a8076', fontSize: 13, margin: '2px 0 0' };
