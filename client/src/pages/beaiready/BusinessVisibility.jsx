// BusinessVisibility — the authed Visibility workspace (/dashboard/visibility).
// "How AI sees your business": run a scan, see what the AI actually said about
// you for each probe question, with an honest assessment (present? sentiment?
// accurate?). v1 queries Claude — labelled as such until ChatGPT/Gemini keys
// are added. Scoped to the tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bizHome } from './bizNav.js';
import { apiFetch } from '../../hooks/useApi.js';

const SENTIMENT = {
  positive: { bg: '#dcfce7', fg: '#166534' }, neutral: { bg: '#e2e8f0', fg: '#475569' },
  negative: { bg: '#fee2e2', fg: '#991b1b' }, absent: { bg: '#fef3c7', fg: '#92400e' }, unknown: { bg: '#e2e8f0', fg: '#475569' },
};
const ACCURACY = { accurate: 'Accurate', partly_accurate: 'Partly accurate', inaccurate: 'Inaccurate', unknown: '—' };

export default function BusinessVisibility() {
  const [scan, setScan] = useState(undefined); // undefined=loading
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/beaiready/visibility').then((d) => setScan(d.checks?.length ? d : null)).catch(() => setScan(null));
  }, []);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const d = await apiFetch('/beaiready/visibility/scan', { method: 'POST', timeout: 180000 });
      setScan(d);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Visibility · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>How AI sees your business</h1>
      <p style={{ color: '#6b6359', maxWidth: '64ch', marginBottom: 16 }}>
        We ask an AI assistant the questions your customers ask, then assess how your business shows up —
        whether you're named, how you're described, and what's wrong or missing.
        <span style={{ display: 'block', marginTop: 6, fontSize: 12.5, color: '#8a8076' }}>
          v1 queries <b>Claude</b>. ChatGPT and Gemini are added once their API keys are configured.
        </span>
      </p>
      <p style={{ marginBottom: 20 }}><Link to={bizHome()}>← Back to dashboard</Link></p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={run} disabled={busy} style={btn}>{busy ? 'Scanning… (~30s)' : scan ? 'Run a new scan' : 'Run your first scan'}</button>
        {scan && scan.ran_at && <span style={{ fontSize: 12.5, color: '#8a8076' }}>Last scan: {new Date(scan.ran_at).toLocaleString()} · {scan.model}</span>}
      </div>

      {scan === undefined && <p style={{ color: '#8a8076' }}>Loading…</p>}
      {scan === null && !busy && <p style={{ color: '#8a8076' }}>No scan yet — run one to see how AI describes your business.</p>}

      {scan && scan.checks?.length > 0 && (
        <section style={{ display: 'grid', gap: 14 }}>
          {scan.checks.map((c) => {
            const a = c.assessment || {};
            const s = SENTIMENT[a.sentiment] || SENTIMENT.unknown;
            return (
              <div key={c.id} className="hub-card">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ ...badge, background: a.present ? '#dcfce7' : '#fef3c7', color: a.present ? '#166534' : '#92400e' }}>
                    {a.present ? 'Named' : 'Not named'}
                  </span>
                  <span style={{ ...badge, background: s.bg, color: s.fg }}>{a.sentiment || 'unknown'}</span>
                  <span style={{ ...badge, background: '#e2e8f0', color: '#475569' }}>{ACCURACY[a.accuracy] || '—'}</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#8a8076', margin: '0 0 4px' }}>Asked: <em>{c.question}</em></p>
                {a.summary && <p style={{ fontSize: 13.5, color: '#2b2620', margin: '0 0 8px', fontWeight: 600 }}>{a.summary}</p>}
                {a.missing && <p style={{ fontSize: 12.5, color: '#9a3412', margin: '0 0 8px' }}>Gap: {a.missing}</p>}
                <details>
                  <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#c75b39', fontWeight: 600 }}>What the AI actually said</summary>
                  <pre style={pre}>{c.response}</pre>
                </details>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const badge = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999 };
const pre = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, color: '#4a443d', marginTop: 8, background: '#faf6f1', padding: 12, borderRadius: 8 };
