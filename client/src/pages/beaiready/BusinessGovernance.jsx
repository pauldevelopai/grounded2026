// BusinessGovernance — the authed Governance workspace for a BE AI READY client
// (/dashboard/governance). The AI-policy that "lives in your dashboard": build a
// draft from a short brief, review it, edit, and save — the business owns it.
// Plus quick links into the live legal/regulation tracker. Scoped to the tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function BusinessGovernance() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(undefined); // undefined=loading, null=none, obj=saved
  const [form, setForm] = useState({ businessName: '', sector: '', aiUses: '', existingPolicy: '' });
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    apiFetch('/beaiready/policy').then(setSaved).catch(() => setSaved(null));
  }, []);
  useEffect(() => {
    if (user?.newsroom_name && !form.businessName) setForm((f) => ({ ...f, businessName: user.newsroom_name }));
  }, [user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setBusy(true); setErr(''); setDraft(null);
    try {
      const d = await apiFetch('/beaiready/policy/generate', { method: 'POST', body: JSON.stringify(form) });
      setDraft(d);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const save = async (content, title) => {
    setBusy(true); setErr('');
    try {
      const s = await apiFetch('/beaiready/policy', { method: 'PUT', body: JSON.stringify({ title, content, brief: form }) });
      setSaved(s); setDraft(null); setEditing(false);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Governance · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Your AI policy & governance</h1>
      <p style={{ color: '#6b6359', maxWidth: '64ch', marginBottom: 20 }}>
        A written AI-use policy your business owns — built around the AI you actually use, aligned with POPIA.
        Backed by our daily legal &amp; regulation tracker.
      </p>
      <p style={{ marginBottom: 22 }}>
        <Link to="/dashboard">← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/tracker">AI lawsuits &amp; regulations</Link>, tracked daily
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* ── Saved policy ── */}
      {saved === undefined && <p style={{ color: '#8a8076' }}>Loading…</p>}
      {saved && !editing && !draft && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{saved.title}</h2>
            <span style={{ fontSize: 12, color: '#8a8076' }}>Updated {new Date(saved.updated_at).toLocaleDateString()}</span>
          </div>
          <pre style={preStyle}>{saved.content}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setEditing(true)} style={btn}>Edit</button>
            <button onClick={() => { setSaved(null); }} style={btnGhost}>Rebuild from scratch</button>
          </div>
        </section>
      )}

      {/* ── Edit saved ── */}
      {saved && editing && (
        <PolicyEditor initial={saved.content} title={saved.title} busy={busy}
          onCancel={() => setEditing(false)} onSave={(c, t) => save(c, t)} />
      )}

      {/* ── Build flow (no saved policy, or rebuilding) ── */}
      {saved === null && !draft && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <h2 style={{ marginTop: 0 }}>Build your AI policy</h2>
          <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
            <input style={inp} placeholder="Business name" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
            <input style={inp} placeholder="Sector (e.g. construction, retail, professional services)" value={form.sector} onChange={(e) => set('sector', e.target.value)} />
            <textarea style={{ ...inp, minHeight: 70 }} placeholder="How does your team use AI today? (drafting, customer comms, analysis…)" value={form.aiUses} onChange={(e) => set('aiUses', e.target.value)} />
            <textarea style={{ ...inp, minHeight: 70 }} placeholder="Optional: paste an existing policy to improve it instead" value={form.existingPolicy} onChange={(e) => set('existingPolicy', e.target.value)} />
            <div>
              <button onClick={generate} disabled={busy} style={btn}>{busy ? 'Drafting…' : 'Generate draft'}</button>
            </div>
          </div>
        </section>
      )}

      {/* ── Review a fresh draft ── */}
      {draft && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <h2 style={{ marginTop: 0 }}>{draft.title}</h2>
          {draft.summary && <p style={{ color: '#6b6359' }}>{draft.summary}</p>}
          {draft.checklist?.length > 0 && (
            <>
              <div className="hub-card-kicker">To put this in place</div>
              <ul className="hub-card-points">{draft.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          <PolicyEditor initial={draft.content} title={draft.title} busy={busy}
            onCancel={() => setDraft(null)} onSave={(c, t) => save(c, t)} saveLabel="Save as our policy" />
        </section>
      )}
    </div>
  );
}

function PolicyEditor({ initial, title, busy, onCancel, onSave, saveLabel = 'Save changes' }) {
  const [content, setContent] = useState(initial);
  const [t, setT] = useState(title);
  return (
    <div style={{ marginTop: 12 }}>
      <input style={{ ...inp, marginBottom: 8, fontWeight: 600 }} value={t} onChange={(e) => setT(e.target.value)} />
      <textarea style={{ ...inp, minHeight: 320, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} value={content} onChange={(e) => setContent(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onSave(content, t)} disabled={busy || !content.trim()} style={btn}>{busy ? 'Saving…' : saveLabel}</button>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const preStyle = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, color: '#2b2620', marginTop: 12 };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', background: 'transparent', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
