// NewsroomSwitcher — Phase 2d. Lets a platform ADMIN act inside any newsroom:
// the choice persists in localStorage, rides on every API call as the
// X-Newsroom-Id header (set in hooks/useApi.js), and the page reloads so every
// surface re-reads in the selected newsroom's context. Members never see this
// (and the server ignores the header for them anyway).

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch, getActiveNewsroomId, setActiveNewsroomId } from '../hooks/useApi.js';

export default function NewsroomSwitcher({ dark = false }) {
  const { user } = useAuth();
  const [newsrooms, setNewsrooms] = useState(null);
  const active = getActiveNewsroomId();

  useEffect(() => {
    if (user?.role !== 'admin') return;
    apiFetch('/newsrooms').then(setNewsrooms).catch(() => setNewsrooms([]));
  }, [user?.role]);

  if (user?.role !== 'admin' || !newsrooms || newsrooms.length < 2) return null;

  const onChange = (e) => {
    setActiveNewsroomId(e.target.value);
    window.location.reload();
  };

  const style = dark
    ? { width: '100%', padding: '8px 10px', background: 'var(--sidebar-hover)', color: 'var(--sidebar-text)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius)', fontSize: 13 }
    : { padding: '6px 10px', background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 };

  return (
    <select value={active} onChange={onChange} style={style} title="Act inside a newsroom (admin)">
      <option value="">My newsroom{user?.newsroom_name ? ` (${user.newsroom_name})` : ''}</option>
      {newsrooms.filter((n) => n.is_active).map((n) => (
        <option key={n.id} value={n.id}>{n.name}</option>
      ))}
    </select>
  );
}
