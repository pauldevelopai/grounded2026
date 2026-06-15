// BeAIReadyAdminTraining — the BE AI READY admin's Training & Strategy workspace.
// Pick a client, then: import/sync their Google form (Intake), build the training
// Agenda, add Materials (RAG-ingested), upload+edit the Outcome doc (linked to
// strategy), and record Training/Strategy recommendations. Everything writes to
// the selected client's tenant via the X-Newsroom-Id override and shows in that
// client's own portal. All real data — honest empty states.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';
import { findPillar } from '../pillars.js';
import { PillarBlock } from './BeAIReadyAdminPillars.jsx';

export default function BeAIReadyAdminTraining() {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/beaiready/admin/clients').then((c) => { setClients(c); if (c.length) setClientId(c[0].id); }).catch((e) => setErr(e.message));
  }, []);

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Training &amp; Strategy</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '66ch' }}>
        Everything a client gets in their portal — their intake, training agenda, materials, the AI-strategy
        outcome document, and your recommendations. Shareable materials feed the BE AI READY knowledge base
        so future clients build on this work.
      </p>
      {err && <div style={banner}>{err}</div>}

      <div style={{ marginBottom: 22 }}>
        <label style={kicker}>Client</label>{' '}
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...inp, minWidth: 240 }}>
          {clients === null && <option>Loading…</option>}
          {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {clientId && (
        <div style={{ display: 'grid', gap: 24 }}>
          <IntakeSection clientId={clientId} setErr={setErr} />
          <AgendaSection clientId={clientId} setErr={setErr} />
          <MaterialsSection clientId={clientId} setErr={setErr} />
          <OutcomeSection clientId={clientId} setErr={setErr} />
          <RecommendationsSection clientId={clientId} setErr={setErr} />
        </div>
      )}
    </div>
  );
}

const useApi = (clientId) =>
  useCallback((path, opts = {}) => apiFetch(path, { ...opts, headers: { 'X-Newsroom-Id': clientId, ...(opts.headers || {}) } }), [clientId]);

