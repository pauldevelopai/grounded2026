// Active-newsroom selection (Phase 2d). Admins can act inside any newsroom;
// the choice persists in localStorage and rides on every API call as the
// X-Newsroom-Id header (the server ignores it for non-admins). Empty = the
// user's own newsroom.
const NEWSROOM_KEY = 'grounded.newsroomId';

export function getActiveNewsroomId() {
  try { return localStorage.getItem(NEWSROOM_KEY) || ''; } catch { return ''; }
}

export function setActiveNewsroomId(id) {
  try {
    if (id) localStorage.setItem(NEWSROOM_KEY, id);
    else localStorage.removeItem(NEWSROOM_KEY);
  } catch { /* private mode */ }
}

export async function apiFetch(path, options = {}) {
  const timeout = options.timeout || 120000; // 2 min default, override with options.timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const newsroomId = getActiveNewsroomId();
  if (newsroomId && !headers['X-Newsroom-Id']) headers['X-Newsroom-Id'] = newsroomId;

  try {
    var res = await fetch(`/api${path}`, {
      credentials: 'include',
      signal: controller.signal,
      ...options,
      headers,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out — try again');
    throw err;
  }
  clearTimeout(timer);

  if (res.status === 401) {
    // Don't redirect if we're already on login or doing the initial auth check
    if (!window.location.pathname.startsWith('/login') && !path.includes('/auth/me')) {
      window.location.href = '/login';
    }
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Request failed');
  }

  return res.json();
}

export function buildUrl(path, sectorId) {
  if (!sectorId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}sector_id=${sectorId}`;
}
