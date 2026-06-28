// BusinessKnowHow — /dashboard/knowhow. A team member's OWN Tier-1 KnowHow: the
// knowledge that has accrued from their use (answers they found useful) plus workflows
// they author as ordered steps. Private to them — nothing here reaches the company's AI
// unless their Be AI Ready consultant promotes it (Gate 1). Scoped server-side to the
// caller's own person within their tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

export default function BusinessKnowHow() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState([{ step: '', detail: '' }]);
  const [busy, setBusy] = useState(false);

  const load = () => apiFetch('/beaiready/knowhow/mine').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const setStep = (i, k, v) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addStep = () => setSteps((s) => [...s, { step: '', detail: '' }]);
  const rmStep = (i) => setSteps((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s));

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const clean = steps.filter((s) => s.step.trim());
      if (!title.trim()) throw new Error('A title is required.');
      if (!clean.length) throw new Error('Add at least one step.');
      await apiFetch('/beaiready/knowhow/workflows', { method: 'POST', body: JSON.stringify({ title, steps: clean }) });
      setTitle(''); setSteps([{ step: '', detail: '' }]); load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const del = async (id) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/workflows/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · Knowledge</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>My AI knowledge &amp; workflows</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 14 }}>
        Your own knowledge base. Answers you mark useful in the team workspace gather here, and you can write up
        the procedures you know as step‑by‑step workflows. This is <b>private to you</b> — your Be AI Ready
        consultant decides what (if anything) becomes shared company knowledge.
      </p>
      <p style={{ marginBottom: 16 }}><Link to="/dashboard">← Back to dashboard</Link> · <Link to="/dashboard/coach">New‑staff coach →</Link></p>

      {err && <div style={banner}>{err}</div>}

      {/* ── Author a workflow ── */}
      <div style={{ ...card, marginBottom: 22 }}>
        <div style={kicker}>Add a workflow</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How we qualify a new tender"
          style={input} />
        <div style={{ display: 'grid', gap: 8, margin: '10px 0' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 700, color: '#c75b39', paddingTop: 9, minWidth: 18 }}>{i + 1}.</span>
              <div style={{ flex: 1, display: 'grid', gap: 4 }}>
                <input value={s.step} onChange={(e) => setStep(i, 'step', e.target.value)} placeholder="Step" style={input} />
                <input value={s.detail} onChange={(e) => setStep(i, 'detail', e.target.value)} placeholder="Detail (optional)" style={{ ...input, fontSize: 13 }} />
              </div>
              <button onClick={() => rmStep(i)} style={{ ...tag, color: '#b91c1c', marginTop: 4 }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addStep} style={tag}>＋ Step</button>
          <button onClick={save} disabled={busy} style={btn}>{busy ? 'Saving…' : 'Save workflow'}</button>
        </div>
      </div>

      {/* ── My workflows ── */}
      <div className="hub-section-label">My workflows</div>
      {data == null ? <p style={muted}>Loading…</p> : data.workflows.length === 0 ? (
        <p style={muted}>No workflows yet — add one above. <span style={{ color: '#c75b39' }}>—</span></p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
          {data.workflows.map((w) => (
            <div key={w.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <strong style={{ fontSize: 14 }}>{w.title}</strong>
                <button onClick={() => del(w.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
              </div>
              <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13.5, color: '#3a342e' }}>
                {(Array.isArray(w.steps) ? w.steps : []).map((s, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{s.step}{s.detail ? <span style={{ color: '#8a8076' }}> — {s.detail}</span> : null}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {/* ── Knowledge that has accrued from my use ── */}
      <div className="hub-section-label">From my use</div>
      {data == null ? <p style={muted}>Loading…</p> : data.knowledge.length === 0 ? (
        <p style={muted}>Nothing yet. Pin an answer you find useful in the <Link to="/dashboard/workspace">team workspace</Link> and it gathers here. <span style={{ color: '#c75b39' }}>—</span></p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.knowledge.map((k) => (
            <div key={k.id} style={card}>
              <span style={{ ...pill, ...originPill }}>{k.origin}</span>
              <p style={{ fontSize: 13.5, color: '#3a342e', margin: '6px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{k.text.slice(0, 600)}{k.text.length > 600 ? '…' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 };
const input = { width: '100%', padding: '8px 10px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const btn = { padding: '8px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tag = { fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999 };
const originPill = { background: '#eef2ff', color: '#3730a3' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', margin: '0 0 8px' };
const muted = { color: '#8a8076', fontSize: 13.5 };