function Section({ title, hint, children }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h2>
        {hint && <span style={{ fontSize: 12, color: '#8a8076' }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// ── Intake (Google form) ─────────────────────────────────────────────────────────
function IntakeSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [forms, setForms] = useState(null);
  const [responses, setResponses] = useState(null);
  const [draft, setDraft] = useState({ form_name: '', csv_url: '' });
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api('/beaiready/intake').then(setForms).catch((e) => setErr(e.message));
    api('/beaiready/training/intake-responses').then(setResponses).catch(() => setResponses([]));
  }, [api, setErr]);
  useEffect(() => { setForms(null); setResponses(null); load(); }, [load]);

  const register = async (e) => {
    e.preventDefault();
    if (!draft.form_name.trim() || !draft.csv_url.trim()) return;
    setBusy('register'); setErr('');
    try { await api('/beaiready/training/intake-forms', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, ...draft }) }); setDraft({ form_name: '', csv_url: '' }); load(); }
    catch (e) { setErr(e.message); }
    setBusy('');
  };
  const sync = async () => { setBusy('sync'); setErr(''); try { await api('/beaiready/training/intake-forms/sync', { method: 'POST' }); load(); } catch (e) { setErr(e.message); } setBusy(''); };

  return (
    <Section title="Intake" hint="Import what the client told you via their Google form">
      <form onSubmit={register} style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <Field label="Form name"><input value={draft.form_name} onChange={(e) => setDraft({ ...draft, form_name: e.target.value })} placeholder="AI readiness intake" style={inp} /></Field>
        <Field label="Published CSV URL"><input value={draft.csv_url} onChange={(e) => setDraft({ ...draft, csv_url: e.target.value })} placeholder="Google Sheet → Publish to web → CSV" style={{ ...inp, minWidth: 280 }} /></Field>
        <button type="submit" disabled={busy === 'register'} style={btn}>Connect form</button>
        <button type="button" onClick={sync} disabled={busy === 'sync'} style={btnGhost}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
      </form>
      {forms == null ? <p style={muted}>Loading…</p> : forms.length === 0 ? <p style={muted}>No form connected yet.</p> : (
        <ul style={list}>
          {forms.map((f) => (
            <li key={f.form_name} style={{ fontSize: 13.5 }}>
              <strong>{f.form_name}</strong> — {f.response_count} response{f.response_count === 1 ? '' : 's'}
              {f.last_synced_at && <span style={muted}> · synced {new Date(f.last_synced_at).toLocaleString()}</span>}
            </li>
          ))}
        </ul>
      )}
      {responses && responses.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 13, color: '#c75b39', cursor: 'pointer' }}>View {responses.length} response{responses.length === 1 ? '' : 's'}</summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {responses.slice(0, 50).map((r) => (
              <div key={r.id} style={{ ...card, padding: 10, fontSize: 12.5 }}>
                <div style={muted}>{r.form_name}{r.submitted_at ? ` · ${new Date(r.submitted_at).toLocaleDateString()}` : ''}</div>
                {Object.entries(r.response || {}).slice(0, 8).map(([k, v]) => (
                  <div key={k}><strong>{k}:</strong> {String(v)}</div>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </Section>
  );
}

// ── Agenda ────────────────────────────────────────────────────────────────────────
const itemsToText = (items) => (items || []).map((i) => [i.time_label, i.topic, i.detail].filter(Boolean).join(' | ')).join('\n');
function textToItems(text) {
  return (text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split('|').map((s) => s.trim());
    if (p.length >= 3) return { time_label: p[0] || null, topic: p[1], detail: p.slice(2).join(' | ') || null };
    if (p.length === 2) return { time_label: p[0] || null, topic: p[1] };
    return { topic: p[0] };
  }).filter((i) => i.topic);
}

function AgendaSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [agendas, setAgendas] = useState(null);
  const [draft, setDraft] = useState({ title: '', scheduled_for: '', location: '', items: '' });
  const load = useCallback(() => { api('/beaiready/training/agendas').then(setAgendas).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setAgendas(null); load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!draft.title.trim()) return; setErr('');
    try {
      await api('/beaiready/training/agendas', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, title: draft.title, scheduled_for: draft.scheduled_for || null, location: draft.location || null, items: textToItems(draft.items) }) });
      setDraft({ title: '', scheduled_for: '', location: '', items: '' }); load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <Section title="Training agenda" hint="Items show in the client's portal when published">
      <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
        {agendas == null ? <p style={muted}>Loading…</p> : agendas.length === 0 ? <p style={muted}>No agenda yet.</p> :
          agendas.map((a) => <AgendaCard key={a.id} agenda={a} api={api} onChanged={load} setErr={setErr} />)}
      </div>
      <form onSubmit={create} style={{ ...card, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>New agenda</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. AI Day 1)" style={{ ...inp, flex: 1 }} />
          <input type="date" value={draft.scheduled_for} onChange={(e) => setDraft({ ...draft, scheduled_for: e.target.value })} style={inp} />
          <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Location" style={inp} />
        </div>
        <textarea value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} placeholder={'One item per line:  09:00 | Topic | detail'} style={{ ...inp, minHeight: 64 }} />
        <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Add agenda</button>
      </form>
    </Section>
  );
}

