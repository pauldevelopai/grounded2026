import { useState, useEffect } from 'react';
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
  const [company, setCompany] = useState('');           // BAIR registration: the company (newsroom_id)
  const [accessCode, setAccessCode] = useState('');     // BAIR registration: that company's access code
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');       // forgot-password success message
  const [resetLink, setResetLink] = useState(''); // dev/test fallback when no real mailer

  // Load the list of companies open for self-registration (those an admin has given
  // an access code) when a BAIR visitor switches to register.
  useEffect(() => {
    if (IS_BEAIREADY && mode === 'register' && companies.length === 0) {
      fetch('/api/public/companies').then((r) => (r.ok ? r.json() : [])).then(setCompanies).catch(() => setCompanies([]));
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchMode() {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError('');
    setNotice('');
    setResetLink('');
  }

  // Toggle in/out of the forgot-password view (item 4).
  function goForgot(on) {
    setMode(on ? 'forgot' : 'login');
    setError('');
    setNotice('');
    setResetLink('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Forgot-password: request a reset link by email. Always shows the same
    // reassurance whether or not the address has an account (no enumeration).
    if (mode === 'forgot') {
      if (!email.trim()) { setError('Enter your email'); return; }
      setLoading(true);
      try {
        const res = await fetch('/api/auth/request-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not send a reset link');
        setNotice(data.message || 'If that email has an account, a reset link is on its way.');
        // Fallback while prod email isn't wired: the server returns the link so
        // the flow is testable. Surfaced here as a clickable link.
        if (data.reset_link) setResetLink(data.reset_link);
      } catch (err) {
        setError(err.message || 'Could not send a reset link');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) { setError('Name is required'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match'); return; }
      if (IS_BEAIREADY && (!company || !accessCode.trim())) { setError('Select your company and enter its access code'); return; }
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
          else navigate(next || '/');   // land on the main page (not the dashboard) on a cold sign-in
        } else if (next) {
          // safeNext already validated this is an in-app path. Use
          // window.location for /aikit/* (Express-served) so the page
          // reloads against the new session cookies.
          window.location.href = next;
        } else {
          navigate(user.role === 'admin' ? '/dashboard' : '/lawsuits');
        }
      } else {
        await register(name.trim(), email, password, IS_BEAIREADY ? { newsroom_id: company, access_code: accessCode.trim() } : {});
        if (IS_BEAIREADY) navigate(next || '/');
        else if (next) window.location.href = next;
        else navigate('/lawsuits');
      }
    } catch (err) {
      setError(err.message || (mode === 'login' ? 'Login failed' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={IS_BEAIREADY ? 'login-page beaiready' : 'login-page'}>
      <div className="login-card">
        <h1>{IS_BEAIREADY ? 'Be AI Ready' : 'Grounded'}</h1>
        <p className="brand-sub">{IS_BEAIREADY ? 'by Develop AI' : 'Newsroom-owned AI · by Develop AI'}</p>
        <p className="login-instruction">
          {mode === 'forgot'
            ? 'Reset your password'
            : IS_BEAIREADY
              ? (mode === 'login' ? (next ? 'Sign in to pick up where you left off' : 'Sign in to your dashboard') : 'Create your account')
              : (mode === 'login' ? 'Sign in to continue' : 'Create your account')}
        </p>

        {mode === 'forgot' && !notice && (
          <p style={{ fontSize: 13, color: '#6b6359', margin: '0 0 14px', lineHeight: 1.45 }}>
            Enter your email and we’ll send you a link to set a new password.
          </p>
        )}

        {notice && (
          <div style={{ fontSize: 13, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', margin: '0 0 14px', lineHeight: 1.45 }}>
            {notice}
            {resetLink && (
              <div style={{ marginTop: 8 }}>
                Email isn’t configured here yet, so use this link directly:{' '}
                <a href={resetLink} style={{ color: '#c75b39', fontWeight: 600, wordBreak: 'break-all' }}>Reset your password</a>
              </div>
            )}
          </div>
        )}

        {/* Course gate (item 3): access is for businesses who've been on a Develop
            AI course — the access code is handed out there. Make that plain up front. */}
        {IS_BEAIREADY && mode === 'register' && (
          <p style={{ fontSize: 13, color: '#8a6d3b', background: '#fdf6e3', border: '1px solid #f0e2c0', borderRadius: 8, padding: '10px 12px', margin: '0 0 14px', lineHeight: 1.45 }}>
            Be AI Ready is for businesses who’ve been on a <strong>Develop AI course</strong>. You’ll have
            been given your company’s access code there — enter it below to join. No code yet?{' '}
            <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready%20course" style={{ color: '#c75b39', fontWeight: 600 }}>Ask about a course</a>.
          </p>
        )}

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

          {mode !== 'forgot' && (
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
          )}

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

          {mode === 'register' && IS_BEAIREADY && (
            <>
              <div className="form-group">
                <label>Your company</label>
                <select value={company} onChange={e => setCompany(e.target.value)} required>
                  <option value="">Select your company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Company access code</label>
                <input
                  type="password"
                  value={accessCode}
                  onChange={e => setAccessCode(e.target.value)}
                  placeholder="The code from your Develop AI course"
                  required
                />
                <p style={{ fontSize: 12, color: '#8a8076', margin: '4px 0 0' }}>
                  Handed out on your Develop AI course — it confirms your company is enrolled. Your
                  admin can also share it with the rest of your team.
                </p>
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading
              ? (mode === 'login' ? 'Signing in...' : mode === 'forgot' ? 'Sending...' : 'Creating account...')
              : (mode === 'login' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : 'Create account')
            }
          </button>
        </form>

        {/* Forgot-password entry (login) + back-to-sign-in (forgot). item 4 */}
        {mode === 'login' && (
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <button type="button" onClick={() => goForgot(true)}
              style={{ background: 'none', border: 'none', color: '#8a8076', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
              Forgot your password?
            </button>
          </div>
        )}
        {mode === 'forgot' && (
          <div style={{ marginTop: '12px', textAlign: 'center', fontSize: 13, color: '#8a8076' }}>
            <button type="button" onClick={() => goForgot(false)}
              style={{ background: 'none', border: 'none', color: '#c75b39', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>
              ← Back to sign in
            </button>
          </div>
        )}

        {/* BE AI READY self-registration: join your company with its access code. */}
        {mode !== 'forgot' && (IS_BEAIREADY ? (
          <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: '#8a8076' }}>
            {mode === 'login' ? (
              <>New here?{' '}
                <button type="button" onClick={switchMode} style={{ background: 'none', border: 'none', color: '#c75b39', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>Create your account</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button type="button" onClick={switchMode} style={{ background: 'none', border: 'none', color: '#c75b39', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>Sign in</button>
              </>
            )}
            <div style={{ marginTop: 8 }}>Company not listed? <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready">Get in touch</a>.</div>
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
        ))}
      </div>
    </div>
  );
}
