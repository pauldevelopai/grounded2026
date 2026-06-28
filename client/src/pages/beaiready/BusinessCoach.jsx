// BusinessCoach — /dashboard/coach. The new-staff coach: a hire asks anything and gets
// an answer grounded ONLY in the company's shared (company-tier) knowledge — promoted
// know-how, company documents, and company workflows it can walk through step by step.
// It never sees anyone's private Tier-1 notes, and says so honestly when the company
// hasn't captured something yet. Server-scoped to the caller's own company.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

export default function BusinessCoach() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);

  const ask = async () => {
    if (!q.trim()) return;
    setErr(''); setBusy(true); setRes(null);
    try {
      const r = await apiFetch('/beaiready/knowhow/coach', { method: 'POST', body: JSON.stringify({ question: q.trim() }) });
      setRes(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · Knowledge</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>New‑staff coach</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 14 }}>
        New here? Ask how things are done. The coach answers from your company's <b>shared</b> knowledge — the
        know‑how and workflows the business has chosen to make part of how it works — and will walk you through a
        procedure step by step. If something hasn't been captured yet, it'll tell you to ask your manager rather
        than guess.
      </p>
      <p style={{ marginBottom: 16 }}><Link to="/dashboard">← Back to dashboard</Link> · <Link to="/dashboard/knowhow">My knowledge &amp; workflows →</Link></p>

      {err && <div style={banner}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask(); }}
          placeholder="e.g. How do we qualify a new tender?"
          style={{ flex: 1, padding: '10px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, resize: 'vertical' }} />
        <button onClick={ask} disabled={busy} style={btn}>{busy ? 'Thinking…' : 'Ask'}</button>
      </div>

      {res && (
        <div style={{ ...card, background: '#fbf7f4', borderColor: '#eaddd3' }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#2a2520', margin: 0, whiteSpace: 'pre-wrap' }}>{res.answer}</p>
          {res.sources && res.sources.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid #eee5da', paddingTop: 10 }}>
              <div style={kicker}>Grounded in</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {res.sources.map((s, i) => (
                  <span key={i} style={{ ...pill, ...srcPill }}>{s.type === 'workflow' ? 'workflow' : s.type === 'company_knowledge' ? 'document' : 'know‑how'}: {s.title}</span>
                ))}
              </div>
            </div>
          )}
          {!res.grounded && (
            <p style={{ fontSize: 12.5, color: '#8a8076', marginTop: 10 }}>No company knowledge captured on this yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 };
const btn = { padding: '10px 20px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' };
const pill = { fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999 };
const srcPill = { background: '#ecfdf5', color: '#065f46' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', margin: '0 0 6px' };
