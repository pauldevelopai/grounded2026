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

      {clientId && <TrainingSections clientId={clientId} setErr={setErr} />}
    </div>
  );
}

// Every training section for ONE client, without the page chrome or client picker —
// so the Client cockpit can render the same thing under its Training tab.
export function TrainingSections({ clientId, setErr }) {
  return (
    <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <DashboardRefresh clientId={clientId} setErr={setErr} />
      <HarvestSection clientId={clientId} setErr={setErr} />
      <CompanyKnowledgeSection clientId={clientId} setErr={setErr} />
      {/* Everything about each training in one card: participants, materials, feedback,
          report — instead of separate flat lists that mix the sessions together. */}
      <TrainingsHub clientId={clientId} setErr={setErr} />
      <ExpectationsMatchSection clientId={clientId} setErr={setErr} />
      <RecommendationsSection clientId={clientId} setErr={setErr} pillars={['training']} />
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

// ── Update client dashboard — regenerate the AI analyses the client sees ──────────
// The client's dashboard (team readiness, what-was-covered, expectations vs
// feedback) is AI-generated and cached; it refreshes itself over time, but this
// pushes the latest surveys / materials / feedback live right away.
export function DashboardRefresh({ clientId, setErr }) {
  const api = useApi(clientId);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const run = async () => {
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await api('/beaiready/training/refresh-analysis', { method: 'POST' });
      const bits = ['team readiness'];
      if (r.curriculum) bits.push(`${r.curriculum} session summaries`);
      bits.push(`expectations match${r.has_feedback ? ' (with feedback)' : ''}`);
      setNote(`Updated ✓ — ${bits.join(', ')}. The client sees it now.`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ ...card, background: '#fbf7f4', borderColor: '#eaddd3', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Update the client’s dashboard</div>
        <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
          Regenerate the AI analysis the client sees — team readiness, what the training covered, and how it matched what they
          wanted (with feedback if connected) — from the latest surveys, materials and feedback. It also refreshes on its own over time.
        </div>
        {note && <div style={{ fontSize: 12.5, color: '#166534', marginTop: 6 }}>{note}</div>}
      </div>
      <button type="button" onClick={run} disabled={busy} style={btn}>{busy ? 'Updating…' : 'Update dashboard'}</button>
    </div>
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

// ── Shared building blocks for the per-training grouping ─────────────────────────
// A labelled sub-section inside a training card.
function SubBlock({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#5b5249', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

// The people on a training — from the before/after forms linked to it. `before`/`after`
// badges show which survey each filled. Honest empty state when no form is linked yet.
function Participants({ people }) {
  if (people == null) return <p style={{ ...muted, margin: 0 }}>Loading…</p>;
  if (!people.length) return <p style={{ ...muted, margin: 0 }}>No participants yet — they appear once a before- or after-training form is linked to this training and synced.</p>;
  const dot = { fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.3 };
  return (
    <div>
      <div style={{ ...muted, marginBottom: 6 }}>{people.length} {people.length === 1 ? 'person' : 'people'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {people.map((p) => (
          <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, background: '#faf8f5', border: '1px solid #eee5da', borderRadius: 999, padding: '3px 9px', color: '#3a342e' }}>
            {p.name}
            {p.before && <span title="did the before-training survey" style={{ ...dot, background: '#e7eefb', color: '#2f4b8a' }}>before</span>}
            {p.after && <span title="did the after-training feedback" style={{ ...dot, background: '#dcfce7', color: '#166534' }}>after</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// Connect a Google form (a "before" intake survey or an "after" feedback survey),
// optionally tied to a training via agendaId. Pulls the first responses on connect.
function FormConnect({ clientId, api, formType, agendaId = null, onDone, setErr }) {
  const defaultName = formType === 'feedback' ? 'After-training feedback' : 'Before-training survey';
  const [draft, setDraft] = useState({ form_name: '', csv_url: '' });
  const [busy, setBusy] = useState(false);
  const path = formType === 'feedback' ? '/beaiready/training/feedback-forms' : '/beaiready/training/intake-forms';
  const submit = async (e) => {
    e.preventDefault();
    // Only the link is required — the name defaults, so pasting the link + clicking
    // the button is enough (previously an empty name silently blocked the submit).
    if (!draft.csv_url.trim()) { setErr('Paste the Google Sheet link first.'); return; }
    setBusy(true); setErr('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, form_name: draft.form_name.trim() || defaultName, csv_url: draft.csv_url.trim(), agenda_id: agendaId }) });
      setDraft({ form_name: '', csv_url: '' }); onDone && onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <input value={draft.form_name} onChange={(e) => setDraft({ ...draft, form_name: e.target.value })} placeholder={`${defaultName} (name — optional)`} style={{ ...inp, width: 210 }} />
      {/* maxWidth caps the link field so the button always stays on-screen. */}
      <input value={draft.csv_url} onChange={(e) => setDraft({ ...draft, csv_url: e.target.value })} placeholder="Paste the Google Sheet link (‘anyone with the link’)" style={{ ...inp, flex: '1 1 260px', maxWidth: 440 }} />
      <button type="submit" disabled={busy} style={btn}>{busy ? 'Processing…' : 'Connect & sync'}</button>
    </form>
  );
}

// One training's before- or after-form: the linked form + its own responses, or a
// connect box when none is linked. Responses are filtered to THIS form only, so one
// training's feedback never shows another's.
function TrainingForm({ form, formType, agendaId, responses, api, clientId, onChanged, setErr }) {
  const [busy, setBusy] = useState('');
  const mine = form ? (responses || []).filter((r) => r.form_name === form.form_name) : [];
  const unlink = async () => { setErr(''); setBusy('unlink'); try { await api(`/beaiready/training/intake-forms/${form.id}`, { method: 'PUT', body: JSON.stringify({ agenda_id: '' }) }); onChanged(); } catch (e) { setErr(e.message); } setBusy(''); };
  const sync = async () => {
    setErr(''); setBusy('sync');
    const path = formType === 'feedback' ? '/beaiready/training/feedback-forms/sync' : '/beaiready/training/intake-forms/sync';
    try { await api(path, { method: 'POST' }); onChanged(); } catch (e) { setErr(e.message); } setBusy('');
  };
  if (!form) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <p style={{ ...muted, margin: 0 }}>No {formType === 'feedback' ? 'after-training feedback' : 'before-training'} form linked to this training.</p>
        <FormConnect clientId={clientId} api={api} formType={formType} agendaId={agendaId} onDone={onChanged} setErr={setErr} />
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{form.form_name}</strong>
        <span style={muted}>— {form.response_count} response{form.response_count === 1 ? '' : 's'}{form.last_synced_at ? ` · synced ${new Date(form.last_synced_at).toLocaleString()}` : ''}</span>
        <button onClick={sync} disabled={busy === 'sync'} style={tag}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
        <button onClick={unlink} disabled={busy === 'unlink'} style={{ ...tag, color: '#b91c1c' }}>Unlink</button>
      </div>
      {mine.length > 0 && <IntakeResponses responses={mine} />}
    </div>
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

// ── Materials for ONE training — the linked materials + an inline "add" form ──────
function TrainingMaterials({ agendaId, mats, api, clientId, agendas, onChanged, setErr }) {
  const [adding, setAdding] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {mats.length === 0 ? <p style={{ ...muted, margin: 0 }}>No materials linked to this training yet.</p> :
        mats.map((m) => <MaterialCard key={m.id} m={m} api={api} clientId={clientId} agendas={agendas} onChanged={onChanged} setErr={setErr} />)}
      {adding
        ? <NewMaterialForm agendaId={agendaId} api={api} clientId={clientId} onDone={() => { setAdding(false); onChanged(); }} setErr={setErr} />
        : <button type="button" onClick={() => setAdding(true)} style={{ ...tag, justifySelf: 'start' }}>+ Add material to this training</button>}
    </div>
  );
}

// Create a material already linked to a training (agendaId fixed). Attaches any PDFs.
function NewMaterialForm({ agendaId, api, clientId, onDone, setErr }) {
  const [draft, setDraft] = useState({ title: '', kind: 'doc', url: '', description: '', content: '', rag_shareable: true });
  const [pendingFiles, setPendingFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const create = async (e) => {
    e.preventDefault(); if (!draft.title.trim()) return; setErr(''); setBusy(true);
    let m;
    try { m = await api('/beaiready/training/materials', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, ...draft, agenda_id: agendaId }) }); }
    catch (e) { setErr(`Couldn't add the material: ${e.message}`); setBusy(false); return; }
    try {
      for (const file of pendingFiles) {
        const fd = new FormData(); fd.append('entity_type', 'training_material_file'); fd.append('entity_id', m.id); fd.append('file', file);
        const res = await fetch('/api/beaiready/training/files', { method: 'POST', credentials: 'include', headers: { 'X-Newsroom-Id': clientId }, body: fd });
        if (!res.ok) { const er = await res.json().catch(() => ({})); throw new Error(er.message || `upload failed (HTTP ${res.status})`); }
      }
    } catch (fileErr) { setErr(`Material added — but a PDF didn't upload: ${fileErr.message}. Add it on the material below.`); }
    setBusy(false); onDone();
  };
  return (
    <form onSubmit={create} style={{ ...card, display: 'grid', gap: 8, background: '#fbf7f4' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. Session 1 — slides)" style={{ ...inp, flex: 1 }} />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} style={inp}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Link (optional)" style={inp} />
      </div>
      <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short description" style={inp} />
      <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Body / notes (what the knowledge base learns from)" style={{ ...inp, minHeight: 56 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ ...tag, cursor: 'pointer' }}>
          {pendingFiles.length ? `${pendingFiles.length} PDF${pendingFiles.length === 1 ? '' : 's'} — add more` : '+ Attach PDF(s)'}
          <input type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" multiple style={{ display: 'none' }}
            onChange={(e) => { setPendingFiles((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
        </label>
        {pendingFiles.length > 0 && <span style={{ fontSize: 12, color: '#6b6359' }}>{pendingFiles.map((f) => f.name).join(', ')}</span>}
        <label style={chk}><input type="checkbox" checked={draft.rag_shareable} onChange={(e) => setDraft({ ...draft, rag_shareable: e.target.checked })} /> Feed this client's private AI</label>
      </div>
      <button type="submit" disabled={busy} style={{ ...btn, justifySelf: 'start' }}>{busy ? 'Adding…' : 'Add material'}</button>
    </form>
  );
}

// ── Training vs what the team wanted (ADMIN, honest — includes gaps) ──────────────
// The same /expectations-match analysis the client sees, but the admin request
// (role=admin) returns the candid admin_summary + the "gaps" the client view hides.
function ExpectationsMatchSection({ clientId, setErr }) {
  const api = useApi(clientId);
  const [m, setM] = useState(undefined);
  useEffect(() => {
    setM(undefined);
    api('/beaiready/training/expectations-match').then(setM).catch((e) => { setErr(e.message); setM(null); });
  }, [api, setErr]);
  const statusColor = (s) => (s === 'delivered' ? ['#dcfce7', '#166534'] : s === 'gap' ? ['#fee2e2', '#991b1b'] : ['#fef3c7', '#92400e']);
  return (
    <Section title="Training vs what the team wanted" hint="Honest match — the client sees a positive version of this (without the gaps below)">
      {m === undefined ? <p style={muted}>Analysing…</p>
        : (m === null || (!m.summary && !(m.matches || []).length)) ? <p style={muted}>Needs the intake survey plus indexed session materials (run Harvest, then open the client’s training page once).</p>
        : (
          <div style={{ ...card, display: 'grid', gap: 12 }}>
            {m.summary && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: '#3a342e' }}>{m.summary}</p>}
            <div style={{ display: 'grid', gap: 5 }}>
              {(m.matches || []).map((x, i) => {
                const [bg, fg] = statusColor(x.status);
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'start', fontSize: 13 }}>
                    <span style={{ ...pill, background: bg, color: fg }}>{x.status}</span>
                    <div><strong>{x.expectation}</strong>
                      {x.wanted_by ? <span style={muted}> · {x.wanted_by} wanted</span> : null}
                      {x.covered_in ? ` → ${x.covered_in}` : ''}
                      {x.feedback && <div style={{ color: '#6b6359', marginTop: 2, fontStyle: 'italic' }}>Feedback: {x.feedback}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {m.gaps?.length > 0 && (
              <div style={{ borderTop: '1px solid #f0ebe3', paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Gaps — wanted, not covered · client does NOT see this
                </div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 3 }}>
                  {m.gaps.map((g, i) => <li key={i} style={{ fontSize: 13, color: '#5b5249' }}>{g}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
    </Section>
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

// ── Trainings hub — one card per training, everything about it grouped together ───
// Loads agendas, materials, forms, participants and the survey responses once, then
// renders a card per training composing: header + report (AgendaCard), participants,
// materials, and the before/after feedback forms — each scoped to that training so the
// sessions never blur together. An "unassigned" area links stray forms/materials to a
// training, and the create form adds a new one.
function TrainingsHub({ clientId, setErr }) {
  const api = useApi(clientId);
  const [agendas, setAgendas] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [forms, setForms] = useState([]);
  const [participants, setParticipants] = useState({});
  const [intakeResp, setIntakeResp] = useState([]);
  const [feedbackResp, setFeedbackResp] = useState([]);
  const [draft, setDraft] = useState({ title: '', scheduled_for: '', location: '', items: '', gdocUrl: '' });
  const [pendingFiles, setPendingFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback(() => {
    api('/beaiready/training/agendas').then(setAgendas).catch((e) => setNote({ ok: false, text: `Couldn't load trainings: ${e.message}` }));
    api('/beaiready/training/materials').then(setMaterials).catch(() => setMaterials([]));
    api('/beaiready/training/forms').then(setForms).catch(() => setForms([]));
    api('/beaiready/training/participants').then(setParticipants).catch(() => setParticipants({}));
    api('/beaiready/training/intake-responses').then(setIntakeResp).catch(() => setIntakeResp([]));
    api('/beaiready/training/feedback-responses').then(setFeedbackResp).catch(() => setFeedbackResp([]));
  }, [api]);
  useEffect(() => { setAgendas(null); load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!draft.title.trim()) { setNote({ ok: false, text: 'Enter a training title first.' }); return; }
    setNote({ ok: true, text: 'Adding…' }); setBusy(true);
    let a;
    try {
      a = await api('/beaiready/training/agendas', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, title: draft.title, scheduled_for: draft.scheduled_for || null, location: draft.location || null, items: textToItems(draft.items) }) });
    } catch (e) { setNote({ ok: false, text: `Couldn't create the training: ${e.message}` }); setBusy(false); return; }
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
      ? { ok: false, text: `Training “${a.title}” added — but some documents didn't attach: ${problems.join('; ')}. Add them on the training above.` }
      : { ok: true, text: `Training “${a.title}” added ✓` });
    load();
    setBusy(false);
  };

  const unlinkedMats = (materials || []).filter((m) => !m.agenda_id);
  const unlinkedForms = (forms || []).filter((f) => !f.agenda_id);

  return (
    <Section title="Trainings" hint="Each training in one place — its participants, materials, feedback and report">
      <div style={{ display: 'grid', gap: 16, marginBottom: 14 }}>
        {agendas == null ? <p style={muted}>Loading…</p> : agendas.length === 0 ? <p style={muted}>No trainings yet — add one below.</p> :
          agendas.map((a) => (
            <TrainingCard key={a.id} agenda={a} api={api} clientId={clientId} agendas={agendas}
              mats={(materials || []).filter((m) => m.agenda_id === a.id)} forms={forms || []}
              people={participants[a.id] ?? []} intakeResp={intakeResp} feedbackResp={feedbackResp}
              onChanged={load} setErr={setErr} />
          ))}
      </div>

      {(unlinkedForms.length > 0 || unlinkedMats.length > 0) && (
        <div style={{ ...card, background: '#fbf7f4', borderColor: '#eaddd3', display: 'grid', gap: 10, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Not linked to a training</div>
          <p style={{ ...muted, margin: 0 }}>Assign these to a training so they show under the right session.</p>
          {unlinkedForms.map((f) => <LinkFormRow key={f.id} form={f} agendas={agendas || []} api={api} onChanged={load} setErr={setErr} />)}
          {unlinkedMats.map((m) => <MaterialCard key={m.id} m={m} api={api} clientId={clientId} agendas={agendas || []} onChanged={load} setErr={setErr} />)}
        </div>
      )}

      <form onSubmit={create} style={{ ...card, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>New training</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. AI Day 1)" style={{ ...inp, flex: 1 }} />
          <input type="date" value={draft.scheduled_for} onChange={(e) => setDraft({ ...draft, scheduled_for: e.target.value })} style={inp} />
          <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Location" style={inp} />
        </div>
        <textarea value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} placeholder={'One item per line:  09:00 | Topic | detail (optional if you attach a doc)'} style={{ ...inp, minHeight: 64 }} />
        <div style={{ borderTop: '1px solid #f0ebe3', paddingTop: 8, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6b63' }}>Agenda document(s) (optional) — the agenda PDF + handouts. (The training report is added on the training once it’s created.)</div>
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
        <button type="submit" disabled={busy} style={{ ...btn, justifySelf: 'start' }}>{busy ? 'Adding…' : 'Add training'}</button>
      </form>
    </Section>
  );
}

// One training, everything grouped: header + report (AgendaCard), then participants,
// materials, and the after/before survey forms — each scoped to this training.
function TrainingCard({ agenda, api, clientId, agendas, mats, forms, people, intakeResp, feedbackResp, onChanged, setErr }) {
  const afterForm = forms.find((f) => f.form_type === 'feedback' && f.agenda_id === agenda.id);
  const beforeForm = forms.find((f) => f.form_type === 'intake' && f.agenda_id === agenda.id);
  return (
    <div style={{ border: '1px solid #e4dcd2', borderRadius: 14, padding: 4, background: '#fcfaf7' }}>
      <AgendaCard agenda={agenda} api={api} clientId={clientId} onChanged={onChanged} setErr={setErr} />
      <div style={{ padding: '12px 14px 6px', display: 'grid', gap: 16 }}>
        <SubBlock label="👥 Participants"><Participants people={people} /></SubBlock>
        <SubBlock label="📚 Materials">
          <TrainingMaterials agendaId={agenda.id} mats={mats} api={api} clientId={clientId} agendas={agendas} onChanged={onChanged} setErr={setErr} />
        </SubBlock>
        <SubBlock label="📝 After-training feedback">
          <TrainingForm form={afterForm} formType="feedback" agendaId={agenda.id} responses={feedbackResp} api={api} clientId={clientId} onChanged={onChanged} setErr={setErr} />
        </SubBlock>
        <SubBlock label="🗒️ Before-training survey">
          <TrainingForm form={beforeForm} formType="intake" agendaId={agenda.id} responses={intakeResp} api={api} clientId={clientId} onChanged={onChanged} setErr={setErr} />
        </SubBlock>
      </div>
    </div>
  );
}

// A stray form (before/after) with a picker to link it to a training.
function LinkFormRow({ form, agendas, api, onChanged, setErr }) {
  const link = async (aid) => { if (!aid) return; setErr(''); try { await api(`/beaiready/training/intake-forms/${form.id}`, { method: 'PUT', body: JSON.stringify({ agenda_id: aid }) }); onChanged(); } catch (e) { setErr(e.message); } };
  const after = form.form_type === 'feedback';
  return (
    <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div style={{ fontSize: 13 }}>
        <span style={{ ...pill, background: after ? '#dcfce7' : '#e7eefb', color: after ? '#166534' : '#2f4b8a' }}>{after ? 'After' : 'Before'}</span>
        <strong style={{ marginLeft: 6 }}>{form.form_name}</strong> <span style={muted}>— {form.response_count} response{form.response_count === 1 ? '' : 's'}</span>
      </div>
      <AgendaSelect agendas={agendas} value="" onChange={link} />
    </div>
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
      {agenda.status !== 'published' && (
        <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '5px 9px', marginTop: 8 }}>
          Draft — not visible to the client yet. Click <strong>Publish</strong> to show it on their training page.
        </div>
      )}
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

// ── Materials (RAG-ingested) — created inline per training via NewMaterialForm ────
const KINDS = ['doc', 'slide', 'video', 'link', 'exercise'];

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
