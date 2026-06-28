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
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Training</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '66ch' }}>
        The client's intake, training agenda, materials and your training recommendations. Strategy (goals +
        automation roadmap) is now its own page. Every survey, agenda, report and handout is read into text the
        AI uses to decide what this client needs next — and shareable materials feed the BE AI READY knowledge
        base so future clients build on this work.
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
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <HarvestSection clientId={clientId} setErr={setErr} />
          <IntakeSection clientId={clientId} setErr={setErr} />
          <CompanyKnowledgeSection clientId={clientId} setErr={setErr} />
          <AgendaSection clientId={clientId} setErr={setErr} />
          <MaterialsSection clientId={clientId} setErr={setErr} />
          <RecommendationsSection clientId={clientId} setErr={setErr} pillars={['training']} />
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

// ── Training-data harvest — extract & index every PDF so the AI uses it ───────────
// New uploads (agenda PDFs, reports, material handouts) are read into text on
// arrival; this panel shows how much of the corpus is indexed and lets the
// consultant (re)read anything added before harvesting existed, or that failed.
function HarvestSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const load = useCallback(() => { api('/beaiready/training/harvest/status').then(setSt).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setSt(null); setNote(''); load(); }, [load]);

  const backfill = async () => {
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await api('/beaiready/training/harvest/backfill', { method: 'POST' });
      setNote(r.processed === 0
        ? 'Everything is already harvested.'
        : `Harvested ${r.harvested} of ${r.processed} document${r.processed === 1 ? '' : 's'}` +
          `${r.failed ? ` · ${r.failed} couldn't be read` : ''}` +
          `${r.reindexed_materials ? ` · re-indexed ${r.reindexed_materials} material${r.reindexed_materials === 1 ? '' : 's'}` : ''}.`);
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const total = st?.total ?? 0, harvested = st?.harvested ?? 0, pending = st?.pending ?? 0, failed = st?.failed ?? 0;
  const pct = total ? Math.round((harvested / total) * 100) : 0;
  return (
    <Section title="Training-data harvest" hint="Every agenda, report and handout is read into text the AI uses for this client's decisions">
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        {st == null ? <p style={muted}>Loading…</p> : total === 0 ? (
          <p style={muted}>No training documents uploaded yet. Agendas, reports and material PDFs are harvested automatically as you add them.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={statPill}><strong>{harvested}</strong>/{total} indexed</span>
              {pending > 0 && <span style={{ ...pill, background: '#fef3c7', color: '#92400e', fontSize: 11, padding: '4px 10px' }}>{pending} not yet read</span>}
              {failed > 0 && <span style={{ ...pill, background: '#fee2e2', color: '#991b1b', fontSize: 11, padding: '4px 10px' }}>{failed} couldn't be read</span>}
            </div>
            <div style={{ height: 8, background: '#f1ece5', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#c75b39' }} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={backfill} disabled={busy || total === 0} style={btn}>{busy ? 'Harvesting…' : 'Harvest now'}</button>
          <span style={{ ...muted, fontSize: 12 }}>New uploads are read automatically — use this to (re)read anything added before, or that failed.</span>
        </div>
        {note && <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>{note}</p>}
      </div>
    </Section>
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
      {responses && responses.length > 0 && <IntakeResponses responses={responses} />}
    </Section>
  );
}

// ── Intake responses, glanceable: a summary strip + a scannable table ────────────
const RESP_LABELS = {
  'Timestamp': 'When', 'Email Address': 'Email', 'What is your name?': 'Name', 'How old are you?': 'Age',
  'Where do you live?': 'Location', 'How would you describe your familiarity with AI?': 'AI familiarity',
  'Please list the AI tools and platforms that you have used.': 'Tools used',
  'What have you heard about AI that you would like to learn?': 'Wants to learn',
};
const respLabel = (k) => RESP_LABELS[k] || k.replace(/\?$/, '').trim();
// Sensible column order for glancing: name, rating, the rest, then when/email last.
const respColScore = (k) => {
  const lk = k.toLowerCase();
  if (lk.includes('name')) return 0;
  if (lk.includes('familiar') || lk.includes('rating') || lk.includes('rate')) return 1;
  if (lk.includes('timestamp') || lk === 'email address' || lk.includes('email')) return 9;
  return 5;
};
const isRating = (vals) => vals.length > 0 && vals.every((v) => /^\d{1,2}$/.test(String(v).trim()) && +v <= 10);
const ratingColor = (n) => (n >= 7 ? ['#dcfce7', '#166534'] : n >= 4 ? ['#fef3c7', '#92400e'] : ['#fee2e2', '#991b1b']);

function IntakeResponses({ responses }) {
  const cols = [];
  for (const r of responses) for (const k of Object.keys(r.response || {})) if (!cols.includes(k)) cols.push(k);
  cols.sort((a, b) => respColScore(a) - respColScore(b));
  // Detect the AI-familiarity rating column (all small ints) for the summary + chips.
  const ratingCol = cols.find((c) => isRating(responses.map((r) => r.response?.[c]).filter((v) => v != null && v !== '')));
  const nums = ratingCol ? responses.map((r) => +r.response[ratingCol]).filter((n) => !isNaN(n)) : [];
  const avg = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={statPill}><strong>{responses.length}</strong> responses</span>
        {avg && <span style={statPill}>avg {respLabel(ratingCol).toLowerCase()} <strong>{avg}</strong>/10</span>}
      </div>
      <details open>
        <summary style={{ fontSize: 13, color: '#c75b39', cursor: 'pointer', marginBottom: 8 }}>View all {responses.length} responses</summary>
        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto', border: '1px solid #eee5da', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
            <thead>
              <tr>{cols.map((c) => (
                <th key={c} title={c} style={th}>{respLabel(c)}</th>
              ))}</tr>
            </thead>
            <tbody>
              {responses.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #f0ebe3' }}>
                  {cols.map((c) => {
                    const v = r.response?.[c] ?? '';
                    if (c === ratingCol && v !== '') {
                      const [bg, fg] = ratingColor(+v);
                      return <td key={c} style={td}><span style={{ ...pill, background: bg, color: fg, fontSize: 11 }}>{v}</span></td>;
                    }
                    return <td key={c} style={td}><div title={String(v)} style={cellClamp}>{String(v)}</div></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ── Company knowledge (internal context the AI reasons over) ─────────────────────
const SRC_LABEL = { doc: 'Doc', website: 'Website', note: 'Note' };
function CompanyKnowledgeSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [rows, setRows] = useState(null);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState({ title: '', text: '' });
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { api('/beaiready/training/company-knowledge').then(setRows).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const addWebsite = async () => { if (!url.trim()) return; setBusy('web'); setErr(''); try { await api('/beaiready/training/company-knowledge/website', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, url: url.trim() }) }); setUrl(''); load(); } catch (e) { setErr(e.message); } setBusy(''); };
  const addNote = async () => { if (!note.text.trim()) return; setBusy('note'); setErr(''); try { await api('/beaiready/training/company-knowledge/note', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, title: note.title || null, text: note.text }) }); setNote({ title: '', text: '' }); load(); } catch (e) { setErr(e.message); } setBusy(''); };
  const uploadDoc = async (file) => {
    if (!file) return; setBusy('doc'); setErr('');
    try {
      const fd = new FormData(); fd.append('newsroom_id', clientId); fd.append('file', file);   // newsroom_id before file (multer)
      const res = await fetch('/api/beaiready/training/company-knowledge/upload', { method: 'POST', credentials: 'include', headers: { 'X-Newsroom-Id': clientId }, body: fd });
      if (!res.ok) { const er = await res.json().catch(() => ({})); throw new Error(er.message || 'Upload failed'); }
      setFileKey((k) => k + 1); load();
    } catch (e) { setErr(e.message); } setBusy('');
  };
  const remove = async (id) => { setErr(''); try { await api(`/beaiready/training/company-knowledge/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };

  return (
    <Section title="Company knowledge" hint="Docs, a website or notes about this client — context the AI uses for strategy suggestions (internal; not shown to the client)">
      <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        {rows == null ? <p style={muted}>Loading…</p> : rows.length === 0 ? <p style={muted}>Nothing yet — add a website, upload a doc, or write a note.</p> :
          rows.map((s) => (
            <div key={s.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359' }}>{SRC_LABEL[s.kind] || s.kind}</span>
                <strong style={{ marginLeft: 6 }}>{s.title || s.url || 'Untitled'}</strong>
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontSize: 12, color: '#c75b39' }}>↗</a>}
                {!s.has_text && <span style={{ ...muted, marginLeft: 6 }}>· no text extracted</span>}
                {s.snippet && <div style={{ color: '#8a8076', marginTop: 3 }}>{s.snippet}…</div>}
              </div>
              <button onClick={() => remove(s.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
            </div>
          ))}
      </div>
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Company website URL to scrape" style={{ ...inp, minWidth: 260, flex: 1 }} />
          <button type="button" onClick={addWebsite} disabled={busy === 'web' || !url.trim()} style={btn}>{busy === 'web' ? 'Scraping…' : 'Add website'}</button>
          <label style={{ ...tag, cursor: 'pointer' }}>
            {busy === 'doc' ? 'Uploading…' : 'Upload doc (PDF/DOCX/…)'}
            <input key={fileKey} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" style={{ display: 'none' }} onChange={(e) => uploadDoc(e.target.files?.[0])} />
          </label>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <input value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="Note title (optional)" style={inp} />
          <textarea value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} placeholder="Type anything useful about the business — what they do, their tools, their goals…" style={{ ...inp, minHeight: 64 }} />
          <button type="button" onClick={addNote} disabled={busy === 'note' || !note.text.trim()} style={{ ...btn, justifySelf: 'start' }}>Add note</button>
        </div>
      </div>
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
  const [draft, setDraft] = useState({ title: '', scheduled_for: '', location: '', items: '', gdocUrl: '' });
  const [pendingFiles, setPendingFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);   // feedback shown AT the form — the page is long, a top banner is easy to miss
  const load = useCallback(() => { api('/beaiready/training/agendas').then(setAgendas).catch((e) => setNote({ ok: false, text: `Couldn't load agendas: ${e.message}` })); }, [api]);
  useEffect(() => { setAgendas(null); load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!draft.title.trim()) { setNote({ ok: false, text: 'Enter an agenda title first.' }); return; }
    setNote({ ok: true, text: 'Adding…' }); setBusy(true);
    let a;
    try {
      a = await api('/beaiready/training/agendas', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, title: draft.title, scheduled_for: draft.scheduled_for || null, location: draft.location || null, items: textToItems(draft.items) }) });
    } catch (e) { setNote({ ok: false, text: `Couldn't create the agenda: ${e.message}` }); setBusy(false); return; }
    // The agenda exists now — capture the documents, clear the form, SHOW it immediately.
    const files = pendingFiles;
    const gdoc = draft.gdocUrl.trim();
    setDraft({ title: '', scheduled_for: '', location: '', items: '', gdocUrl: '' });
    setPendingFiles([]);
    load();
    const problems = [];
    if (gdoc) {
      try { await api(`/beaiready/training/agendas/${a.id}/doc/google`, { method: 'POST', body: JSON.stringify({ doc_url: gdoc }) }); }
      catch (e) { problems.push(`Google Doc: ${e.message}`); }
    }
    for (const file of files) {
      try {
        const fd = new FormData(); fd.append('entity_type', 'training_agenda_file'); fd.append('entity_id', a.id); fd.append('file', file);
        const res = await fetch('/api/beaiready/training/files', { method: 'POST', credentials: 'include', headers: { 'X-Newsroom-Id': clientId }, body: fd });
        if (!res.ok) { const er = await res.json().catch(() => ({})); throw new Error(er.message || `HTTP ${res.status}`); }
      } catch (e) { problems.push(`${file.name}: ${e.message}`); }
    }
    setNote(problems.length
      ? { ok: false, text: `Agenda “${a.title}” added — but some documents didn't attach: ${problems.join('; ')}. Add them under “Documents” on the agenda above.` }
      : { ok: true, text: `Agenda “${a.title}” added ✓` });
    load();
    setBusy(false);
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
        <textarea value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} placeholder={'One item per line:  09:00 | Topic | detail (optional if you attach a doc)'} style={{ ...inp, minHeight: 64 }} />
        {/* Documents (optional) — the agenda PDF, a training report, handouts. Add as
            many as you like; a Google Doc link can go here too. All show in the portal. */}
        <div style={{ borderTop: '1px solid #f0ebe3', paddingTop: 8, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6b63' }}>Agenda document(s) (optional) — the agenda PDF + handouts. (The training report is added on the agenda once it’s created.)</div>
          <input value={draft.gdocUrl} onChange={(e) => setDraft({ ...draft, gdocUrl: e.target.value })} placeholder="Google Doc link (set to ‘anyone with the link’) — optional" style={inp} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...tag, cursor: 'pointer' }}>
              {pendingFiles.length ? `${pendingFiles.length} file${pendingFiles.length === 1 ? '' : 's'} — add more` : '+ Attach agenda PDF(s)'}
              <input type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" multiple style={{ display: 'none' }}
                onChange={(e) => { setPendingFiles((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
            </label>
            {pendingFiles.length > 0 && (
              <span style={{ fontSize: 12, color: '#6b6359' }}>{pendingFiles.map((f) => f.name).join(', ')}
                {' '}<button type="button" onClick={() => setPendingFiles([])} style={{ ...tag, padding: '1px 8px' }}>clear</button></span>
            )}
          </div>
        </div>
        {note && <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: note.ok ? '#f0fdf4' : '#FEF2F2', color: note.ok ? '#166534' : '#B91C1C', border: `1px solid ${note.ok ? '#bbf7d0' : '#fecaca'}` }}>{note.text}</div>}
        <button type="submit" disabled={busy} style={{ ...btn, justifySelf: 'start' }}>{busy ? 'Adding…' : 'Add agenda'}</button>
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
      {/* Two SEPARATE document areas: the agenda itself, and the post-training report.
          Both show (separately) in the client's portal. */}
      {!edit && (
        <div style={{ marginTop: 10, borderTop: '1px solid #f0ebe3', paddingTop: 10, display: 'grid', gap: 14 }}>
          <Attachments entityType="training_agenda_file" entityId={agenda.id} files={agenda.files}
            clientId={clientId} onChanged={onChanged} setErr={setErr}
            label="📋 Agenda documents — the agenda PDF + any handouts" />
          <Attachments entityType="training_report_file" entityId={agenda.id} files={agenda.reports}
            clientId={clientId} onChanged={onChanged} setErr={setErr}
            label="📝 Training report — the post-training write-up (kept separate from the agenda)" />
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
  const [agendas, setAgendas] = useState([]);
  const [draft, setDraft] = useState({ title: '', kind: 'doc', url: '', description: '', content: '', rag_shareable: true, agenda_id: '' });
  const [pendingFiles, setPendingFiles] = useState([]);
  const load = useCallback(() => {
    api('/beaiready/training/materials').then(setRows).catch((e) => setErr(e.message));
    api('/beaiready/training/agendas').then(setAgendas).catch(() => setAgendas([]));
  }, [api, setErr]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const create = async (e) => {
    e.preventDefault(); if (!draft.title.trim()) return; setErr('');
    let m;
    try { m = await api('/beaiready/training/materials', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, ...draft }) }); }
    catch (e) { setErr(`Couldn't add the material: ${e.message}`); return; }
    try {
      for (const file of pendingFiles) {
        const fd = new FormData(); fd.append('entity_type', 'training_material_file'); fd.append('entity_id', m.id); fd.append('file', file);
        const res = await fetch('/api/beaiready/training/files', { method: 'POST', credentials: 'include', headers: { 'X-Newsroom-Id': clientId }, body: fd });
        if (!res.ok) { const er = await res.json().catch(() => ({})); throw new Error(er.message || `upload failed (HTTP ${res.status})`); }
      }
    } catch (fileErr) {
      setErr(`Material added — but a PDF didn't upload: ${fileErr.message}. Add it on the material below.`);
    }
    setDraft({ title: '', kind: 'doc', url: '', description: '', content: '', rag_shareable: true, agenda_id: '' }); setPendingFiles([]); load();
  };

  return (
    <Section title="Training materials" hint="Published materials appear in the client's portal — attach the PDFs for each session and link each to its training">
      <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
        {rows == null ? <p style={muted}>Loading…</p> : rows.length === 0 ? <p style={muted}>No materials yet.</p> :
          rows.map((m) => <MaterialCard key={m.id} m={m} api={api} clientId={clientId} agendas={agendas} onChanged={load} setErr={setErr} />)}
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
        {/* Attach the session's PDFs (slides, handouts) — as many as you like. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ ...tag, cursor: 'pointer' }}>
            {pendingFiles.length ? `${pendingFiles.length} PDF${pendingFiles.length === 1 ? '' : 's'} to attach — add more` : '+ Attach PDF(s)'}
            <input type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" multiple style={{ display: 'none' }}
              onChange={(e) => { setPendingFiles((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
          </label>
          {pendingFiles.length > 0 && (
            <span style={{ fontSize: 12, color: '#6b6359' }}>{pendingFiles.map((f) => f.name).join(', ')}
              {' '}<button type="button" onClick={() => setPendingFiles([])} style={{ ...tag, padding: '1px 8px' }}>clear</button></span>
          )}
        </div>
        <AgendaSelect agendas={agendas} value={draft.agenda_id} onChange={(v) => setDraft({ ...draft, agenda_id: v })} />
        <label style={chk}><input type="checkbox" checked={draft.rag_shareable} onChange={(e) => setDraft({ ...draft, rag_shareable: e.target.checked })} /> Feed this client's private AI knowledge (used only for them)</label>
        <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Add material</button>
      </form>
    </Section>
  );
}

function MaterialCard({ m, api, clientId, agendas, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: m.title, kind: m.kind, url: m.url || '', description: m.description || '', content: m.content || '', published: m.published, rag_shareable: m.rag_shareable, agenda_id: m.agenda_id || '' });
  const save = async () => { setErr(''); try { await api(`/beaiready/training/materials/${m.id}`, { method: 'PUT', body: JSON.stringify(f) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await api(`/beaiready/training/materials/${m.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><span style={{ ...pill, background: '#f1f0ec', color: '#6b6359' }}>{m.kind}</span> <strong style={{ marginLeft: 6 }}>{m.title}</strong>
          {m.agenda_title && <span style={{ ...pill, background: '#eef2ff', color: '#3730a3', marginLeft: 6 }}>{m.agenda_title}</span>}
          {!m.published && <span style={{ ...pill, ...pubOff, marginLeft: 6 }}>draft</span>}
          {m.rag_synced && <span style={{ ...pill, background: '#dcfce7', color: '#166534', marginLeft: 6 }}>in knowledge base</span>}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setEdit(!edit)} style={tag}>{edit ? 'Cancel' : 'Edit'}</button>
          <button onClick={del} style={{ ...tag, color: '#b91c1c' }}>Delete</button>
        </div>
      </div>
      {!edit && m.description && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{m.description}</p>}
      {!edit && m.url && <a href={m.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#c75b39' }}>{m.url} ↗</a>}
      {!edit && (
        <div style={{ marginTop: 8 }}>
          <Attachments entityType="training_material_file" entityId={m.id} files={m.files}
            clientId={clientId} onChanged={onChanged} setErr={setErr} label="PDFs (slides, handouts) — add as many as you need" />
        </div>
      )}
      {edit && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inp} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} style={inp}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="Link" style={{ ...inp, flex: 1 }} />
          </div>
          <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" style={inp} />
          <textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} style={{ ...inp, minHeight: 64 }} />
          <AgendaSelect agendas={agendas} value={f.agenda_id} onChange={(v) => setF({ ...f, agenda_id: v })} />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={chk}><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Published to client</label>
            <label style={chk}><input type="checkbox" checked={f.rag_shareable} onChange={(e) => setF({ ...f, rag_shareable: e.target.checked })} /> Feed this client's private AI knowledge</label>
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
export function StrategySection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [items, setItems] = useState(null);
  const [agendas, setAgendas] = useState([]);
  const load = useCallback(() => {
    api('/beaiready/training/strategy').then(setItems).catch((e) => setErr(e.message));
    api('/beaiready/training/agendas').then(setAgendas).catch(() => setAgendas([]));
  }, [api, setErr]);
  useEffect(() => { setItems(null); load(); }, [load]);
  const goals = (items || []).filter((i) => i.kind === 'goal');
  const autos = (items || []).filter((i) => i.kind === 'automation');
  return (
    <Section title="Strategy" hint="Goals + automation roadmap — link to a training and/or set a target date; published items show in the client's dashboard">
      {items == null ? <p style={muted}>Loading…</p> : (
        <div style={{ display: 'grid', gap: 18 }}>
          <StrategyGroup kind="goal" label="Goals" hint="What the business wants from AI"
            rows={goals} api={api} clientId={clientId} agendas={agendas} onChanged={load} setErr={setErr} />
          <StrategyGroup kind="automation" label="Automation roadmap" hint="What to automate — sized by effort & payoff"
            rows={autos} api={api} clientId={clientId} agendas={agendas} onChanged={load} setErr={setErr} />
        </div>
      )}
    </Section>
  );
}

function StrategyGroup({ kind, label, hint, rows, api, clientId, agendas, onChanged, setErr }) {
  const auto = kind === 'automation';
  const [draft, setDraft] = useState({ title: '', detail: '', effort: '', payoff: '', agenda_id: '', target_date: '' });
  const [suggestions, setSuggestions] = useState(null);   // null = not asked, [] = none, [...] = list
  const [noteMsg, setNoteMsg] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  const addItem = (item) => api('/beaiready/training/strategy', { method: 'POST', body: JSON.stringify({
    newsroom_id: clientId, kind, title: item.title, detail: item.detail || null,
    effort: auto ? (item.effort || null) : null, payoff: auto ? (item.payoff || null) : null,
    agenda_id: item.agenda_id || null, target_date: item.target_date || null }) });
  const add = async (e) => {
    e.preventDefault(); if (!draft.title.trim()) return; setErr('');
    try { await addItem(draft); setDraft({ title: '', detail: '', effort: '', payoff: '', agenda_id: '', target_date: '' }); onChanged(); } catch (e) { setErr(e.message); }
  };
  const suggest = async () => {
    setSuggesting(true); setErr(''); setNoteMsg('');
    try { const r = await api('/beaiready/training/strategy/suggest', { method: 'POST', body: JSON.stringify({ kind }) }); setSuggestions(r.suggestions || []); setNoteMsg(r.note || ''); }
    catch (e) { setErr(e.message); }
    setSuggesting(false);
  };
  const addSuggestion = async (i) => { setErr(''); try { await addItem(suggestions[i]); setSuggestions((s) => s.filter((_, j) => j !== i)); onChanged(); } catch (e) { setErr(e.message); } };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ fontSize: 14 }}>{label}</strong><span style={{ fontSize: 12, color: '#8a8076' }}>{hint}</span>
        </div>
        <button type="button" onClick={suggest} disabled={suggesting} style={tag}>{suggesting ? 'Thinking…' : '✨ Suggest with AI'}</button>
      </div>
      {noteMsg && <p style={{ ...muted, marginBottom: 8 }}>{noteMsg}</p>}
      {suggestions && suggestions.length > 0 && (
        <div style={{ ...card, background: '#fbf7f4', borderColor: '#eaddd3', marginBottom: 8, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#c75b39' }}>AI suggestions — from this client's knowledge. Add the ones you want.</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 13 }}>
                <strong>{s.title}</strong>
                {auto && (s.effort || s.payoff) && <span style={{ color: '#8a8076' }}> · effort: {s.effort || '—'} · payoff: {s.payoff || '—'}</span>}
                {s.detail && <div style={{ color: '#6b6359', marginTop: 2 }}>{s.detail}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => addSuggestion(i)} style={tag}>Add</button>
                <button type="button" onClick={() => setSuggestions((x) => x.filter((_, j) => j !== i))} style={{ ...tag, color: '#8a8076' }}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
        {rows.length === 0 ? <p style={muted}>None yet.</p> :
          rows.map((it) => <StrategyItemCard key={it.id} it={it} auto={auto} api={api} agendas={agendas} onChanged={onChanged} setErr={setErr} />)}
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <AgendaSelect agendas={agendas} value={draft.agenda_id} onChange={(v) => setDraft({ ...draft, agenda_id: v })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b63' }}>Target date
            <input type="date" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} style={inp} />
          </label>
        </div>
        <button type="submit" style={{ ...btn, justifySelf: 'start' }}>Add {auto ? 'item' : 'goal'}</button>
      </form>
    </div>
  );
}

function StrategyItemCard({ it, auto, api, agendas, onChanged, setErr }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: it.title, detail: it.detail || '', effort: it.effort || '', payoff: it.payoff || '', agenda_id: it.agenda_id || '', target_date: it.target_date ? it.target_date.slice(0, 10) : '' });
  const save = async () => { setErr(''); try { await api(`/beaiready/training/strategy/${it.id}`, { method: 'PUT', body: JSON.stringify({ title: f.title, detail: f.detail, effort: auto ? (f.effort || null) : null, payoff: auto ? (f.payoff || null) : null, agenda_id: f.agenda_id || null, target_date: f.target_date || null }) }); setEdit(false); onChanged(); } catch (e) { setErr(e.message); } };
  const del = async () => { setErr(''); try { await api(`/beaiready/training/strategy/${it.id}`, { method: 'DELETE' }); onChanged(); } catch (e) { setErr(e.message); } };
  const togglePub = async () => { setErr(''); try { await api(`/beaiready/training/strategy/${it.id}`, { method: 'PUT', body: JSON.stringify({ status: it.status === 'published' ? 'draft' : 'published' }) }); onChanged(); } catch (e) { setErr(e.message); } };
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong>{it.title}</strong>
          <span style={{ ...pill, ...(it.status === 'published' ? pubOn : pubOff), marginLeft: 6 }}>{it.status}</span>
          {auto && it.effort && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359', marginLeft: 6 }}>effort: {it.effort}</span>}
          {auto && it.payoff && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359', marginLeft: 6 }}>payoff: {it.payoff}</span>}
          {it.target_date && <span style={{ ...pill, background: '#fef3c7', color: '#92400e', marginLeft: 6 }}>by {fmtDate(it.target_date)}</span>}
          {it.agenda_title && <span style={{ ...pill, background: '#eef2ff', color: '#3730a3', marginLeft: 6 }}>{it.agenda_title}</span>}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <AgendaSelect agendas={agendas} value={f.agenda_id} onChange={(v) => setF({ ...f, agenda_id: v })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b63' }}>Target date
              <input type="date" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} style={inp} />
            </label>
          </div>
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

// Pick which training (agenda) a material or strategy item belongs to.
function AgendaSelect({ agendas, value, onChange }) {
  const fmt = (d) => (d ? ` · ${new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}` : '');
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5b6b63' }}>
      Training
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={inp}>
        <option value="">— No training —</option>
        {(agendas || []).map((a) => <option key={a.id} value={a.id}>{a.title}{fmt(a.scheduled_for)}</option>)}
      </select>
    </label>
  );
}

// ── Attachments — multiple files on an agenda or material ────────────────────────
// entityType is 'training_agenda_file' | 'training_material_file'. Members download
// via the same route once the parent is published; admins always can.
const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1e3))}KB`);
function Attachments({ entityType, entityId, files, clientId, onChanged, setErr, label }) {
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState('');
  const upload = async (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setBusy(true); setLocalErr('');
    try {
      for (const file of arr) {
        const fd = new FormData();
        fd.append('entity_type', entityType);   // before file (multer reads the dir from it)
        fd.append('entity_id', entityId);
        fd.append('file', file);
        const res = await fetch('/api/beaiready/training/files', { method: 'POST', credentials: 'include', headers: { 'X-Newsroom-Id': clientId }, body: fd });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `upload failed (HTTP ${res.status})`); }
      }
      onChanged();
    } catch (e) { setLocalErr(e.message); }
    setBusy(false);
  };
  const remove = async (id) => {
    setLocalErr('');
    try {
      const res = await fetch(`/api/beaiready/training/files/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-Newsroom-Id': clientId } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Delete failed'); }
      onChanged();
    } catch (e) { setLocalErr(e.message); }
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6b63' }}>{label}</div>}
      {localErr && <div style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 6, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #fecaca' }}>{localErr}</div>}
      {(files || []).length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
          {files.map((f) => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
              <span>📎 {f.name}</span>
              <span style={muted}>{fmtSize(f.size)}</span>
              <a href={`/api/beaiready/training/files/${f.id}/download`} target="_blank" rel="noreferrer" style={{ color: '#c75b39' }}>Open ↗</a>
              <button onClick={() => remove(f.id)} style={{ ...tag, color: '#b91c1c', padding: '2px 8px' }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <label style={{ ...tag, cursor: 'pointer', justifySelf: 'start' }}>
        {busy ? 'Uploading…' : '+ Add PDF(s)'}
        <input type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </label>
    </div>
  );
}

// ── Recommendations (Training + Strategy pillars) ────────────────────────────────
export function RecommendationsSection({ clientId, setErr, pillars = ['training', 'strategy'] }) {
  const api = useApi(clientId);
  const [recs, setRecs] = useState(null);
  const load = useCallback(() => { api('/beaiready/recommendations').then(setRecs).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setRecs(null); load(); }, [load]);
  return (
    <Section title="Recommendations" hint="Prioritised actions shown in the client's dashboard">
      <div style={{ display: 'grid', gap: 12 }}>
        {pillars.map((k) => {
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
const statPill = { fontSize: 13, padding: '5px 12px', borderRadius: 999, background: '#f7ece7', color: '#7a4636' };
const th = { position: 'sticky', top: 0, background: '#faf8f5', textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: '#5b5249', whiteSpace: 'nowrap', borderBottom: '1px solid #e4dcd2', zIndex: 1 };
const td = { padding: '7px 10px', verticalAlign: 'top', color: '#3a342e' };
const cellClamp = { maxWidth: 280, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
