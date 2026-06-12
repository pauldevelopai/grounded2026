// BusinessSecurity — the authed Data Security workspace (/dashboard/security).
// Log the AI tools your company uses, what data goes into each, and get an
// acceptability ruling + fix — auto-matched to our assessed-tools database.
// Scoped to the tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const ACC = {
  approved: { bg: '#dcfce7', fg: '#166534', label: 'Approved' },
  restricted: { bg: '#fef3c7', fg: '#92400e', label: 'Restricted' },
  avoid: { bg: '#fee2e2', fg: '#991b1b', label: 'Avoid' },
  unreviewed: { bg: '#e2e8f0', fg: '#475569', label: 'Not yet reviewed' },
};

export default function BusinessSecurity() {
  const [tools, setTools] = useState(null);
  const [form, setForm] = useState({ tool_name: '', used_by: '', data_shared: '' });
  const [busy, setBusy] = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [err, setErr] = useState('');

  const load = () => apiFetch('/beaiready/security/inventory').then(setTools).catch((e) => { setErr(e.message); setTools([]); });
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.tool_name.trim()) return;
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/security/inventory', { method: 'POST', body: JSON.stringify(form) });
      setForm({ tool_name: '', used_by: '', data_shared: '' });
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const assess = async (id) => {
    setAssessing(id); setErr('');
    try { await apiFetch(`/beaiready/security/inventory/${id}/assess`, { method: 'POST', timeout: 60000 }); await load(); }
    catch (e) { setErr(e.message); }
    setAssessing(null);
  };

  const remove = async (id) => {
    try { await apiFetch(`/beaiready/security/inventory/${id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setErr(e.message); }
  };

  const counts = (tools || []).reduce((a, t) => { a[t.acceptability] = (a[t.acceptability] || 0) + 1; return a; }, {});

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Data Security · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Your AI tools & data exposure</h1>
      <p style={{ color: '#6b6359', maxWidth: '64ch', marginBottom: 14 }}>
        Log every AI tool your team uses — official and unofficial — and what data goes into each. We match
        it to our assessed-tools database and rule on whether it's acceptable, with a prioritised fix.
      </p>
      <p style={{ marginBottom: 18 }}><Link to="/dashboard">← Back to dashboard</Link></p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {tools && tools.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {['avoid', 'restricted', 'approved', 'unreviewed'].filter((k) => counts[k]).map((k) => (
            <span key={k} style={{ ...badge, background: ACC[k].bg, color: ACC[k].fg }}>{counts[k]} {ACC[k].label.toLowerCase()}</span>
          ))}
        </div>
      )}

      {/* Add a tool */}
      <form onSubmit={add} className="hub-card" style={{ marginBottom: 18 }}>
        <div className="hub-card-kicker">Log an AI tool</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 620 }}>
          <input style={inp} placeholder="Tool name (e.g. ChatGPT, Otter.ai)" value={form.tool_name} onChange={(e) => setForm({ ...form, tool_name: e.target.value })} />
          <input style={inp} placeholder="Used by (team / person)" value={form.used_by} onChange={(e) => setForm({ ...form, used_by: e.target.value })} />
        </div>
        <textarea style={{ ...inp, minHeight: 54, marginTop: 8, maxWidth: 620 }} placeholder="What data goes into it? (e.g. client tender docs, customer emails)" value={form.data_shared} onChange={(e) => setForm({ ...form, data_shared: e.target.value })} />
        <div style={{ marginTop: 10 }}><button type="submit" disabled={busy} style={btn}>{busy ? 'Adding…' : 'Add tool'}</button></div>
      </form>

      {tools === null && <p style={{ color: '#8a8076' }}>Loading…</p>}
      {tools && tools.length === 0 && <p style={{ color: '#8a8076' }}>No tools logged yet — add the AI tools your team uses above.</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {(tools || []).map((t) => {
          const acc = ACC[t.acceptability] || ACC.unreviewed;
          return (
            <div key={t.id} className="hub-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: 16, margin: 0 }}>{t.tool_name}
                    {t.matched_name && <span style={{ fontWeight: 400, color: '#8a8076', fontSize: 13 }}> · recognised</span>}
                  </h3>
                  <p style={{ fontSize: 12.5, color: '#8a8076', margin: '2px 0 0' }}>
                    {t.used_by ? `Used by ${t.used_by}` : 'Used by —'}{t.data_shared ? ` · puts in: ${t.data_shared}` : ''}
                  </p>
                </div>
                <span style={{ ...badge, background: acc.bg, color: acc.fg }}>{acc.label}</span>
              </div>
              {t.matched_limitations && <p style={{ fontSize: 12.5, color: '#6b6359', margin: '8px 0 0' }}><b>Known risks:</b> {t.matched_limitations}</p>}
              {t.ruling && <p style={{ fontSize: 13, color: '#2b2620', margin: '8px 0 0', fontWeight: 600 }}>{t.ruling}</p>}
              {t.fix && <p style={{ fontSize: 12.5, color: '#9a3412', margin: '4px 0 0' }}><b>Fix:</b> {t.fix}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => assess(t.id)} disabled={assessing === t.id} style={btnSmall}>{assessing === t.id ? 'Assessing…' : t.ruling ? 'Re-assess' : 'Assess acceptability'}</button>
                <button onClick={() => remove(t.id)} style={btnGhostSmall}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const badge = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnSmall = { padding: '6px 12px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhostSmall = { padding: '6px 12px', background: 'transparent', color: '#6b6359', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
