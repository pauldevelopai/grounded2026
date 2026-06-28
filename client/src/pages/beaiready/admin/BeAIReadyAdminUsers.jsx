// BeAIReadyAdminUsers — Users page of the BE AI READY admin. In this product a
// "user" IS a client business (one tenant/login). Create client businesses,
// manage their logins, see per-pillar audit status, and (Pulse) the daily
// check-in system.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const PILLAR_FLAGS = [
  ['has_policy', 'Policy'],
  ['visibility_checks', 'Visibility'],
  ['tools_logged', 'Security'],
  ['recommendations', 'Recs'],
  ['metrics', 'Metrics'],
];

export default function BeAIReadyAdminUsers() {
  const [clients, setClients] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', website: '', adminEmail: '', adminPassword: '' });
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = () => apiFetch('/beaiready/admin/clients').then(setClients).catch((e) => { setErr(e.message); setClients([]); });
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/admin/clients', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', website: '', adminEmail: '', adminPassword: '' });
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Users · client businesses</h1>
      <p style={{ color: '#6b6359', marginBottom: 20, maxWidth: '64ch' }}>
        Each client business is one tenant with its own login and isolated data. Create a business, give it a
        login, and track its audit status across the pillars.
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* Create */}
      <form onSubmit={create} style={card}>
        <div style={kicker}>Add a client business</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 640 }}>
          <input style={inp} placeholder="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={inp} placeholder="Website (optional)" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <input style={inp} placeholder="Login email (optional)" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
          <input style={inp} type="text" placeholder="Temp password (min 6)" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}><button type="submit" disabled={busy} style={btn}>{busy ? 'Creating…' : 'Create business'}</button></div>
      </form>

      {/* List */}
      {clients === null && <p style={{ color: '#8a8076' }}>Loading…</p>}
      {clients && clients.length === 0 && <p style={{ color: '#8a8076' }}>No client businesses yet.</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 6 }}>
        {(clients || []).map((c) => (
          <div key={c.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name}{!c.is_active && <span style={{ color: '#8a8076', fontWeight: 400 }}> · inactive</span>}</div>
                <div style={{ fontSize: 12, color: '#8a8076', marginTop: 2 }}>
                  /{c.slug} · {c.user_count} login{c.user_count === 1 ? '' : 's'}{c.website ? ` · ${c.website}` : ''}
                </div>
              </div>
              <button onClick={() => setOpenId(openId === c.id ? null : c.id)} style={btnGhost}>{openId === c.id ? 'Hide logins' : 'Logins'}</button>
            </div>
            {/* Per-pillar audit status */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {PILLAR_FLAGS.map(([key, label]) => {
                const done = key === 'has_policy' ? c.has_policy : c[key] > 0;
                return (
                  <span key={key} style={{ ...flag, background: done ? '#dcfce7' : '#f1f0ec', color: done ? '#166534' : '#a89e92' }}>
                    {done ? '✓' : '○'} {label}{key !== 'has_policy' && c[key] ? ` ${c[key]}` : ''}
                  </span>
                );
              })}
            </div>
            <AccessCodeControl client={c} onChanged={load} setErr={setErr} />
            <InsightsConsentControl client={c} onChanged={load} setErr={setErr} />
            {openId === c.id && <LoginsPanel client={c} onChanged={load} setErr={setErr} />}
          </div>
        ))}
      </div>

      {/* Pulse */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Pulse · daily check-ins</h2>
        <p style={{ color: '#6b6359', maxWidth: '64ch', marginBottom: 12, fontSize: 14 }}>
          One quick AI question a day to each client's team, answered in seconds, with a useful tip back.
        </p>
        <div style={{ border: '1px dashed #d8cfc4', borderRadius: 12, background: '#fff', padding: '20px 22px', color: '#8a8076' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' }}>In development</span>
          <p style={{ marginTop: 8, fontSize: 13.5 }}>Business Pulse (per-client questions + the branded answer page + responses) is the next admin build — the existing Pulse is newsroom/Airtable-specific, so this gets its own business version.</p>
        </div>
      </div>
    </div>
  );
}

function LoginsPanel({ client, onChanged, setErr }) {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const load = () => apiFetch(`/beaiready/admin/clients/${client.id}/users`).then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [client.id]);

  const add = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await apiFetch(`/beaiready/admin/clients/${client.id}/users`, { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', password: '' }); await load(); onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #eee5da', paddingTop: 12 }}>
      {!users && <p style={{ fontSize: 13, color: '#8a8076' }}>Loading logins…</p>}
      {users && users.map((u) => (
        <div key={u.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '4px 0', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{u.name}</span><span style={{ color: '#8a8076' }}>{u.email}</span>
          <span style={{ color: '#a89e92' }}>{u.last_login ? `last in ${new Date(u.last_login).toLocaleDateString()}` : 'never signed in'}</span>
        </div>
      ))}
      <form onSubmit={add} style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ ...inp, flex: '1 1 120px' }} />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...inp, flex: '1 1 160px' }} />
        <input required type="text" placeholder="Temp password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ ...inp, flex: '1 1 130px' }} />
        <button type="submit" disabled={busy} style={btn}>Add login</button>
      </form>
    </div>
  );
}

