// BeAIReadyPrompts — the living, model-aware prompt library (Productivity).
// Two modes: 'library' (model selector + filters + cards) and 'detail' (full body
// with copy, before/after example, per-model validation table, attribution, and a
// rate / suggest-an-edit control + "Save my version"). Mirrors BeAIReadyToolbox.
// Model choice persists per browser. "Proven" only ever shows if validation set it.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const ACCENT = '#c75b39';
const MODELS = [
  { key: 'claude', label: 'Claude' }, { key: 'gpt', label: 'ChatGPT' }, { key: 'gemini', label: 'Gemini' },
  { key: 'copilot', label: 'Copilot' }, { key: 'meta', label: 'Meta AI' },
];
const TASK_TYPES = ['extract', 'summarise', 'draft', 'research', 'format', 'other'];
const ROLES = ['researcher', 'boq_processor', 'admin', 'finance', 'it', 'general'];
const SOURCE_LABEL = { wharton: 'Wharton', vendor: 'Vendor', develop_ai: 'Develop AI', user_promoted: 'Community' };
const PROV = {
  proven: { label: 'Proven', bg: '#dcfce7', fg: '#166534' },
  pending: { label: 'Pending', bg: '#fef3c7', fg: '#92400e' },
  draft: { label: 'Draft', bg: '#f1f0ec', fg: '#6b6359' },
};
const MODEL_LABEL = Object.fromEntries(MODELS.map((m) => [m.key, m.label]));
const STORED_MODEL = () => (typeof localStorage !== 'undefined' && localStorage.getItem('beaiready_prompt_model')) || 'claude';

function ProvenanceBadge({ status, source }) {
  const p = PROV[status] || PROV.draft;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, background: p.bg, color: p.fg }}>{p.label}</span>
      {source && <span style={{ fontSize: 10.5, color: '#8a8076' }}>{SOURCE_LABEL[source] || source}</span>}
    </span>
  );
}

function ModelRating({ status, rating }) {
  if (!status || status === 'untested') return <span style={{ fontSize: 12, color: '#a89e92' }}>untested</span>;
  if (status === 'failed') return <span style={{ fontSize: 12, color: '#c2410c' }}>failed</span>;
  return <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ validated{rating != null ? ` · ${Math.round(Number(rating))}/100` : ''}</span>;
}

