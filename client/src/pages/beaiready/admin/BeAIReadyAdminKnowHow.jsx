// BeAIReadyAdminKnowHow — the KnowHow capture surface in the BE AI READY admin.
// KnowHow replaces BetterBoss: it captures the institutional knowledge inside an
// experienced employee's head. Pulse sends capture questions (login-free links);
// answers + ingested documents accumulate into a per-tenant corpus. This page is
// the capture slice only — topics, people, questions, documents, and the live
// corpus count filling up. No agent / retrieval here yet (that's Part C).
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

export default function BeAIReadyAdminKnowHow() {
  const [tenants, setTenants] = useState(null);
  const [tid, setTid] = useState('');
  const [ov, setOv] = useState(null);
  const [responses, setResponses] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback((id) => {
    if (!id) return;
    apiFetch(`/knowhow/tenants/${id}/overview`).then(setOv).catch((e) => setErr(e.message));
    apiFetch(`/knowhow/tenants/${id}/responses`).then(setResponses).catch(() => setResponses([]));
  }, []);

  useEffect(() => {
    apiFetch('/knowhow/tenants').then((rows) => {
      setTenants(rows);
      if (rows.length) { setTid(rows[0].id); }
    }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(tid); }, [tid, load]);

  const flash = (m) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 4000); };
  const fail = (e) => setErr(typeof e === 'string' ? e : e.message);

  if (tenants == null) return <div style={{ padding: 4 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>KnowHow</h1>
        <select value={tid} onChange={(e) => setTid(e.target.value)} style={sel}>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.product}</option>)}
        </select>
      </div>
      <p style={{ color: '#6b6359', margin: '6px 0 16px', maxWidth: '70ch' }}>
        Capture the hard-won expertise inside your team's heads. Add the people and the topics, let Pulse draft
        capture questions, send each person a login-free link, and watch the corpus fill. (The corpus is the asset
        — answering questions over it, and coaching juniors, comes next.)
      </p>

      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      {/* ── Corpus counter — the value story ── */}
      {ov && (
        <section style={{ ...card, background: '#1c1b1a', color: '#f3ede6', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            <Stat n={ov.corpus.pieces} label="pieces captured" />
            <Stat n={ov.corpus.topics} label="topics" />
            <Stat n={ov.corpus.people} label="people" />
            <Stat n={ov.corpus.consented} label="consented" />
          </div>
          {ov.corpus.byTopic?.some((t) => t.pieces > 0) && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: '#bcb3a8' }}>
              {ov.corpus.byTopic.filter((t) => t.pieces > 0).map((t) => `${t.label} (${t.pieces})`).join(' · ')}
            </div>
          )}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        {ov && <People tid={tid} people={ov.people} reload={() => load(tid)} flash={flash} fail={fail} />}
        {ov && <Topics tid={tid} topics={ov.topics} reload={() => load(tid)} flash={flash} fail={fail} />}
      </div>

      {ov && <Capture tid={tid} ov={ov} reload={() => load(tid)} flash={flash} fail={fail} />}
      {ov && <Documents tid={tid} topics={ov.topics} reload={() => load(tid)} flash={flash} fail={fail} />}
      <Answers responses={responses} />
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: '#e08a64' }}>{n ?? 0}</div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9a9087', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function People({ tid, people, reload, flash, fail }) {
  const [f, setF] = useState({ name: '', role: '', seniority: 'senior', email_or_handle: '' });
  const add = async () => {
    if (!f.name.trim()) return fail('Name required');
    try { await apiFetch(`/knowhow/tenants/${tid}/people`, { method: 'POST', body: JSON.stringify(f) });
      setF({ name: '', role: '', seniority: 'senior', email_or_handle: '' }); flash('Person added'); reload(); }
    catch (e) { fail(e); }
  };
  return (
    <section style={card}>
      <h2 style={h2}>People <span style={count}>{people.length}</span></h2>
      <ul style={list}>
        {people.map((p) => (
          <li key={p.id} style={row}>
            <span><strong>{p.name}</strong>{p.role ? ` · ${p.role}` : ''}{p.seniority ? ` · ${p.seniority}` : ''}</span>
            <span style={{ fontSize: 11, color: p.consent_at ? '#16a34a' : '#a89e92' }}>{p.consent_at ? 'consented' : 'no consent yet'}</span>
          </li>
        ))}
        {people.length === 0 && <li style={{ color: '#a89e92', fontSize: 13 }}>No people yet.</li>}
      </ul>
      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <input style={inp} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={{ ...inp, flex: 1 }} placeholder="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          <select style={{ ...inp, width: 120 }} value={f.seniority} onChange={(e) => setF({ ...f, seniority: e.target.value })}>
            <option value="senior">senior</option><option value="lead">lead</option><option value="mid">mid</option><option value="junior">junior</option>
          </select>
        </div>
        <button style={btn} onClick={add}>Add person</button>
      </div>
    </section>
  );
}

