// BeAIReadyAdminPillars — Pillars page of the BE AI READY admin. Pick a client,
// then work each of the six pillars: record the audit's recommendations and see
// progress. Reads/writes the client's data via the admin's X-Newsroom-Id
// override (admins may act in any tenant).
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';
import { PILLARS } from '../pillars.js';

const PRIORITIES = ['now', 'high', 'medium', 'low'];
const PRIORITY_STYLE = {
  now: { bg: '#fee2e2', fg: '#991b1b' }, high: { bg: '#ffedd5', fg: '#9a3412' },
  medium: { bg: '#fef3c7', fg: '#92400e' }, low: { bg: '#f1f5f9', fg: '#475569' },
};

export default function BeAIReadyAdminPillars() {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [recs, setRecs] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/beaiready/admin/clients').then((c) => {
      setClients(c);
      if (c.length && !clientId) setClientId(c[0].id);
    }).catch((e) => setErr(e.message));
  }, []);

  const loadRecs = () => {
    if (!clientId) return;
    apiFetch('/beaiready/recommendations', { headers: { 'X-Newsroom-Id': clientId } })
      .then(setRecs).catch((e) => setErr(e.message));
  };
  useEffect(() => { setRecs(null); loadRecs(); }, [clientId]);

  const client = (clients || []).find((c) => c.id === clientId);

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Pillars</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '64ch' }}>
        Work each pillar for a client — record the audit's prioritised recommendations; they appear in
        that client's dashboard. (Materials upload + deeper progress tracking come next.)
      </p>
      {err && <div style={banner}>{err}</div>}

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', marginRight: 10 }}>Client</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...inp, minWidth: 240 }}>
          {clients === null && <option>Loading…</option>}
          {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {client && (
        <div style={{ display: 'grid', gap: 14 }}>
          {PILLARS.map((p) => (
            <PillarBlock key={p.key} pillar={p} clientId={clientId}
              recs={(recs || []).filter((r) => r.pillar === p.key)} onChanged={loadRecs} setErr={setErr} />
          ))}
        </div>
      )}
    </div>
  );
}

function PillarBlock({ pillar, clientId, recs, onChanged, setErr }) {
  const [form, setForm] = useState({ title: '', detail: '', priority: 'medium' });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/recommendations', {
        method: 'POST',
        headers: { 'X-Newsroom-Id': clientId },
        body: JSON.stringify({ newsroom_id: clientId, pillar: pillar.key, ...form }),
      });
      setForm({ title: '', detail: '', priority: 'medium' });
      onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const setStatus = async (id, status) => {
    setErr('');
    try { await apiFetch(`/beaiready/recommendations/${id}`, { method: 'PUT', headers: { 'X-Newsroom-Id': clientId }, body: JSON.stringify({ status }) }); onChanged(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{pillar.label}</span>
          <span style={{ fontSize: 12, color: '#8a8076', marginLeft: 10 }}>{recs.length} recommendation{recs.length === 1 ? '' : 's'}</span>
        </div>
        <span style={{ color: '#c75b39', fontSize: 13 }}>{open ? 'Hide' : 'Open'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          {recs.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 8 }}>
              {recs.map((r) => (
                <li key={r.id} style={{ fontSize: 13.5, borderLeft: '3px solid #eee5da', paddingLeft: 10 }}>
                  <span style={{ ...pill, ...PRIORITY_STYLE[r.priority] }}>{r.priority}</span> <strong>{r.title}</strong>
                  {r.detail && <div style={{ color: '#6b6359', marginTop: 2 }}>{r.detail}</div>}
                  <div style={{ marginTop: 4 }}>
                    {['open', 'done', 'dismissed'].map((s) => (
                      <button key={s} onClick={() => setStatus(r.id, s)}
                        style={{ ...tag, fontWeight: r.status === s ? 700 : 400, background: r.status === s ? '#1c1b1a' : '#f1f0ec', color: r.status === s ? '#fff' : '#6b6359' }}>{s}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} style={{ display: 'grid', gap: 6, maxWidth: 560 }}>
            <input style={inp} placeholder={`Recommendation for ${pillar.label}…`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea style={{ ...inp, minHeight: 48 }} placeholder="Detail (optional)" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inp}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="submit" disabled={busy} style={btn}>Add</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '8px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, marginRight: 4 };
const tag = { fontSize: 11, padding: '2px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', marginRight: 4 };
