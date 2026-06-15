// BeAIReadyMyPrompts — /dashboard/my-prompts. The user's own saved prompt
// variants: their living cheat-sheet from the training. Inline-editable, copy,
// delete. Scoped server-side to the current user (/me/prompt-variants).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const MODELS = [['', '—'], ['claude', 'Claude'], ['gpt', 'ChatGPT'], ['gemini', 'Gemini'], ['copilot', 'Copilot'], ['meta', 'Meta AI']];

export default function BeAIReadyMyPrompts() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState({ title: '', body: '', preferred_model: '' });

  const load = () => apiFetch('/me/prompt-variants').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.body.trim()) return;
    setErr('');
    try { await apiFetch('/me/prompt-variants', { method: 'POST', body: JSON.stringify(draft) }); setDraft({ title: '', body: '', preferred_model: '' }); load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Productivity · my prompts</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>My prompts</h1>
      <p style={{ color: '#6b6359', marginBottom: 18, maxWidth: '64ch' }}>
        Your own saved and tweaked prompts — your cheat-sheet. Edit them freely; only you can see these.
        <Link to="/dashboard/prompts" style={{ marginLeft: 6 }}>Browse the library →</Link>
      </p>
      {err && <div style={banner}>{err}</div>}

      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        {rows == null ? <p style={muted}>Loading…</p> : rows.length === 0 ? (
          <p className="hub-band" style={{ margin: 0 }}>No saved prompts yet. Open a prompt in the library and hit “Save my version”, or add one below.</p>
        ) : rows.map((v) => <VariantCard key={v.id} v={v} onChanged={load} setErr={setErr} />)}
      </div>

      <form onSubmit={create} style={{ ...card, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Add your own</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" style={{ ...inp, flex: 1 }} />
          <select value={draft.preferred_model} onChange={(e) => setDraft({ ...draft, preferred_model: e.target.value })} style={inp}>{MODELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Your prompt…" style={{ ...inp, minHeight: 80 }} />
        <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Save prompt</button>
      </form>
    </div>
  );
}

function VariantCard({ v, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: v.title, body: v.body, notes: v.notes || '', preferred_model: v.preferred_model || '' });
  const [copied, setCopied] = useState(false);
  const save = async () => { setErr(''); try { await apiFetch(`/me/prompt-variants/${v.id}`, { method: 'PUT', body: JSON.stringify(f) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await apiFetch(`/me/prompt-variants/${v.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  const copy = () => { navigator.clipboard?.writeText(v.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{v.title}{v.preferred_model ? <span style={{ color: '#8a8076', fontWeight: 400, fontSize: 12 }}> · for {v.preferred_model}</span> : ''}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={copy} style={tag}>{copied ? '✓ Copied' : 'Copy'}</button>
          <button onClick={() => setEdit(!edit)} style={tag}>{edit ? 'Cancel' : 'Edit'}</button>
          <button onClick={del} style={{ ...tag, color: '#b91c1c' }}>Delete</button>
        </div>
      </div>
      {!edit ? (
        <pre style={pre}>{v.body}</pre>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
          <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ ...inp, minHeight: 100, fontFamily: 'ui-monospace, Menlo, monospace' }} />
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes (optional)" style={inp} />
          <button onClick={save} style={{ ...btn, justifySelf: 'start' }}>Save</button>
        </div>
      )}
      {!edit && v.notes && <p style={{ fontSize: 12.5, color: '#6b6359', margin: '6px 0 0' }}>{v.notes}</p>}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { padding: '8px 11px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '8px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tag = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pre = { whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace', background: '#faf8f5', border: '1px solid #f0ebe3', borderRadius: 8, padding: 10, margin: '8px 0 0', lineHeight: 1.5 };
const muted = { color: '#8a8076' };