function AgendaCard({ agenda, api, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: agenda.title, scheduled_for: agenda.scheduled_for || '', location: agenda.location || '', status: agenda.status, items: itemsToText(agenda.items) });
  const save = async () => { setErr(''); try { await api(`/beaiready/training/agendas/${agenda.id}`, { method: 'PUT', body: JSON.stringify({ ...f, scheduled_for: f.scheduled_for || null, items: textToItems(f.items) }) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await api(`/beaiready/training/agendas/${agenda.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  const togglePub = async () => { setErr(''); try { await api(`/beaiready/training/agendas/${agenda.id}`, { method: 'PUT', body: JSON.stringify({ status: agenda.status === 'published' ? 'draft' : 'published' }) }); onChanged(); } catch (e) { setErr(e.message); } };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><strong>{agenda.title}</strong> <span style={muted}>{agenda.scheduled_for || ''} {agenda.location ? `· ${agenda.location}` : ''}</span>
          <span style={{ ...pill, ...(agenda.status === 'published' ? pubOn : pubOff) }}>{agenda.status}</span></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={togglePub} style={tag}>{agenda.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button onClick={() => setEdit(!edit)} style={tag}>{edit ? 'Cancel' : 'Edit'}</button>
          <button onClick={del} style={{ ...tag, color: '#b91c1c' }}>Delete</button>
        </div>
      </div>
      {!edit && agenda.items?.length > 0 && (
        <ul style={{ ...list, marginTop: 8 }}>{agenda.items.map((i) => <li key={i.id} style={{ fontSize: 13 }}><strong>{i.time_label ? `${i.time_label} · ` : ''}{i.topic}</strong>{i.detail ? ` — ${i.detail}` : ''}</li>)}</ul>
      )}
      {edit && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={f.scheduled_for} onChange={(e) => setF({ ...f, scheduled_for: e.target.value })} style={inp} />
            <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Location" style={inp} />
          </div>
          <textarea value={f.items} onChange={(e) => setF({ ...f, items: e.target.value })} style={{ ...inp, minHeight: 64 }} />
          <button onClick={save} style={{ ...btn, justifySelf: 'start' }}>Save</button>
        </div>
      )}
    </div>
  );
}

// ── Materials (RAG-ingested) ────────────────────────────────────────────────────
const KINDS = ['doc', 'slide', 'video', 'link', 'exercise'];
function MaterialsSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState({ title: '', kind: 'doc', url: '', description: '', content: '', rag_shareable: true });
  const load = useCallback(() => { api('/beaiready/training/materials').then(setRows).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const create = async (e) => { e.preventDefault(); if (!draft.title.trim()) return; setErr(''); try { await api('/beaiready/training/materials', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, ...draft }) }); setDraft({ title: '', kind: 'doc', url: '', description: '', content: '', rag_shareable: true }); load(); } catch (e) { setErr(e.message); } };

  return (
    <Section title="Training materials" hint="Published materials appear in the client's portal">
      <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
        {rows == null ? <p style={muted}>Loading…</p> : rows.length === 0 ? <p style={muted}>No materials yet.</p> :
          rows.map((m) => <MaterialCard key={m.id} m={m} api={api} onChanged={load} setErr={setErr} />)}
      </div>
      <form onSubmit={create} style={{ ...card, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>New material</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" style={{ ...inp, flex: 1 }} />
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} style={inp}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Link (optional)" style={inp} />
        </div>
        <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short description" style={inp} />
        <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Body / notes (this is what the knowledge base learns from)" style={{ ...inp, minHeight: 64 }} />
        <label style={chk}><input type="checkbox" checked={draft.rag_shareable} onChange={(e) => setDraft({ ...draft, rag_shareable: e.target.checked })} /> Share with the BE AI READY knowledge base (sector-scoped)</label>
        <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Add material</button>
      </form>
    </Section>
  );
}

function MaterialCard({ m, api, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: m.title, kind: m.kind, url: m.url || '', description: m.description || '', content: m.content || '', published: m.published, rag_shareable: m.rag_shareable });
  const save = async () => { setErr(''); try { await api(`/beaiready/training/materials/${m.id}`, { method: 'PUT', body: JSON.stringify(f) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await api(`/beaiready/training/materials/${m.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><span style={{ ...pill, background: '#f1f0ec', color: '#6b6359' }}>{m.kind}</span> <strong style={{ marginLeft: 6 }}>{m.title}</strong>
          {!m.published && <span style={{ ...pill, ...pubOff, marginLeft: 6 }}>draft</span>}
          {m.rag_synced && <span style={{ ...pill, background: '#dcfce7', color: '#166534', marginLeft: 6 }}>in knowledge base</span>}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setEdit(!edit)} style={tag}>{edit ? 'Cancel' : 'Edit'}</button>
          <button onClick={del} style={{ ...tag, color: '#b91c1c' }}>Delete</button>
        </div>
      </div>
      {!edit && m.description && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{m.description}</p>}
      {!edit && m.url && <a href={m.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#c75b39' }}>{m.url} ↗</a>}
      {edit && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} style={inp}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="Link" style={{ ...inp, flex: 1 }} />
          </div>
          <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" style={inp} />
          <textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} style={{ ...inp, minHeight: 64 }} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={chk}><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Published to client</label>
            <label style={chk}><input type="checkbox" checked={f.rag_shareable} onChange={(e) => setF({ ...f, rag_shareable: e.target.checked })} /> Share with knowledge base</label>
          </div>
          <button onClick={save} style={{ ...btn, justifySelf: 'start' }}>Save</button>
        </div>
      )}
    </div>
  );
}

// ── Outcome document (linked to strategy) ───────────────────────────────────────
function OutcomeSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState({ title: '', content: '', file_url: '', rag_shareable: true });
  const load = useCallback(() => { api('/beaiready/training/outcomes').then(setRows).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const create = async (e) => { e.preventDefault(); if (!draft.title.trim()) return; setErr(''); try { await api('/beaiready/training/outcomes', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, ...draft }) }); setDraft({ title: '', content: '', file_url: '', rag_shareable: true }); load(); } catch (e) { setErr(e.message); } };
  return (
    <Section title="AI-strategy outcome document" hint="The client sees this once marked final; linked to their strategy">
      <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
        {rows == null ? <p style={muted}>Loading…</p> : rows.length === 0 ? <p style={muted}>No outcome document yet.</p> :
          rows.map((o) => <OutcomeCard key={o.id} o={o} api={api} onChanged={load} setErr={setErr} />)}
      </div>
      <form onSubmit={create} style={{ ...card, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>New outcome document</div>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. AI strategy & roadmap)" style={inp} />
        <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Document body (markdown) — goals, what to automate, in what order…" style={{ ...inp, minHeight: 120 }} />
        <input value={draft.file_url} onChange={(e) => setDraft({ ...draft, file_url: e.target.value })} placeholder="Uploaded file link (optional)" style={inp} />
        <label style={chk}><input type="checkbox" checked={draft.rag_shareable} onChange={(e) => setDraft({ ...draft, rag_shareable: e.target.checked })} /> Share with the knowledge base when final</label>
        <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Create draft</button>
      </form>
    </Section>
  );
}

function OutcomeCard({ o, api, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: o.title, content: o.content || '', file_url: o.file_url || '', status: o.status, linked_to_strategy: o.linked_to_strategy, rag_shareable: o.rag_shareable });
  const save = async () => { setErr(''); try { await api(`/beaiready/training/outcomes/${o.id}`, { method: 'PUT', body: JSON.stringify(f) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await api(`/beaiready/training/outcomes/${o.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  const toggleFinal = async () => { setErr(''); try { await api(`/beaiready/training/outcomes/${o.id}`, { method: 'PUT', body: JSON.stringify({ status: o.status === 'final' ? 'draft' : 'final' }) }); onChanged(); } catch (e) { setErr(e.message); } };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><strong>{o.title}</strong>
          <span style={{ ...pill, ...(o.status === 'final' ? pubOn : pubOff), marginLeft: 6 }}>{o.status}</span>
          {o.linked_to_strategy && <span style={{ ...pill, background: '#ede9fe', color: '#5b21b6', marginLeft: 6 }}>strategy</span>}
          {o.rag_synced && <span style={{ ...pill, background: '#dcfce7', color: '#166534', marginLeft: 6 }}>in knowledge base</span>}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={toggleFinal} style={tag}>{o.status === 'final' ? 'Revert to draft' : 'Mark final'}</button>
          <button onClick={() => setEdit(!edit)} style={tag}>{edit ? 'Cancel' : 'Edit'}</button>
          <button onClick={del} style={{ ...tag, color: '#b91c1c' }}>Delete</button>
        </div>
      </div>
      {!edit && o.content && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{o.content.slice(0, 280)}{o.content.length > 280 ? '…' : ''}</p>}
      {!edit && o.file_url && <a href={o.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#c75b39' }}>{o.file_url} ↗</a>}
      {edit && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
          <textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} style={{ ...inp, minHeight: 140 }} />
          <input value={f.file_url} onChange={(e) => setF({ ...f, file_url: e.target.value })} placeholder="Uploaded file link" style={inp} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={chk}><input type="checkbox" checked={f.linked_to_strategy} onChange={(e) => setF({ ...f, linked_to_strategy: e.target.checked })} /> Linked to strategy</label>
            <label style={chk}><input type="checkbox" checked={f.rag_shareable} onChange={(e) => setF({ ...f, rag_shareable: e.target.checked })} /> Share with knowledge base</label>
          </div>
          <button onClick={save} style={{ ...btn, justifySelf: 'start' }}>Save</button>
        </div>
      )}
    </div>
  );
}

// ── Recommendations (Training + Strategy pillars) ────────────────────────────────
function RecommendationsSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [recs, setRecs] = useState(null);
  const load = useCallback(() => { api('/beaiready/recommendations').then(setRecs).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setRecs(null); load(); }, [load]);
  return (
    <Section title="Recommendations" hint="Prioritised actions shown in the client's dashboard">
      <div style={{ display: 'grid', gap: 12 }}>
        {['training', 'strategy'].map((k) => {
          const p = findPillar(k); if (!p) return null;
          return <PillarBlock key={k} pillar={p} clientId={clientId} recs={(recs || []).filter((r) => r.pillar === k)} onChanged={load} setErr={setErr} />;
        })}
      </div>
    </Section>
  );
}

function Field({ label, children }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b63' }}>{label}{children}</label>;
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const kicker = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', background: '#1c1b1a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tag = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' };
const pubOn = { background: '#dcfce7', color: '#166534' };
const pubOff = { background: '#f1f0ec', color: '#8a8076' };
const muted = { color: '#8a8076', fontSize: 13, margin: 0 };
const list = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 };
const chk = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5b5249' };
