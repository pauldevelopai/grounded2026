import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Where to send the user after a successful sign-in. Honours ?next=<path>
// (used by AIKit pages so logins there return to where the user was) but
// only allows in-app paths, never external URLs.
function safeNext(raw) {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

// The BE AI READY door shares this page but wears its own brand, hides
// self-registration (clients are onboarded by Develop AI), and sends admins
// across to the main-host admin console after sign-in.
const IS_BEAIREADY = typeof window !== 'undefined' &&
  (window.location.hostname.startsWith('beaiready') ||
   (import.meta.env.DEV && window.sessionStorage.getItem('beaiready') === '1'));

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode() {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!name.trim()) { setError('Name is required'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    }

    setLoading(true);
    try {
      // On the BE AI READY door: business clients land on their dashboard;
      // Develop AI admins are carried to the admin console on the main host.
      if (mode === 'login') {
        const user = await login(email, password);
        if (IS_BEAIREADY) {
          // Admins → the BE AI READY admin portal (its own, not Grounded's).
          // Client businesses → back to where they were headed (the feature they
          // clicked), or their dashboard if they came in cold.
          if (user.role === 'admin') navigate('/admin');
          else navigate(next || '/dashboard');
        } else if (next) {
          // safeNext already validated this is an in-app path. Use
          // window.location for /aikit/* (Express-served) so the page
          // reloads against the new session cookies.
          window.location.href = next;
        } else {
          navigate(user.role === 'admin' ? '/dashboard' : '/lawsuits');
        }
      } else {
        await register(name.trim(), email, password);
        if (next) window.location.href = next;
        else navigate('/lawsuits');
      }
    } catch (err) {
      setError(err.message || (mode === 'login' ? 'Login failed' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>{IS_BEAIREADY ? 'Be AI Ready' : 'Grounded'}</h1>
        <p className="brand-sub">{IS_BEAIREADY ? 'by Develop AI' : 'Newsroom-owned AI · by Develop AI'}</p>
        <p className="login-instruction">
          {IS_BEAIREADY
            ? (mode === 'login' ? (next ? 'Sign in to pick up where you left off' : 'Sign in to your dashboard') : 'Create your account')
            : (mode === 'login' ? 'Sign in to continue' : 'Create your account')}
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                autoFocus
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus={mode === 'login'}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 6 : undefined}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading
              ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
              : (mode === 'login' ? 'Sign in' : 'Create account')
            }
          </button>
        </form>

        {/* BE AI READY is invite-only — no self-registration. The same form
            signs in Develop AI staff, who are routed to the admin console. */}
        {IS_BEAIREADY ? (
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#8a8076' }}>
            Clients and Develop&nbsp;AI staff sign in here.<br />
            New client? <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready">Talk to Paul</a> to get set up.
          </div>
        ) : (
        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: '#666' }}>
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={switchMode}
                style={{
                  background: 'none', border: 'none', color: 'var(--primary)',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                  padding: 0, textDecoration: 'underline',
                }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={switchMode}
                style={{
                  background: 'none', border: 'none', color: 'var(--primary)',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                  padding: 0, textDecoration: 'underline',
                }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
