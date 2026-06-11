// Newsrooms — Phase 2d admin-managed onboarding. Create a newsroom, create its
// users, move users between newsrooms. Real data only; deleting a newsroom is
// deliberately not offered (deactivate instead — scoped data must not orphan).
import { useEffect, useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';

const OFFICE_ID = '00000000-0000-0000-0000-000000000001';

export default function NewsroomsAdmin() {
  const [newsrooms, setNewsrooms] = useState([]);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = () => apiFetch('/newsrooms').then(setNewsrooms).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const createNewsroom = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setError('');
    try {
      await apiFetch('/newsrooms', { method: 'POST', body: JSON.stringify({ name: newName }) });
      setNewName('');
      await load();
    } catch (err) { setError(err.message); }
    setCreating(false);
  };

  const toggleActive = async (n) => {
    setError('');
    try {
      await apiFetch(`/newsrooms/${n.id}`, { method: 'PUT', body: JSON.stringify({ is_active: !n.is_active }) });
      await load();
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Newsrooms</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: '64ch', marginBottom: 20 }}>
        Each newsroom is an isolated tenant: its own profile, workflows, runs and tool outputs.
        Develop AI creates newsrooms and their users here (no self-serve signup). Use the newsroom
        switcher in the sidebar to act inside one.
      </p>

      {error && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <form onSubmit={createNewsroom} style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New newsroom name…"
          style={{ flex: 1, minWidth: 220, padding: '9px 12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 14 }}
        />
        <button type="submit" disabled={creating || !newName.trim()} className="btn btn-primary"
                style={{ padding: '9px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: creating || !newName.trim() ? 0.6 : 1 }}>
          {creating ? 'Creating…' : 'Create newsroom'}
        </button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {newsrooms.map((n) => (
          <NewsroomCard key={n.id} n={n} open={openId === n.id}
                        onToggleOpen={() => setOpenId(openId === n.id ? null : n.id)}
                        onToggleActive={() => toggleActive(n)}
                        allNewsrooms={newsrooms} onChanged={load} setError={setError} />
        ))}
        {newsrooms.length === 0 && !error && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}
      </div>
    </div>
  );
}

function NewsroomCard({ n, open, onToggleOpen, onToggleActive, allNewsrooms, onChanged, setError }) {
  const isOffice = n.id === OFFICE_ID;
  return (
    <div className="card" style={{ padding: 18, opacity: n.is_active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {n.name}
            {isOffice && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: '#FEF3C7', color: '#92400E', padding: '2px 7px', borderRadius: 4 }}>Office</span>}
            {!n.is_active && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>(inactive)</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            /{n.slug} · {n.user_count} user{n.user_count === 1 ? '' : 's'} · {n.workflow_count} workflow{n.workflow_count === 1 ? '' : 's'}
          </div>
        </div>
        <button onClick={onToggleOpen} style={btnGhost}>{open ? 'Hide users' : 'Users'}</button>
        {!isOffice && (
          <button onClick={onToggleActive} style={btnGhost}>{n.is_active ? 'Deactivate' : 'Reactivate'}</button>
        )}
      </div>
      {open && <UsersPanel newsroom={n} allNewsrooms={allNewsrooms} onChanged={onChanged} setError={setError} />}
    </div>
  );
}

function UsersPanel({ newsroom, allNewsrooms, onChanged, setError }) {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' });
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch(`/newsrooms/${newsroom.id}/users`).then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [newsroom.id]);

  const addUser = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiFetch(`/newsrooms/${newsroom.id}/users`, { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', password: '', role: 'member' });
      await load(); onChanged();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const moveUser = async (userId, newsroomId) => {
    if (!newsroomId) return;
    setError('');
    try {
      await apiFetch(`/newsrooms/users/${userId}`, { method: 'PUT', body: JSON.stringify({ newsroom_id: newsroomId }) });
      await load(); onChanged();
    } catch (err) { setError(err.message); }
  };

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
      {!users && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading users…</p>}
      {users && users.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No users in this newsroom yet.</p>}
      {users && users.map((u) => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{u.name}</span>
          <span style={{ color: 'var(--text-secondary)' }}>{u.email}</span>
          <span style={{ fontSize: 11, background: u.role === 'admin' ? '#DBEAFE' : '#F1F5F9', color: u.role === 'admin' ? '#1D4ED8' : '#475569', padding: '1px 7px', borderRadius: 999, fontWeight: 600 }}>{u.role}</span>
          <select defaultValue="" onChange={(e) => moveUser(u.id, e.target.value)}
                  style={{ marginLeft: 'auto', padding: '3px 6px', fontSize: 12, border: '1px solid var(--border-color)', borderRadius: 'var(--radius)' }}>
            <option value="" disabled>Move to…</option>
            {allNewsrooms.filter((x) => x.id !== newsroom.id && x.is_active).map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>
      ))}

      <form onSubmit={addUser} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inp} />
        <input required type="password" placeholder="Password (min 6)" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inp} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inp}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={busy} style={{ ...btnGhost, background: 'var(--accent)', color: '#fff', border: 'none' }}>
          {busy ? 'Adding…' : 'Add user'}
        </button>
      </form>
    </div>
  );
}

const btnGhost = { padding: '7px 12px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text-primary)' };
const inp = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', flex: '1 1 140px' };
