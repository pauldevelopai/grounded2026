// BeAIReadyAdminPrompts — the prompt library + curation. Top: the curated prompt
// library we downloaded/scraped (Wharton CC-BY adaptations, vendor + Develop AI
// prompts) — searchable, expandable, addable, removable. Below: the curation queue
// (user feedback → promote a strong suggested edit into the library, or dismiss).
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const TASK_TYPES = ['extract', 'summarise', 'draft', 'research', 'format', 'other'];
const STATUS_STYLE = { proven: ['#dcfce7', '#166534'], pending: ['#fef3c7', '#92400e'], draft: ['#f1f0ec', '#6b6359'] };

export default function BeAIReadyAdminPrompts() {
  const [prompts, setPrompts] = useState(null);
  const [queue, setQueue] = useState(null);
  const [q, setQ] = useState('');
  const [taskType, setTaskType] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', task_type: '', body: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadPrompts = () => {
    const p = new URLSearchParams();
    if (q) p.set('search', q);
    if (taskType) p.set('task_type', taskType);
    apiFetch(`/prompts?${p}`).then(setPrompts).catch((e) => setErr(e.message));
  };
  const loadQueue = () => apiFetch('/admin/feedback?status=new').then(setQueue).catch(() => setQueue([]));
  useEffect(() => { loadPrompts(); /* eslint-disable-next-line */ }, [q, taskType]);
  useEffect(() => { loadQueue(); }, []);

  const addPrompt = async (e) => {
    e.preventDefault(); if (!draft.title.trim() || !draft.body.trim()) { setErr('Title and body are required'); return; }
    setErr(''); setMsg('');
    try {
      await apiFetch('/prompts', { method: 'POST', body: JSON.stringify({ title: draft.title, description: draft.description || null, body: draft.body, task_type: draft.task_type || null, source: 'develop_ai' }) });
      setDraft({ title: '', description: '', task_type: '', body: '' }); setAdding(false); setMsg('Added to the library (draft).'); loadPrompts();
    } catch (e) { setErr(e.message); }
  };
  const removePrompt = async (id) => { setErr(''); try { await apiFetch(`/prompts/${id}`, { method: 'DELETE' }); loadPrompts(); } catch (e) { setErr(e.message); } };
  const act = async (id, action) => {
    setErr(''); setMsg('');
    try { const r = await apiFetch(`/admin/feedback/${id}/${action}`, { method: 'POST' }); setMsg(action === 'promote' ? `Promoted: “${r.promoted?.title || ''}”` : 'Dismissed.'); loadQueue(); loadPrompts(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Prompt library</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '66ch' }}>
        The curated prompts behind the client prompt library — what your clients see at their dashboard.
        Search, add or remove them here; user feedback to curate sits at the bottom.
      </p>
      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts…" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)} style={inp}>
          <option value="">All types</option>
          {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setAdding((a) => !a)} style={btn}>{adding ? 'Cancel' : '+ Add prompt'}</button>
      </div>

      {adding && (
        <form onSubmit={addPrompt} style={{ ...card, display: 'grid', gap: 8, marginBottom: 14 }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" style={inp} />
          <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short description" style={inp} />
          <select value={draft.task_type} onChange={(e) => setDraft({ ...draft, task_type: e.target.value })} style={inp}>
            <option value="">Task type (optional)</option>
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Prompt body (use {{placeholders}} for the bits the user fills in)" style={{ ...inp, minHeight: 100 }} />
          <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Add to library</button>
        </form>
      )}

      {prompts == null ? <p style={{ color: '#8a8076' }}>Loading…</p> : prompts.length === 0 ? (
        <p style={{ color: '#8a8076' }}>No prompts{q || taskType ? ' match your filters' : ' yet'}.</p>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#8a8076', marginBottom: 8 }}>{prompts.length} prompt{prompts.length === 1 ? '' : 's'}</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {prompts.map((p) => <PromptCard key={p.id} p={p} onRemove={removePrompt} />)}
          </div>
        </>
      )}

      {/* ── Curation queue (user feedback) ── */}
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '28px 0 6px' }}>Curation queue</h2>
      <p style={{ color: '#6b6359', marginBottom: 12, fontSize: 13, maxWidth: '66ch' }}>
        Feedback from users across all clients. Promote a strong suggested edit into the library (lands as <strong>pending</strong>), or dismiss.
      </p>
      {queue == null ? <p style={{ color: '#8a8076' }}>Loading…</p> : queue.length === 0 ? (
        <p style={{ color: '#8a8076' }}>Nothing in the queue — no new feedback.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {queue.map((f) => (
            <div key={f.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div><strong>{f.prompt_title}</strong>
                  <span style={{ fontSize: 12, color: '#8a8076', marginLeft: 8 }}>{f.user_name || 'a user'}{f.model_key ? ` · on ${f.model_key}` : ''}{f.rating ? ` · ${f.rating}★` : ''}</span></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => act(f.id, 'promote')} disabled={!f.suggested_edit} style={{ ...btn, opacity: f.suggested_edit ? 1 : 0.4 }}>Promote</button>
                  <button onClick={() => act(f.id, 'dismiss')} style={btnGhost}>Dismiss</button>
                </div>
              </div>
              {f.comment && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>“{f.comment}”</p>}
              {f.suggested_edit && <pre style={pre}>{f.suggested_edit}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptCard({ p, onRemove }) {
  const [open, setOpen] = useState(false);
  const [bg, fg] = STATUS_STYLE[p.validation_status] || STATUS_STYLE.draft;
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <strong>{p.title}</strong>
          <span style={{ ...pill, background: bg, color: fg, marginLeft: 6 }}>{p.validation_status || 'draft'}</span>
          {p.task_type && <span style={{ ...pill, background: '#eef2ff', color: '#3730a3', marginLeft: 6 }}>{p.task_type}</span>}
          {p.source && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359', marginLeft: 6 }}>{p.source}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setOpen((o) => !o)} style={tag}>{open ? 'Hide' : 'View'}</button>
          <button onClick={() => onRemove(p.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
        </div>
      </div>
      {p.description && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{p.description}</p>}
      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div><div style={lbl}>Prompt</div><pre style={pre}>{p.body}</pre></div>
          {p.example_input && <div><div style={lbl}>Example input</div><pre style={pre}>{p.example_input}</pre></div>}
          {p.example_output && <div><div style={lbl}>Example output</div><pre style={pre}>{p.example_output}</pre></div>}
          {p.attribution && <p style={{ fontSize: 11.5, color: '#8a8076', margin: 0 }}>{p.attribution}</p>}
        </div>
      )}
    </div>
  );
}

const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', background: '#faf8f5', color: '#6b6359', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tag = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 };
const pre = { whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace', background: '#faf8f5', border: '1px solid #f0ebe3', borderRadius: 8, padding: 10, margin: 0 };
