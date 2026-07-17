// ClientUserPanels — the per-client people controls: logins, the self-registration
// access code, and consent to the anonymised cross-business insight pool.
//
// These used to live inside the (now retired) /admin/users page. They're shared, so
// they live on their own: the Client cockpit renders them under its Users tab.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

// Parse a pasted team list. One person per line, in whatever shape the admin has to
// hand: "email", "Name <email>", "Name, email" or "Name<TAB>email". No name → we use
// the email's local part (the admin can correct it later).
const LINE_EMAIL = /[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/;
export function parsePeople(text) {
  const people = [], bad = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(LINE_EMAIL);
    if (!m) { bad.push(line); continue; }
    const email = m[0].toLowerCase();
    const name = line.replace(m[0], '').replace(/[<>,;\t]/g, ' ').trim() || email.split('@')[0];
    people.push({ name, email });
  }
  return { people, bad };
}

export function LoginsPanel({ client, onChanged, setErr }) {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [result, setResult] = useState(null);   // { created:[{name,email,password}], skipped:[{email,reason}] }
  const load = () => apiFetch(`/beaiready/admin/clients/${client.id}/users`).then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [client.id]);

  const add = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await apiFetch(`/beaiready/admin/clients/${client.id}/users`, { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', password: '' }); await load(); onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const { people, bad } = parsePeople(bulkText);
  const addMany = async () => {
    if (!people.length) return;
    setBusy(true); setErr(''); setResult(null);
    try {
      const r = await apiFetch(`/beaiready/admin/clients/${client.id}/users/bulk`, { method: 'POST', body: JSON.stringify({ users: people }) });
      setResult(r); setBulkText(''); await load(); onChanged();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const copyCreated = () => {
    const text = (result?.created || []).map((c) => `${c.name}\t${c.email}\t${c.password}`).join('\n');
    navigator.clipboard?.writeText(text);
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #eee5da', paddingTop: 12 }}>
      {!users && <p style={{ fontSize: 13, color: '#8a8076' }}>Loading logins…</p>}
      {users && users.length > 0 && <div style={{ fontSize: 11.5, color: '#a89e92', marginBottom: 4 }}>{users.length} {users.length === 1 ? 'login' : 'logins'}</div>}
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
        <button type="button" onClick={() => { setBulkOpen(!bulkOpen); setResult(null); }} style={btnGhost}>
          {bulkOpen ? 'Close' : '＋ Add several at once'}
        </button>
      </form>

      {/* Bulk add — paste the whole team, get a login each with a temp password. */}
      {bulkOpen && (
        <div style={{ marginTop: 10, background: '#fbf7f4', border: '1px solid #eaddd3', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#c75b39', marginBottom: 6 }}>Add several logins at once</div>
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6}
            placeholder={'One person per line, e.g.\nyvonnem@l2b.co.za\nChristian Khanyezi <christiank@l2b.co.za>\nChristie Peel, christiep@l2b.co.za'}
            style={{ ...inp, width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" onClick={addMany} disabled={busy || !people.length} style={btn}>
              {busy ? 'Adding…' : `Add ${people.length || ''} ${people.length === 1 ? 'login' : 'logins'}`.trim()}
            </button>
            <span style={{ fontSize: 12, color: '#8a8076' }}>
              {people.length ? `${people.length} to add — a temp password is generated for each.` : 'Paste emails above.'}
              {bad.length > 0 && <span style={{ color: '#b45309' }}> · {bad.length} line{bad.length === 1 ? '' : 's'} without an email will be ignored.</span>}
            </span>
          </div>
        </div>
      )}

      {/* Results — the temp passwords are shown ONCE. */}
      {result && (
        <div style={{ marginTop: 10, background: '#fff', border: '1px solid #eee5da', borderRadius: 10, padding: 12 }}>
          {result.created.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>
                  ✓ {result.created.length} login{result.created.length === 1 ? '' : 's'} created — copy these now, they aren’t shown again
                </div>
                <button type="button" onClick={copyCreated} style={btnGhost}>Copy all</button>
              </div>
              <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                {result.created.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '3px 0', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, minWidth: 120 }}>{c.name}</span>
                    <span style={{ color: '#8a8076', minWidth: 180 }}>{c.email}</span>
                    <code style={{ background: '#f7ece7', color: '#7a4636', padding: '1px 7px', borderRadius: 5 }}>{c.password}</code>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: '#8a8076', margin: '8px 0 0' }}>
                Share each password with that person directly, and ask them to change it after signing in.
              </p>
            </>
          )}
          {result.skipped.length > 0 && (
            <div style={{ marginTop: result.created.length ? 10 : 0, paddingTop: result.created.length ? 8 : 0, borderTop: result.created.length ? '1px solid #f0ebe3' : 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>{result.skipped.length} skipped</div>
              {result.skipped.map((s, i) => (
                <div key={i} style={{ fontSize: 12.5, color: '#6b6359' }}>{s.email} — {s.reason}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Set / rotate / clear the company's self-registration access code. Team members
// enter it (with their own password) to register into this company.
export function AccessCodeControl({ client, onChanged, setErr }) {
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
export function InsightsConsentControl({ client, onChanged, setErr }) {
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

// The pillar flags used by the cross-client roster on the admin Overview.
export const PILLAR_FLAGS = [
  ['has_policy', 'Policy'],
  ['visibility_checks', 'Visibility'],
  ['tools_logged', 'Security'],
  ['recommendations', 'Recs'],
  ['metrics', 'Metrics'],
];
export const pillarDone = (client, key) => (key === 'has_policy' ? !!client.has_policy : client[key] > 0);

const inp = { padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '7px 12px', background: 'transparent', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const flag = { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
