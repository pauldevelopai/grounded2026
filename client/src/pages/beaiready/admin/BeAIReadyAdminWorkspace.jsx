// BeAIReadyAdminWorkspace — the consultant's window into a client's Team AI workspace.
// The client's team asks AI here and pins useful answers; the consultant reviews them
// and PROMOTES the good ones into the client's durable knowledge (which their AI then
// reliably draws on). Promotion is consultant-only — so a team member can't turn an
// unvetted answer into "truth". Reads/writes via the admin's X-Newsroom-Id override.
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

export default function BeAIReadyAdminWorkspace() {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState(null);
  const [pinnedOnly, setPinnedOnly] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiFetch('/beaiready/admin/clients').then((c) => { setClients(c); if (c.length) setClientId(c[0].id); }).catch((e) => setErr(e.message));
  }, []);

  const api = useCallback((path, opts = {}) => apiFetch(path, { ...opts, headers: { 'X-Newsroom-Id': clientId, ...(opts.headers || {}) } }), [clientId]);
  const load = useCallback(() => {
    if (!clientId) return;
    api(`/beaiready/workspace/interactions${pinnedOnly ? '?pinned=1' : ''}`).then(setItems).catch((e) => setErr(e.message));
  }, [api, clientId, pinnedOnly]);
  useEffect(() => { setItems(null); load(); }, [load]);

  const promote = async (id) => {
    setErr(''); setMsg('');
    try { await api(`/beaiready/workspace/interactions/${id}/promote`, { method: 'POST' }); setMsg('Added to the client’s durable knowledge — their AI will draw on it.'); load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Team workspace review</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '70ch' }}>
        What the client's team is asking their AI, and the answers they've pinned as useful. Promote the good ones
        into the client's durable knowledge — only you can, so nothing unvetted becomes part of what their AI treats
        as true.
      </p>
      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <label style={kicker}>Client</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inp}>
          {clients === null && <option>Loading…</option>}
          {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5b5249' }}>
          <input type="checkbox" checked={pinnedOnly} onChange={(e) => setPinnedOnly(e.target.checked)} /> Pinned only
        </label>
      </div>

      {items == null ? <p style={muted}>Loading…</p> : items.length === 0 ? (
        <p style={muted}>{pinnedOnly ? 'No pinned answers yet — the team pins the ones worth keeping.' : 'No questions asked yet.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((it) => (
            <div key={it.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{it.is_pinned && <span style={{ color: '#c75b39' }}>★ </span>}{it.question}</div>
                {it.promoted ? (
                  <span style={{ ...promoteBtn, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0', cursor: 'default' }}>✓ in knowledge</span>
                ) : (
                  <button onClick={() => promote(it.id)} style={promoteBtn}>Add to knowledge</button>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: '#5b5249', margin: '6px 0 0', lineHeight: 1.5 }}>{it.answer}</div>
              <div style={{ fontSize: 11.5, color: '#a89e92', marginTop: 6 }}>
                {it.asked_by ? `Asked by ${it.asked_by}` : 'Asked'} · {new Date(it.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const kicker = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', minWidth: 220 };
const muted = { color: '#8a8076', fontSize: 13.5 };
const promoteBtn = { fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #e4dcd2', background: '#c75b39', color: '#fff', cursor: 'pointer', fontWeight: 600, flexShrink: 0 };
