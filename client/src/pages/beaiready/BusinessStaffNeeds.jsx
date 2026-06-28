// BusinessStaffNeeds — /dashboard/staff-needs. Where the client's team stands on
// AI, read from their connected competency forms. Lives under Training (separate
// from the Strategy page, which holds the admin's strategy points). Real data only,
// honest empty state; scoped server-side to the caller's own tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

export default function BusinessStaffNeeds() {
  const [intake, setIntake] = useState(null);

  useEffect(() => {
    apiFetch('/beaiready/intake').then(setIntake).catch(() => setIntake([]));
  }, []);

  const totalResponses = (intake || []).reduce((a, f) => a + (f.response_count || 0), 0);

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · training</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>Staff AI Needs</h1>
      <p style={{ color: '#6b6359', marginBottom: 24, maxWidth: '64ch' }}>
        Where your team stands on AI, drawn from the competency forms they complete — so your training targets
        the real gaps. <Link to="/training">← Back to training</Link>
      </p>

      <section className="hub-band" style={{ marginBottom: 24 }}>
        {intake == null ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Loading…</p>
        ) : intake.length === 0 ? (
          <p style={{ margin: 0 }}>
            No competency forms connected yet. Once your team’s form responses are connected, a read on where
            they stand appears here — and feeds your training plan.
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{totalResponses} response{totalResponses === 1 ? '' : 's'} across {intake.length} form{intake.length === 1 ? '' : 's'}.</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {intake.map((f) => (
                <li key={f.form_name} style={{ fontSize: 13.5, marginBottom: 4 }}>
                  <strong>{f.form_name}</strong> — {f.response_count} response{f.response_count === 1 ? '' : 's'}
                  {f.last_synced_at && <span style={{ color: '#8a8076' }}> · synced {new Date(f.last_synced_at).toLocaleDateString()}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
