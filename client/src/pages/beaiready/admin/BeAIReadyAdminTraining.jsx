// BeAIReadyAdminTraining — the BE AI READY admin's Training & Strategy workspace.
// Pick a client, then: import/sync their Google form (Intake), build the training
// Agenda (with an optional Google-Doc or PDF attachment), add Materials (RAG-ingested),
// set the AI Strategy as goals + an automation roadmap, and record Training/Strategy
// recommendations. Everything writes to the selected client's tenant via the
// X-Newsroom-Id override and shows in that client's own portal. All real data —
// honest empty states.
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
          <StrategySection clientId={clientId} setErr={setErr} />
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
  const [note, setNote] = useState(null);   // { kind: 'ok'|'warn', text }

  const load = useCallback(() => {
    api('/beaiready/intake').then(setForms).catch((e) => setErr(e.message));
    api('/beaiready/training/intake-responses').then(setResponses).catch(() => setResponses([]));
  }, [api, setErr]);
  useEffect(() => { setForms(null); setResponses(null); setNote(null); load(); }, [load]);

  // Turn a sync result into one honest line the admin can read.
  const describe = (r) => r.error
    ? `${r.form}: ${r.error}`
    : `${r.form}: ${r.inserted} new · ${r.total} total response${r.total === 1 ? '' : 's'}`;

  const register = async (e) => {
    e.preventDefault();
    if (!draft.form_name.trim() || !draft.csv_url.trim()) return;
    setBusy('register'); setErr(''); setNote(null);
    try {
      const r = await api('/beaiready/training/intake-forms', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, ...draft }) });
      setDraft({ form_name: '', csv_url: '' });
      if (r?.sync) setNote({ kind: r.sync.error ? 'warn' : 'ok', text: describe(r.sync) });
      load();
    } catch (e) { setErr(e.message); }
    setBusy('');
  };
  const sync = async () => {
    setBusy('sync'); setErr(''); setNote(null);
    try {
      const r = await api('/beaiready/training/intake-forms/sync', { method: 'POST' });
      const results = r?.results || [];
      if (results.length === 0) setNote({ kind: 'warn', text: 'No form connected to sync yet.' });
      else setNote({ kind: results.some((x) => x.error) ? 'warn' : 'ok', text: results.map(describe).join(' · ') });
      load();
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  return (
    <Section title="Intake" hint="Import what the client told you via their Google form">
      <form onSubmit={register} style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 6 }}>
        <Field label="Form name"><input value={draft.form_name} onChange={(e) => setDraft({ ...draft, form_name: e.target.value })} placeholder="AI readiness intake" style={inp} /></Field>
        <Field label="Response sheet link"><input value={draft.csv_url} onChange={(e) => setDraft({ ...draft, csv_url: e.target.value })} placeholder="Paste the responses Google Sheet link" style={{ ...inp, minWidth: 280 }} /></Field>
        <button type="submit" disabled={busy === 'register'} style={btn}>{busy === 'register' ? 'Connecting…' : 'Connect form'}</button>
        <button type="button" onClick={sync} disabled={busy === 'sync'} style={btnGhost}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
      </form>
      <p style={{ ...muted, fontSize: 12, marginBottom: 10 }}>
        Paste the response Sheet's normal link (set it to “anyone with the link can view”), or use File → Share → Publish to web → CSV. Responses pull in automatically on connect, and hourly after that.
      </p>
      {note && (
        <div style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: 13,
          background: note.kind === 'ok' ? '#f0fdf4' : '#fffbeb',
          borderColor: note.kind === 'ok' ? '#bbf7d0' : '#fde68a',
          color: note.kind === 'ok' ? '#166534' : '#92400e' }}>
          {note.text}
        </div>
      )}
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
          agendas.map((a) => <AgendaCard key={a.id} agenda={a} api={api} clientId={clientId} onChanged={load} setErr={setErr} />)}
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

