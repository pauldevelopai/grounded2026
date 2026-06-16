// BeAIReadyToolboxSuggest — /toolbox/suggest. A rebuild of AIKit's "suggest a
// tool": a signed-in user proposes an AI tool for the toolbox; it lands in the
// admin review queue (/admin/tools → Suggestions). Honest about sign-in.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

const ACCENT = '#c75b39';
const INP = { padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, background: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

export default function BeAIReadyToolboxSuggest() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', url: '', description: '', why_valuable: '' });
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = () => { if (user) apiFetch('/toolkit/suggestions/mine').then(setMine).catch(() => setMine([])); };
  useEffect(() => { load(); }, [user]);

  const submit = async () => {
    if (!form.name.trim()) { setErr('A tool name is required.'); return; }
    setBusy(true); setErr(null);
    try { await apiFetch('/toolkit/suggestions', { method: 'POST', body: JSON.stringify(form) }); setDone(true); setForm({ name: '', url: '', description: '', why_valuable: '' }); load(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The AI toolbox · suggest a tool</div>
        <h1>Know a tool we should add?</h1>
        <p className="hub-lede">
          If there's an AI tool you rely on that isn't in the toolbox, tell us. We'll review it, score it for
          cost, difficulty and data exposure, and add it if it fits. <Link to="/toolbox">← Back to the toolbox</Link>
        </p>
      </section>

      {!user ? (
        <div className="hub-band"><a href="/login" style={{ color: ACCENT, fontWeight: 600 }}>Sign in</a> to suggest a tool — that way we can follow up with you.</div>
      ) : (
        <>
          {done && <div style={{ background: '#ecfdf3', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>Thanks — your suggestion is in the review queue.</div>}
          {err && <div style={{ background: '#fdecec', border: '1px solid #f5c6c6', color: '#991B1B', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>{err}</div>}
          <div style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: '#6b6359' }}>Tool name *</label><input style={INP} value={form.name} onChange={set('name')} placeholder="e.g. Otter.ai" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: '#6b6359' }}>Website</label><input style={INP} value={form.url} onChange={set('url')} placeholder="https://…" /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: '#6b6359' }}>What does it do?</label><textarea style={{ ...INP, minHeight: 64, resize: 'vertical' }} value={form.description} onChange={set('description')} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: '#6b6359' }}>Why is it valuable for a business?</label><textarea style={{ ...INP, minHeight: 64, resize: 'vertical' }} value={form.why_valuable} onChange={set('why_valuable')} /></div>
            <div><button onClick={submit} disabled={busy || !form.name.trim()} className="hub-btn hub-btn-solid" style={{ opacity: !form.name.trim() ? 0.5 : 1 }}>{busy ? 'Sending…' : 'Suggest this tool'}</button></div>
          </div>

          {mine.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div className="hub-section-label">Your suggestions</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {mine.map((s) => (
                  <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, background: '#fff', border: '1px solid #f1ece5', borderRadius: 8, padding: '8px 12px' }}>
                    <span><strong>{s.name}</strong>{s.created_tool_slug && <Link to={`/toolbox/${s.created_tool_slug}`} style={{ color: ACCENT, marginLeft: 8 }}>view in toolbox →</Link>}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: s.status === 'approved' ? '#166534' : s.status === 'rejected' ? '#b91c1c' : '#b45309' }}>{s.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