function Topics({ tid, topics, reload, flash, fail }) {
  const [f, setF] = useState({ label: '', description: '' });
  const add = async () => {
    if (!f.label.trim()) return fail('Label required');
    try { await apiFetch(`/knowhow/tenants/${tid}/topics`, { method: 'POST', body: JSON.stringify(f) });
      setF({ label: '', description: '' }); flash('Topic added'); reload(); }
    catch (e) { fail(e); }
  };
  return (
    <section style={card}>
      <h2 style={h2}>Topics <span style={count}>{topics.length}</span></h2>
      <ul style={list}>
        {topics.map((t) => (
          <li key={t.id} style={row}><span><strong>{t.label}</strong>{t.description ? <span style={{ color: '#6b6359' }}> — {t.description}</span> : ''}</span></li>
        ))}
        {topics.length === 0 && <li style={{ color: '#a89e92', fontSize: 13 }}>No topics yet.</li>}
      </ul>
      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <input style={inp} placeholder="Topic label (e.g. tender qualification)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <input style={inp} placeholder="Short description (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <button style={btn} onClick={add}>Add topic</button>
      </div>
    </section>
  );
}

function Capture({ tid, ov, reload, flash, fail }) {
  const [topicId, setTopicId] = useState('');
  const [personId, setPersonId] = useState('');
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState({});      // prompt id -> bool
  const [link, setLink] = useState('');

  const generate = async () => {
    if (!topicId) return fail('Pick a topic first');
    setBusy(true);
    try {
      const r = await apiFetch(`/knowhow/tenants/${tid}/prompts/generate`, { method: 'POST', body: JSON.stringify({ topic_id: topicId, person_id: personId || null }) });
      flash(`${r.created.length} question${r.created.length === 1 ? '' : 's'} drafted${r.tip ? ` · ${r.tip}` : ''}`); reload();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const send = async () => {
    const ids = Object.keys(sel).filter((k) => sel[k]);
    if (!ids.length) return fail('Select the questions to send');
    try {
      const r = await apiFetch(`/knowhow/tenants/${tid}/prompts/send`, { method: 'POST', body: JSON.stringify({ prompt_ids: ids }) });
      setLink(`${window.location.origin}${r.path}`); setSel({}); flash(`Link created for ${r.count} question${r.count === 1 ? '' : 's'}`); reload();
    } catch (e) { fail(e); }
  };
  const act = async (id, action) => { try { await apiFetch(`/knowhow/prompts/${id}/${action}`, { method: 'POST' }); reload(); } catch (e) { fail(e); } };

  const sendable = (ov.prompts || []).filter((p) => p.status === 'draft' || p.status === 'vetted');
  const sent = (ov.prompts || []).filter((p) => p.status === 'sent' || p.status === 'answered');

  return (
    <section style={{ ...card, marginTop: 16 }}>
      <h2 style={h2}>Capture questions</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select style={{ ...inp, minWidth: 200 }} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Topic…</option>
          {ov.topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select style={{ ...inp, minWidth: 180 }} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Anyone</option>
          {ov.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button style={btn} onClick={generate} disabled={busy}>{busy ? 'Drafting…' : 'Generate questions'}</button>
      </div>

      {sendable.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076', margin: '4px 0 6px' }}>Drafts — select and send as one link</div>
          <ul style={list}>
            {sendable.map((p) => (
              <li key={p.id} style={{ ...row, alignItems: 'flex-start' }}>
                <label style={{ display: 'flex', gap: 8, cursor: 'pointer', flex: 1 }}>
                  <input type="checkbox" checked={!!sel[p.id]} onChange={(e) => setSel({ ...sel, [p.id]: e.target.checked })} />
                  <span style={{ fontSize: 13.5 }}>{p.text}<span style={{ color: '#a89e92' }}>{p.topic_label ? ` · ${p.topic_label}` : ''}{p.person_name ? ` · ${p.person_name}` : ''} · {p.status}</span></span>
                </label>
                <button style={linkBtn} onClick={() => act(p.id, 'archive')}>archive</button>
              </li>
            ))}
          </ul>
          <button style={{ ...btn, marginTop: 8 }} onClick={send}>Send selected as one link</button>
        </>
      )}

      {link && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#faf3ef', border: '1px solid #ecdcd2', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#8a8076', marginBottom: 4 }}>Send this login-free link to the person:</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={link} style={{ ...inp, flex: 1 }} onFocus={(e) => e.target.select()} />
            <button style={btn} onClick={() => { navigator.clipboard?.writeText(link); flash('Copied'); }}>Copy</button>
          </div>
        </div>
      )}

      {sent.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076', margin: '14px 0 6px' }}>Sent / answered</div>
          <ul style={list}>
            {sent.map((p) => (
              <li key={p.id} style={row}>
                <span style={{ fontSize: 13 }}>{p.text}</span>
                <span style={{ fontSize: 11, color: p.status === 'answered' ? '#16a34a' : '#a89e92' }}>{p.status}{p.response_count ? ` · ${p.response_count} answer${p.response_count === 1 ? '' : 's'}` : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Documents({ tid, topics, reload, flash, fail }) {
  const [f, setF] = useState({ title: '', topic_id: '', text: '' });
  const [busy, setBusy] = useState(false);
  const ingest = async () => {
    if (!f.title.trim() || !f.text.trim()) return fail('Title and document text required');
    setBusy(true);
    try {
      const r = await apiFetch(`/knowhow/tenants/${tid}/documents`, { method: 'POST', body: JSON.stringify(f) });
      setF({ title: '', topic_id: '', text: '' }); flash(`Document ingested — ${r.pieces} piece${r.pieces === 1 ? '' : 's'} added`); reload();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  return (
    <section style={{ ...card, marginTop: 16 }}>
      <h2 style={h2}>Add a document</h2>
      <p style={{ fontSize: 12.5, color: '#6b6359', margin: '0 0 10px', maxWidth: '64ch' }}>
        The secondary capture channel — paste a document's text (SOPs, playbooks, briefs). Text is stored as-is
        (no vision retyping); binary PDFs/DOCX come in Part C. Each paragraph becomes a corpus piece.
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={{ ...inp, flex: 1 }} placeholder="Document title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <select style={{ ...inp, width: 200 }} value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })}>
            <option value="">Topic (optional)…</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <textarea style={{ ...inp, minHeight: 120, resize: 'vertical' }} placeholder="Paste the document text here…" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <button style={btn} onClick={ingest} disabled={busy}>{busy ? 'Ingesting…' : 'Ingest document'}</button>
      </div>
    </section>
  );
}

function Answers({ responses }) {
  return (
    <section style={{ ...card, marginTop: 16 }}>
      <h2 style={h2}>Recent answers <span style={count}>{responses.length}</span></h2>
      {responses.length === 0 ? (
        <p style={{ color: '#a89e92', fontSize: 13, margin: 0 }}>Answers will appear here as people respond to their links.</p>
      ) : (
        <ul style={list}>
          {responses.map((r) => (
            <li key={r.id} style={{ ...row, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, color: '#8a8076' }}>{r.person_name || 'someone'}{r.topic_label ? ` · ${r.topic_label}` : ''} — {r.prompt_text}</span>
              <span style={{ fontSize: 13.5 }}>{r.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const h2 = { fontSize: 15, fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 };
const count = { fontSize: 11, fontWeight: 700, color: '#c75b39', background: '#f7ece7', borderRadius: 999, padding: '1px 8px' };
const list = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 7 };
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingBottom: 7, borderBottom: '1px solid #f4efe8' };
const inp = { padding: '8px 10px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: '#1c1b1a' };
const sel = { padding: '7px 10px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' };
const btn = { padding: '8px 14px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const linkBtn = { background: 'none', border: 'none', color: '#a89e92', fontSize: 11.5, cursor: 'pointer', padding: 0 };
const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