// ── Library ──────────────────────────────────────────────────────────────────
export default function BeAIReadyPrompts({ mode = 'library' }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [model, setModel] = useState(STORED_MODEL());
  const [items, setItems] = useState(null);
  const [role, setRole] = useState('');
  const [taskType, setTaskType] = useState('');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', task_type: 'other' });
  const [addBusy, setAddBusy] = useState(false);

  const setAndStoreModel = (m) => { setModel(m); try { localStorage.setItem('beaiready_prompt_model', m); } catch { /* ignore */ } };

  const submitCompany = async (e) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.body.trim()) return;
    setAddBusy(true); setErr('');
    try {
      const p = await apiFetch('/prompts/company', { method: 'POST', body: JSON.stringify(draft) });
      setDraft({ title: '', body: '', task_type: 'other' }); setAdding(false);
      navigate(`/dashboard/prompts/${p.id}`);
    } catch (e) { setErr(e.message); }
    setAddBusy(false);
  };

  const load = useCallback(() => {
    const p = new URLSearchParams({ model });
    if (role) p.set('role', role);
    if (taskType) p.set('task_type', taskType);
    if (search) p.set('search', search);
    apiFetch(`/prompts?${p}`).then(setItems).catch((e) => { setErr(e.message); setItems([]); });
  }, [model, role, taskType, search]);
  useEffect(() => { if (mode === 'library') { setItems(null); load(); } }, [mode, load]);

  if (mode === 'detail') return <PromptDetail id={id} model={model} setModel={setAndStoreModel} onBack={() => navigate('/dashboard/prompts')} />;

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Productivity · prompt library</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>Prompt library</h1>
      <p style={{ color: '#6b6359', marginBottom: 18, maxWidth: '66ch' }}>
        Proven prompts, by the model you use. Pick your model to see which prompts are validated for it and how
        well they score. Add your company’s own — any teammate can edit them.
        {' '}<Link to="/dashboard/my-prompts">My prompts →</Link>
      </p>
      {err && <div style={banner}>{err}</div>}

      <div style={{ marginBottom: 16 }}>
        {!adding ? (
          <button onClick={() => setAdding(true)} style={btn}>＋ Add a company prompt</button>
        ) : (
          <form onSubmit={submitCompany} style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>New company prompt — shared with your team; any member can edit it</div>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. Tender summary)" style={inp} required />
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="The prompt…" style={{ ...inp, minHeight: 90, fontFamily: 'ui-monospace, Menlo, monospace' }} required />
            <select value={draft.task_type} onChange={(e) => setDraft({ ...draft, task_type: e.target.value })} style={{ ...inp, maxWidth: 180 }}>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={addBusy} style={btn}>{addBusy ? 'Adding…' : 'Add prompt'}</button>
              <button type="button" onClick={() => setAdding(false)} style={btnGhost}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <Labelled label="Your model">
          <select value={model} onChange={(e) => setAndStoreModel(e.target.value)} style={{ ...inp, fontWeight: 700, color: ACCENT }}>
            {MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </Labelled>
        <Labelled label="Role"><select value={role} onChange={(e) => setRole(e.target.value)} style={inp}><option value="">Any role</option>{ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></Labelled>
        <Labelled label="Task"><select value={taskType} onChange={(e) => setTaskType(e.target.value)} style={inp}><option value="">Any task</option>{TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Labelled>
        <Labelled label="Search"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prompts…" style={{ ...inp, minWidth: 200 }} /></Labelled>
      </div>

      {items == null ? <p style={muted}>Loading…</p> : items.length === 0 ? (
        <p className="hub-band" style={{ margin: 0 }}>
          No prompts for <strong>{MODEL_LABEL[model]}</strong>{role ? ` in “${role.replace('_', ' ')}”` : ''} yet — try the “General” role or another model.
        </p>
      ) : (
        <section className="hub-grid">
          {items.map((p) => (
            <Link key={p.id} to={`/dashboard/prompts/${p.id}`} className="hub-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <strong style={{ fontSize: 15.5 }}>{p.title}</strong>
                <ProvenanceBadge status={p.validation_status} source={p.source} />
              </div>
              {p.description && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 8px' }}>{p.description}</p>}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {p.newsroom_id && <span style={{ ...taskTag, background: '#eef2ff', color: '#3730a3' }}>{p.source === 'client' ? 'Company · editable' : 'Shared with you'}</span>}
                <span style={taskTag}>{p.task_type}</span>
                {(p.roles || []).map((r) => <span key={r} style={roleTag}>{r.replace('_', ' ')}</span>)}
              </div>
              <div style={{ fontSize: 12, color: '#8a8076' }}>On {MODEL_LABEL[model]}: <ModelRating status={p.model_status} rating={p.model_rating} /></div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────
function PromptDetail({ id, model, setModel, onBack }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [fb, setFb] = useState({ rating: 0, comment: '', suggested_edit: '' });
  const [fbMsg, setFbMsg] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState({ title: '', body: '', description: '' });

  const loadPrompt = () => apiFetch(`/prompts/${id}`).then(setP).catch((e) => setErr(e.message));
  useEffect(() => { loadPrompt(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = () => { setEf({ title: p.title, body: p.body, description: p.description || '' }); setEditing(true); };
  const saveEdit = async () => {
    setErr('');
    try { await apiFetch(`/prompts/company/${id}`, { method: 'PUT', body: JSON.stringify(ef) }); setEditing(false); await loadPrompt(); }
    catch (e) { setErr(e.message); }
  };

  const copy = () => { navigator.clipboard?.writeText(p.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  const sendFeedback = async () => {
    setFbMsg('');
    try {
      await apiFetch(`/prompts/${id}/feedback`, { method: 'POST', body: JSON.stringify({ model_key: model, rating: fb.rating || null, comment: fb.comment || null, suggested_edit: fb.suggested_edit || null }) });
      setFb({ rating: 0, comment: '', suggested_edit: '' }); setFbMsg('Thanks — sent to the curation queue.');
    } catch (e) { setErr(e.message); }
  };
  const saveMine = async () => {
    setSavedMsg('');
    try {
      await apiFetch('/me/prompt-variants', { method: 'POST', body: JSON.stringify({ source_prompt_id: id, title: `${p.title} (my version)`, body: p.body, preferred_model: model }) });
      setSavedMsg('Saved to My prompts.');
    } catch (e) { setErr(e.message); }
  };

  if (err && !p) return <div className="hub hub-beaiready"><div style={banner}>{err}</div></div>;
  if (!p) return <div className="hub hub-beaiready"><p style={muted}>Loading…</p></div>;

  return (
    <div className="hub hub-beaiready">
      <a href="/dashboard/prompts" onClick={(e) => { e.preventDefault(); onBack(); }} style={{ color: '#8a8076', fontSize: 13, textDecoration: 'none' }}>← All prompts</a>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', margin: '8px 0 4px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{p.title}</h1>
        <ProvenanceBadge status={p.validation_status} source={p.source} />
      </div>
      {p.description && <p style={{ color: '#5b5249', marginTop: 4 }}>{p.description}</p>}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <span style={taskTag}>{p.task_type}</span>
        {(p.roles || []).map((r) => <span key={r} style={roleTag}>{r.replace('_', ' ')}</span>)}
      </div>
      {err && <div style={banner}>{err}</div>}

      {/* Body + copy + (company prompts) shared wiki edit */}
      <div style={{ ...card, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <span style={sectionLbl}>The prompt</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {p.newsroom_id && !editing && <button onClick={startEdit} style={btnGhost}>Edit</button>}
            <button onClick={copy} style={btn}>{copied ? '✓ Copied' : 'Copy'}</button>
            <button onClick={saveMine} style={btnGhost}>Save my version</button>
          </div>
        </div>
        {editing ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <input value={ef.title} onChange={(e) => setEf({ ...ef, title: e.target.value })} placeholder="Title" style={inp} />
            <textarea value={ef.body} onChange={(e) => setEf({ ...ef, body: e.target.value })} style={{ ...inp, minHeight: 140, fontFamily: 'ui-monospace, Menlo, monospace' }} />
            <input value={ef.description} onChange={(e) => setEf({ ...ef, description: e.target.value })} placeholder="Short description (optional)" style={inp} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveEdit} style={btn}>Save changes</button>
              <button onClick={() => setEditing(false)} style={btnGhost}>Cancel</button>
            </div>
            <p style={{ fontSize: 11.5, color: '#8a8076', margin: 0 }}>Shared — your teammates see this version too.</p>
          </div>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, fontFamily: 'ui-monospace, Menlo, monospace', background: '#faf8f5', border: '1px solid #f0ebe3', borderRadius: 8, padding: 12, margin: 0, lineHeight: 1.55 }}>{p.body}</pre>
        )}
        {!editing && p.updated_by_name && <p style={{ fontSize: 11.5, color: '#a89e92', margin: '8px 0 0' }}>Last edited by {p.updated_by_name}</p>}
        {savedMsg && <p style={{ color: '#166534', fontSize: 13, margin: '8px 0 0' }}>{savedMsg} <Link to="/dashboard/my-prompts">Open →</Link></p>}
      </div>

      {/* Before / after example */}
      {(p.example_input || p.example_output) && (
        <div style={{ ...card, marginTop: 14 }}>
          <span style={sectionLbl}>Example</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 12, marginTop: 8 }}>
            {p.example_input && <div><div style={miniLbl}>Example input</div><div style={exampleBox}>{p.example_input}</div></div>}
            {p.example_output && <div><div style={miniLbl}>Example output</div><div style={exampleBox}>{p.example_output}</div></div>}
          </div>
        </div>
      )}

      {/* Per-model validation table */}
      <div style={{ ...card, marginTop: 14 }}>
        <span style={sectionLbl}>How it performs, by model</span>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
          <thead><tr style={{ textAlign: 'left', color: '#8a8076', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <th style={th}>Model</th><th style={th}>Status</th><th style={th}>Score</th><th style={th}>Validated</th></tr></thead>
          <tbody>
            {MODELS.map((m) => {
              const v = (p.validations || []).find((x) => x.model_key === m.key);
              return (
                <tr key={m.key} style={{ borderTop: '1px solid #eee5da', background: m.key === model ? '#faf6f3' : 'transparent' }}>
                  <td style={td}>{m.label}{m.key === model ? ' ·' : ''}</td>
                  <td style={td}><ModelRating status={v?.status} rating={v?.rating} /></td>
                  <td style={td}>{v?.rating != null ? `${Math.round(Number(v.rating))}/100${v.band ? ` (${v.band})` : ''}` : '—'}</td>
                  <td style={{ ...td, color: '#8a8076' }}>{v?.validated_at ? new Date(v.validated_at).toLocaleDateString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {p.validation_status !== 'proven' && <p style={{ fontSize: 12, color: '#8a8076', margin: '8px 0 0' }}>Not yet validated — this prompt is marked <strong>{p.validation_status}</strong>. It becomes “Proven” only after a real validation run.</p>}
      </div>

      {/* Attribution (Wharton CC-BY etc. — mandatory where present) */}
      {p.attribution && (
        <p style={{ fontSize: 11.5, color: '#a89e92', marginTop: 14, lineHeight: 1.5 }}>{p.attribution}</p>
      )}

      {/* Rate / suggest an edit */}
      <div style={{ ...card, marginTop: 14 }}>
        <span style={sectionLbl}>Rate it / suggest an improvement (on {MODEL_LABEL[model]})</span>
        <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setFb({ ...fb, rating: n })} style={{ ...starBtn, color: n <= fb.rating ? ACCENT : '#d8cfc4' }}>★</button>
          ))}
        </div>
        <textarea value={fb.comment} onChange={(e) => setFb({ ...fb, comment: e.target.value })} placeholder="What worked / didn’t (optional)" style={{ ...inp, width: '100%', minHeight: 44, marginBottom: 8 }} />
        <textarea value={fb.suggested_edit} onChange={(e) => setFb({ ...fb, suggested_edit: e.target.value })} placeholder="Suggest a better version of the prompt (optional — goes to the curation queue)" style={{ ...inp, width: '100%', minHeight: 60 }} />
        <div style={{ marginTop: 8 }}>
          <button onClick={sendFeedback} disabled={!fb.rating && !fb.comment && !fb.suggested_edit} style={btn}>Send feedback</button>
          {fbMsg && <span style={{ color: '#166534', fontSize: 13, marginLeft: 10 }}>{fbMsg}</span>}
        </div>
      </div>
    </div>
  );
}

function Labelled({ label, children }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: '#8a8076' }}>{label}{children}</label>;
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { padding: '8px 11px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, background: '#fff', fontFamily: 'inherit' };
const btn = { padding: '7px 14px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '7px 14px', background: '#1c1b1a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const starBtn = { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 };
const taskTag = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT, background: '#f7ece7', padding: '2px 8px', borderRadius: 999 };
const roleTag = { fontSize: 10.5, color: '#6b6359', background: '#f1f0ec', padding: '2px 8px', borderRadius: 999, textTransform: 'capitalize' };
const sectionLbl = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' };
const miniLbl = { fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 };
const exampleBox = { fontSize: 13, color: '#3a342e', background: '#faf8f5', border: '1px solid #f0ebe3', borderRadius: 8, padding: 10, whiteSpace: 'pre-wrap' };
const th = { padding: '6px 8px' };
const td = { padding: '8px' };
const muted = { color: '#8a8076' };
