import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { IS_BEAIREADY } from '../beaiready/brand.js';

// Set-a-new-password page for the emailed reset link (item 4). The raw token
// rides in ?token=…; we post it with the new password to /api/auth/reset, which
// verifies the hash + expiry and updates the password. Shares the login-card
// look and is host-aware (Be AI Ready / Grounded).
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not reset your password');
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not reset your password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={IS_BEAIREADY ? 'login-page beaiready' : 'login-page'}>
      <div className="login-card">
        <h1>{IS_BEAIREADY ? 'Be AI Ready' : 'Grounded'}</h1>
        <p className="brand-sub">{IS_BEAIREADY ? 'by Develop AI' : 'Newsroom-owned AI · by Develop AI'}</p>
        <p className="login-instruction">Choose a new password</p>

        {!token ? (
          <div className="login-error">
            This reset link is missing its token. Request a new one from the{' '}
            <Link to="/login">sign-in page</Link>.
          </div>
        ) : done ? (
          <div style={{ fontSize: 14, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', lineHeight: 1.5 }}>
            Your password has been reset.{' '}
            <button type="button" onClick={() => navigate('/login')}
              style={{ background: 'none', border: 'none', color: '#c75b39', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0, textDecoration: 'underline' }}>
              Sign in
            </button>.
          </div>
        ) : (
          <>
            {error && <div className="login-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>New password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoFocus />
              </div>
              <div className="form-group">
                <label>Confirm new password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
                {loading ? 'Saving...' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