function AgendaCard({ agenda, api, clientId, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: agenda.title, scheduled_for: agenda.scheduled_for || '', location: agenda.location || '', status: agenda.status, items: itemsToText(agenda.items) });
  const [gdoc, setGdoc] = useState('');
  const [docBusy, setDocBusy] = useState('');
  const save = async () => { setErr(''); try { await api(`/beaiready/training/agendas/${agenda.id}`, { method: 'PUT', body: JSON.stringify({ ...f, scheduled_for: f.scheduled_for || null, items: textToItems(f.items) }) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await api(`/beaiready/training/agendas/${agenda.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  const togglePub = async () => { setErr(''); try { await api(`/beaiready/training/agendas/${agenda.id}`, { method: 'PUT', body: JSON.stringify({ status: agenda.status === 'published' ? 'draft' : 'published' }) }); onChanged(); } catch (e) { setErr(e.message); } };
  // Document attachment (Google Doc — re-syncable — or an uploaded PDF).
  const attachGoogle = async () => { if (!gdoc.trim()) return; setErr(''); setDocBusy('gdoc'); try { await api(`/beaiready/training/agendas/${agenda.id}/doc/google`, { method: 'POST', body: JSON.stringify({ doc_url: gdoc.trim() }) }); setGdoc(''); onChanged(); } catch (e) { setErr(e.message); } setDocBusy(''); };
  const syncDoc = async () => { setErr(''); setDocBusy('sync'); try { await api(`/beaiready/training/agendas/${agenda.id}/doc/sync`, { method: 'POST' }); onChanged(); } catch (e) { setErr(e.message); } setDocBusy(''); };
  const removeDoc = async () => { setErr(''); try { await api(`/beaiready/training/agendas/${agenda.id}/doc`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  const uploadPdf = async (file) => {
    if (!file) return; setErr(''); setDocBusy('upload');
    try {
      const fd = new FormData();
      fd.append('entity_type', 'training_agenda');   // must precede the file (multer reads fields in order)
      fd.append('file', file);
      const res = await fetch(`/api/beaiready/training/agendas/${agenda.id}/doc/upload`, {
        method: 'POST', credentials: 'include', headers: { 'X-Newsroom-Id': clientId }, body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
      onChanged();
    } catch (e) { setErr(e.message); }
    setDocBusy('');
  };

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
      {/* Document: a Google Doc you can re-sync, or an uploaded PDF. Shows in the client's portal. */}
      {!edit && (
        <div style={{ marginTop: 10, borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
          {agenda.doc_kind === 'gdoc' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span>📄 Google Doc</span>
              <a href={agenda.doc_url} target="_blank" rel="noreferrer" style={{ color: '#c75b39' }}>Open ↗</a>
              <span style={muted}>{agenda.doc_synced ? `synced ${agenda.doc_synced_at ? new Date(agenda.doc_synced_at).toLocaleString() : ''}` : 'not synced yet'}</span>
              <button onClick={syncDoc} disabled={docBusy === 'sync'} style={tag}>{docBusy === 'sync' ? 'Syncing…' : 'Re-sync'}</button>
              <button onClick={removeDoc} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
            </div>
          ) : agenda.doc_kind === 'pdf' ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span>📎 {agenda.doc_name || 'PDF'}</span>
              <a href={`/api/uploads/${agenda.doc_file_id}/download`} target="_blank" rel="noreferrer" style={{ color: '#c75b39' }}>Open ↗</a>
              <button onClick={removeDoc} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6b63' }}>Attach a document (optional) — shown in the client's portal</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={gdoc} onChange={(e) => setGdoc(e.target.value)} placeholder="Google Doc link (set to ‘anyone with the link’)" style={{ ...inp, minWidth: 260 }} />
                <button onClick={attachGoogle} disabled={docBusy === 'gdoc' || !gdoc.trim()} style={tag}>{docBusy === 'gdoc' ? 'Attaching…' : 'Attach & sync'}</button>
                <label style={{ ...tag, cursor: 'pointer' }}>
                  {docBusy === 'upload' ? 'Uploading…' : 'Upload PDF'}
                  <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => uploadPdf(e.target.files?.[0])} />
                </label>
              </div>
            </div>
          )}
        </div>
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

// ── Strategy (goals + automation roadmap) ────────────────────────────────────────
// A set of structured items, not a document. Two lists: Goals (what the business
// wants from AI) and an Automation roadmap (what to automate, sized by effort/payoff).
// Clients see PUBLISHED items in their dashboard.
const SIZE_OPTS = ['', 'low', 'medium', 'high'];
function StrategySection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [items, setItems] = useState(null);
  const load = useCallback(() => { api('/beaiready/training/strategy').then(setItems).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setItems(null); load(); }, [load]);
  const goals = (items || []).filter((i) => i.kind === 'goal');
  const autos = (items || []).filter((i) => i.kind === 'automation');
  return (
    <Section title="Strategy" hint="Goals + automation roadmap — published items show in the client's dashboard">
      {items == null ? <p style={muted}>Loading…</p> : (
        <div style={{ display: 'grid', gap: 18 }}>
          <StrategyGroup kind="goal" label="Goals" hint="What the business wants from AI"
            rows={goals} api={api} clientId={clientId} onChanged={load} setErr={setErr} />
          <StrategyGroup kind="automation" label="Automation roadmap" hint="What to automate — sized by effort & payoff"
            rows={autos} api={api} clientId={clientId} onChanged={load} setErr={setErr} />
        </div>
      )}
    </Section>
  );
}

function StrategyGroup({ kind, label, hint, rows, api, clientId, onChanged, setErr }) {
  const auto = kind === 'automation';
  const [draft, setDraft] = useState({ title: '', detail: '', effort: '', payoff: '' });
  const add = async (e) => {
    e.preventDefault(); if (!draft.title.trim()) return; setErr('');
    try {
      await api('/beaiready/training/strategy', { method: 'POST', body: JSON.stringify({
        newsroom_id: clientId, kind, title: draft.title, detail: draft.detail || null,
        effort: auto ? (draft.effort || null) : null, payoff: auto ? (draft.payoff || null) : null }) });
      setDraft({ title: '', detail: '', effort: '', payoff: '' }); onChanged();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>{label}</strong><span style={{ fontSize: 12, color: '#8a8076' }}>{hint}</span>
      </div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
        {rows.length === 0 ? <p style={muted}>None yet.</p> :
          rows.map((it) => <StrategyItemCard key={it.id} it={it} auto={auto} api={api} onChanged={onChanged} setErr={setErr} />)}
      </div>
      <form onSubmit={add} style={{ ...card, display: 'grid', gap: 8 }}>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={auto ? 'What to automate (e.g. Draft monthly client report)' : 'Goal (e.g. Cut report turnaround in half)'} style={inp} />
        <input value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="Detail (optional)" style={inp} />
        {auto && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SizeSelect label="Effort" value={draft.effort} onChange={(v) => setDraft({ ...draft, effort: v })} />
            <SizeSelect label="Payoff" value={draft.payoff} onChange={(v) => setDraft({ ...draft, payoff: v })} />
          </div>
        )}
        <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Add {auto ? 'item' : 'goal'}</button>
      </form>
    </div>
  );
}

function StrategyItemCard({ it, auto, api, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: it.title, detail: it.detail || '', effort: it.effort || '', payoff: it.payoff || '' });
  const save = async () => { setErr(''); try { await api(`/beaiready/training/strategy/${it.id}`, { method: 'PUT', body: JSON.stringify({ title: f.title, detail: f.detail, effort: auto ? (f.effort || null) : null, payoff: auto ? (f.payoff || null) : null }) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await api(`/beaiready/training/strategy/${it.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  const togglePub = async () => { setErr(''); try { await api(`/beaiready/training/strategy/${it.id}`, { method: 'PUT', body: JSON.stringify({ status: it.status === 'published' ? 'draft' : 'published' }) }); onChanged(); } catch (e) { setErr(e.message); } };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong>{it.title}</strong>
          <span style={{ ...pill, ...(it.status === 'published' ? pubOn : pubOff), marginLeft: 6 }}>{it.status}</span>
          {auto && it.effort && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359', marginLeft: 6 }}>effort: {it.effort}</span>}
          {auto && it.payoff && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359', marginLeft: 6 }}>payoff: {it.payoff}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={togglePub} style={tag}>{it.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button onClick={() => setEdit(!edit)} style={tag}>{edit ? 'Cancel' : 'Edit'}</button>
          <button onClick={del} style={{ ...tag, color: '#b91c1c' }}>Delete</button>
        </div>
      </div>
      {!edit && it.detail && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{it.detail}</p>}
      {edit && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
          <input value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="Detail" style={inp} />
          {auto && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SizeSelect label="Effort" value={f.effort} onChange={(v) => setF({ ...f, effort: v })} />
              <SizeSelect label="Payoff" value={f.payoff} onChange={(v) => setF({ ...f, payoff: v })} />
            </div>
          )}
          <button onClick={save} style={{ ...btn, justifySelf: 'start' }}>Save</button>
        </div>
      )}
    </div>
  );
}

function SizeSelect({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b63' }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inp}>
        {SIZE_OPTS.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
      </select>
    </label>
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