// Set / rotate / clear the company's self-registration access code. Team members
// enter it (with their own password) to register into this company.
function AccessCodeControl({ client, onChanged, setErr }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async (clear) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await apiFetch(`/beaiready/admin/clients/${client.id}/access-code`, { method: 'POST', body: JSON.stringify({ access_code: clear ? '' : code }) });
      setCode(''); setOpen(false); setMsg(clear ? 'Self-registration turned off.' : 'Access code set — share it with the team.'); onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid #f4efe8', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...flag, background: client.has_access_code ? '#dcfce7' : '#f1f0ec', color: client.has_access_code ? '#166534' : '#a89e92' }}>
          {client.has_access_code ? '✓ self-registration on' : '○ self-registration off'}
        </span>
        <button type="button" onClick={() => setOpen(!open)} style={btnGhost}>{open ? 'Close' : (client.has_access_code ? 'Change access code' : 'Set access code')}</button>
        {client.has_access_code && <button type="button" onClick={() => save(true)} disabled={busy} style={{ ...btnGhost, color: '#b91c1c' }}>Turn off</button>}
      </div>
      {open && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="New company access code" style={{ ...inp, flex: '1 1 220px' }} />
          <button type="button" onClick={() => save(false)} disabled={busy || !code.trim()} style={btn}>{busy ? 'Saving…' : 'Save code'}</button>
          <span style={{ fontSize: 12, color: '#8a8076' }}>Members enter this (with their own password) to register.</span>
        </div>
      )}
      {msg && <p style={{ fontSize: 12.5, color: '#166534', margin: '6px 0 0' }}>{msg}</p>}
    </div>
  );
}

// Per-company consent to contribute to the anonymised cross-business insight pool.
// Off by default. When on, this business's de-identified patterns can be aggregated
// with others (only ever where >=2 businesses contribute) — never its raw content.
function InsightsConsentControl({ client, onChanged, setErr }) {
  const [busy, setBusy] = useState(false);
  const on = !!client.shares_anonymised_insights;
  const toggle = async () => {
    setBusy(true); setErr('');
    try { await apiFetch(`/beaiready/admin/clients/${client.id}/insights-consent`, { method: 'POST', body: JSON.stringify({ consent: !on }) }); onChanged(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid #f4efe8', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ ...flag, background: on ? '#dcfce7' : '#f1f0ec', color: on ? '#166534' : '#a89e92' }}>
        {on ? '✓ contributes anonymised insights' : '○ not contributing insights'}
      </span>
      <button type="button" onClick={toggle} disabled={busy} style={btnGhost}>{busy ? '…' : (on ? 'Turn off' : 'Turn on')}</button>
      <span style={{ fontSize: 12, color: '#8a8076' }}>De-identified patterns only — never their raw content, and only pooled with ≥2 businesses.</span>
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 18, marginBottom: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', marginBottom: 10 };
const inp = { padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '7px 12px', background: 'transparent', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const flag = { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
