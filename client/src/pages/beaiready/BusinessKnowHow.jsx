// BusinessKnowHow — /dashboard/knowhow. KnowHow is one tool: your team asks its AI
// (grounded in your own knowledge), you add your documents/website/notes, and you
// capture the procedures in people's heads as workflows. Everything a member does
// here is scoped server-side to their own business. Three tabs:
//   • Ask          — the pooled company AI assistant (/beaiready/workspace/*)
//   • Your knowledge — documents / website / notes that ground the AI (/beaiready/knowhow/sources*)
//   • My know-how   — my workflows + the knowledge accrued from my use (/beaiready/knowhow/*)
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getActiveNewsroomId } from '../../hooks/useApi.js';

const TABS = [
  { key: 'ask', label: 'Ask' },
  { key: 'knowledge', label: 'Your knowledge' },
  { key: 'workflows', label: 'My know-how' },
  { key: 'publish', label: 'Publish' },
];

const SOURCE_LABEL = { document: 'your documents', knowledge: 'company knowledge', pattern: 'sector pattern', team_history: 'earlier team Q&A' };
const KIND_LABEL = { doc: 'Document', website: 'Website', note: 'Note' };

export default function BusinessKnowHow() {
  const [tab, setTab] = useState('ask');
  const [err, setErr] = useState('');

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · Knowledge</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>KnowHow</h1>
      <p style={{ color: '#6b6359', maxWidth: '70ch', marginBottom: 16 }}>
        Your team's AI, grounded in your <b>own</b> knowledge. Ask anything and every answer is kept so the
        business builds on it; add your documents, website and notes so the AI knows how you really work; and
        capture the know-how in people's heads as workflows. Nothing leaves your company.
      </p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eee5da', marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setErr(''); setTab(t.key); }}
            style={{ ...tabBtn, ...(tab === t.key ? tabActive : {}) }}>{t.label}</button>
        ))}
      </div>

      {err && <div style={banner}>{err}</div>}

      {tab === 'ask' && <AskPanel setErr={setErr} />}
      {tab === 'knowledge' && <KnowledgePanel setErr={setErr} />}
      {tab === 'workflows' && <WorkflowsPanel setErr={setErr} />}
      {tab === 'publish' && <PublishPanel setErr={setErr} />}
    </div>
  );
}

// ── Publish — the outward AI-ready export bundle for the business's own website ───
const EXPORT_CRAWLERS = ['ClaudeBot', 'GPTBot', 'PerplexityBot', 'CCBot', 'Google-Extended', '*'];
function PublishPanel({ setErr }) {
  const [settings, setSettings] = useState(null);
  const [publishable, setPublishable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');

  const load = useCallback(() => {
    apiFetch('/beaiready/knowhow/settings')
      .then((d) => { setSettings(d.settings || { org_name: '', site_url: '', crawlers: {} }); setPublishable(d.publishable || 0); })
      .catch((e) => setErr(e.message));
  }, [setErr]);
  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const setCrawler = (bot, v) => setSettings((s) => ({ ...s, crawlers: { ...(s.crawlers || {}), [bot]: v } }));
  const save = async () => {
    setBusy(true); setErr(''); setSaved('');
    try { await apiFetch('/beaiready/knowhow/settings', { method: 'PUT', body: JSON.stringify(settings) }); setSaved('Saved.'); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!settings) return <p style={muted}>Loading…</p>;
  return (
    <>
      <p style={{ ...muted, maxWidth: '70ch', marginTop: 0 }}>
        Publish selected knowledge as a bundle you put on your <b>own public website</b>, so AI systems read and
        cite your business correctly. Only sources you mark <b>Publish</b> in “Your knowledge” are included —
        never anything marked sensitive. Opt-in, never automatic.
      </p>

      <div style={{ ...card, marginBottom: 14, display: 'grid', gap: 8 }}>
        <div style={kicker}>Site details</div>
        <input value={settings.org_name || ''} onChange={(e) => setField('org_name', e.target.value)} placeholder="Business name" style={input} />
        <input value={settings.site_url || ''} onChange={(e) => setField('site_url', e.target.value)} placeholder="https://your-business.co.za" style={input} />
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={kicker}>AI crawler policy (robots.txt)</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {EXPORT_CRAWLERS.map((bot) => (
            <div key={bot} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{bot === '*' ? 'All others (*)' : bot}</span>
              {['allow', 'disallow'].map((v) => (
                <label key={v} style={{ fontSize: 13, color: '#5b5249' }}>
                  <input type="radio" name={`cr-${bot}`} checked={((settings.crawlers || {})[bot] || 'allow') === v} onChange={() => setCrawler(bot, v)} /> {v}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy} style={btn}>{busy ? 'Saving…' : 'Save settings'}</button>
        <a href="/api/beaiready/knowhow/bundle" style={{ ...btn, textDecoration: 'none', background: publishable ? '#166534' : '#b8b2a8', pointerEvents: publishable ? 'auto' : 'none' }}>
          Download bundle{publishable ? ` (${publishable})` : ''}
        </a>
        {saved && <span style={{ ...muted, color: '#166534' }}>{saved}</span>}
      </div>
      <p style={{ ...muted, fontSize: 12, marginTop: 8 }}>
        {publishable ? `${publishable} item(s) marked Publish will be in the bundle (llms.txt, robots.txt, JSON-LD, markdown mirrors).`
          : 'Nothing marked Publish yet — go to Your knowledge and hit Publish on the sources you want AI to cite.'}
      </p>
    </>
  );
}

// ── Ask — the pooled company AI assistant ────────────────────────────────────────
function AskPanel({ setErr }) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    apiFetch(`/beaiready/workspace/interactions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
      .then(setList).catch((e) => setErr(e.message));
  }, [q, setErr]);
  useEffect(() => { load(); }, [load]);

  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true); setErr(''); setAnswer(null);
    try {
      const r = await apiFetch('/beaiready/workspace/ask', { method: 'POST', body: JSON.stringify({ question: question.trim() }) });
      setAnswer(r); setQuestion(''); load();
    } catch (e) { setErr(e.message); }
    setAsking(false);
  };
  const act = async (fn) => { setErr(''); try { await fn(); load(); } catch (e) { setErr(e.message); } };
  const pin = (id) => act(() => apiFetch(`/beaiready/workspace/interactions/${id}/pin`, { method: 'POST' }));
  const del = (id) => act(() => apiFetch(`/beaiready/workspace/interactions/${id}`, { method: 'DELETE' }));

  return (
    <>
      <form onSubmit={ask} style={{ ...card, display: 'grid', gap: 10 }}>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask anything about how your business works, your tools, your policies…"
          style={{ ...input, minHeight: 70, fontSize: 15 }} />
        <div><button type="submit" disabled={asking || !question.trim()} style={btn}>{asking ? 'Thinking…' : 'Ask the company AI'}</button></div>
      </form>

      {answer && (
        <div style={{ ...card, borderColor: '#eaddd3', background: '#fbf7f4', marginTop: 12 }}>
          <div style={kicker}>Answer</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.55, color: '#2a2520' }}>{answer.answer}</div>
          <SourceChips sources={answer.sources} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '28px 0 10px', gap: 10, flexWrap: 'wrap' }}>
        <div className="hub-section-label" style={{ margin: 0 }}>The team's shared AI history</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the history…" style={{ ...input, maxWidth: 260 }} />
      </div>

      {list == null ? <p style={muted}>Loading…</p> : list.length === 0 ? (
        <p style={muted}>No questions yet — the first answers from your team will collect here.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((it) => (
            <div key={it.id} style={{ ...card, ...(it.is_pinned ? { borderColor: '#e6b8a6' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{it.is_pinned && <span title="Pinned" style={{ color: '#c75b39' }}>★ </span>}{it.question}</div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => pin(it.id)} style={tag} title="Pin as useful — your consultant reviews pinned answers">{it.is_pinned ? 'Unpin' : 'Pin'}</button>
                  {it.promoted && <span style={{ ...tag, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}>✓ in knowledge</span>}
                  <button onClick={() => del(it.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
                </div>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.5, color: '#5b5249', margin: '6px 0 0' }}>{it.answer}</div>
              <SourceChips sources={it.sources} />
              <div style={{ fontSize: 11.5, color: '#a89e92', marginTop: 6 }}>
                {it.asked_by ? `Asked by ${it.asked_by}` : 'Asked'} · {new Date(it.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Your knowledge — documents / website / notes that ground the AI ──────────────
function KnowledgePanel({ setErr }) {
  const [sources, setSources] = useState(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [sq, setSq] = useState('');
  const [results, setResults] = useState(null);
  const [urls, setUrls] = useState('');
  const [sitemap, setSitemap] = useState('');
  const [driveFolder, setDriveFolder] = useState('');
  const [caps, setCaps] = useState({ drive: false });
  const [bulkMsg, setBulkMsg] = useState('');

  const load = useCallback(() => {
    apiFetch('/beaiready/knowhow/sources').then(setSources).catch((e) => setErr(e.message));
  }, [setErr]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch('/beaiready/knowhow/sources/capabilities').then(setCaps).catch(() => {}); }, []);

  const runBulk = async (path, body, label) => {
    setBusy(true); setErr(''); setBulkMsg(`Fetching + indexing ${label}…`);
    try {
      const r = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      setBulkMsg(`Added ${r.added || 0}${r.failed ? `, ${r.failed} failed` : ''} — indexing now.`);
      load();
    } catch (e) { setErr(e.message); setBulkMsg(''); }
    setBusy(false);
  };

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f, f.name));
      const headers = {};
      const nid = getActiveNewsroomId();
      if (nid) headers['X-Newsroom-Id'] = nid;
      const res = await fetch('/api/beaiready/knowhow/sources/upload', { method: 'POST', body: fd, credentials: 'include', headers });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || 'Upload failed'); }
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const addWebsite = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/knowhow/sources/website', { method: 'POST', body: JSON.stringify({ url: url.trim() }) }); setUrl(''); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const addNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/knowhow/sources/note', { method: 'POST', body: JSON.stringify({ title: noteTitle.trim(), text: noteText.trim() }) }); setNoteTitle(''); setNoteText(''); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const del = async (id) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/sources/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };
  const patch = async (id, changes) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/sources/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }); load(); } catch (e) { setErr(e.message); } };
  const doSearch = async (e) => {
    e.preventDefault();
    if (!sq.trim()) { setResults(null); return; }
    setErr('');
    try { const r = await apiFetch(`/beaiready/knowhow/sources/search?q=${encodeURIComponent(sq.trim())}`); setResults(r.results || []); }
    catch (e) { setErr(e.message); }
  };

  return (
    <>
      <p style={{ ...muted, maxWidth: '68ch', marginTop: 0 }}>
        Add the documents, pages and notes that describe how your business works. Each is split into passages and
        indexed so the AI in <b>Ask</b> can find the right part of a long document — read in code, never guessed.
        The originals stay yours.
      </p>

      <form onSubmit={doSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Search your knowledge…" style={input} />
        <button type="submit" style={btn}>Search</button>
        {results != null && <button type="button" onClick={() => { setSq(''); setResults(null); }} style={tag}>Clear</button>}
      </form>
      {results != null && (
        <div style={{ marginBottom: 20 }}>
          {results.length === 0 ? <p style={muted}>No matching passages found.</p> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {results.map((r, i) => (
                <div key={i} style={{ ...card, background: '#fbf7f4', borderColor: '#eaddd3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 13.5 }}>{r.title}</strong>
                    <span style={{ ...muted, fontSize: 11 }}>{Math.round((r.score || 0) * 100)}% match</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0', lineHeight: 1.5 }}>{r.snippet}…</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={kicker}>Add files</div>
        <label style={{ ...btn, display: 'inline-block', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Working…' : 'Choose files…'}
          <input type="file" multiple hidden disabled={busy}
            onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <span style={{ ...muted, marginLeft: 10 }}>PDF, Word, spreadsheets, CSV or text.</span>
      </div>

      <div style={{ ...card, marginBottom: 12, display: 'grid', gap: 8 }}>
        <div style={kicker}>Add a web page</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-business.co.za/about" style={input} />
          <button onClick={addWebsite} disabled={busy || !url.trim()} style={btn}>Add</button>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 22, display: 'grid', gap: 8 }}>
        <div style={kicker}>Add a note</div>
        <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Title (optional)" style={input} />
        <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type anything the AI should know about your business…" style={{ ...input, minHeight: 70 }} />
        <div><button onClick={addNote} disabled={busy || !noteText.trim()} style={btn}>Save note</button></div>
      </div>

      <div style={{ ...card, marginBottom: 12, display: 'grid', gap: 8 }}>
        <div style={kicker}>Add many pages at once</div>
        <textarea value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="Paste page URLs, one per line…" style={{ ...input, minHeight: 64, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }} />
        <div><button onClick={() => runBulk('/beaiready/knowhow/sources/urls', { urls }, 'pages').then(() => setUrls(''))} disabled={busy || !urls.trim()} style={btn}>Add pages</button></div>
      </div>

      <div style={{ ...card, marginBottom: 12, display: 'grid', gap: 8 }}>
        <div style={kicker}>Crawl a sitemap</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={sitemap} onChange={(e) => setSitemap(e.target.value)} placeholder="https://your-business.co.za/sitemap.xml" style={input} />
          <button onClick={() => runBulk('/beaiready/knowhow/sources/sitemap', { sitemap }, 'the site').then(() => setSitemap(''))} disabled={busy || !sitemap.trim()} style={btn}>Crawl</button>
        </div>
        <span style={{ ...muted, fontSize: 12 }}>Adds every page listed in your sitemap.xml (up to 150).</span>
      </div>

      <div style={{ ...card, marginBottom: 22, display: 'grid', gap: 8 }}>
        <div style={kicker}>Import a Google Drive folder</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={driveFolder} onChange={(e) => setDriveFolder(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" style={input} disabled={!caps.drive} />
          <button onClick={() => runBulk('/beaiready/knowhow/sources/drive', { folder: driveFolder }, 'the folder').then(() => setDriveFolder(''))} disabled={busy || !caps.drive || !driveFolder.trim()} style={btn}>Import</button>
        </div>
        <span style={{ ...muted, fontSize: 12 }}>{caps.drive ? 'Share the folder as “anyone with the link (Viewer)”. Google Docs, PDFs and Word files are imported.' : 'Google Drive import isn’t enabled on the server yet — use file upload or paste URLs instead.'}</span>
      </div>

      {bulkMsg && <p style={{ ...muted, marginTop: -8, marginBottom: 14 }}>{bulkMsg}</p>}

      <div className="hub-section-label">Your knowledge sources</div>
      {sources == null ? <p style={muted}>Loading…</p> : sources.length === 0 ? (
        <p style={muted}>Nothing added yet. Add a file, a web page or a note above and your AI starts using it.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sources.map((s) => {
            const off = !s.included || s.sensitive;
            const status = s.chunks
              ? `${s.chunks} passage${s.chunks === 1 ? '' : 's'}${s.embedded < s.chunks ? ` · indexing ${s.embedded}/${s.chunks}` : ' · searchable'}`
              : (s.has_text ? 'processing…' : 'no readable text');
            return (
              <div key={s.id} style={{ ...card, opacity: off ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div>
                    <span style={{ ...pill, ...originPill }}>{KIND_LABEL[s.kind] || s.kind}</span>{' '}
                    <strong style={{ fontSize: 14 }}>{s.title}</strong>
                    {s.sensitive && <span style={{ ...pill, background: '#fee2e2', color: '#b91c1c', marginLeft: 6 }}>sensitive</span>}
                    {!s.included && !s.sensitive && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359', marginLeft: 6 }}>excluded</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => patch(s.id, { included: !s.included })} style={tag} title={s.included ? 'Exclude from the AI' : 'Include in the AI'}>{s.included ? 'Exclude' : 'Include'}</button>
                    <button onClick={() => patch(s.id, { sensitive: !s.sensitive })} style={{ ...tag, ...(s.sensitive ? { color: '#b91c1c' } : {}) }} title="Mark sensitive — kept on file but never used by the AI">{s.sensitive ? 'Unmark' : 'Sensitive'}</button>
                    <button onClick={() => patch(s.id, { publish: !s.publish })} style={{ ...tag, ...(s.publish ? { color: '#166534', borderColor: '#bbf7d0', background: '#dcfce7' } : {}) }} title="Include in the public AI-ready export bundle">{s.publish ? 'Published' : 'Publish'}</button>
                    <button onClick={() => del(s.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
                  </div>
                </div>
                <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>{status}</div>
                {s.snippet && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0', lineHeight: 1.5 }}>{s.snippet}{s.snippet.length >= 220 ? '…' : ''}</p>}
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#c75b39' }}>{s.url}</a>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── My know-how — my workflows + the knowledge accrued from my use ───────────────
function WorkflowsPanel({ setErr }) {
  const [data, setData] = useState(null);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState([{ step: '', detail: '' }]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { apiFetch('/beaiready/knowhow/mine').then(setData).catch((e) => setErr(e.message)); }, [setErr]);
  useEffect(() => { load(); }, [load]);

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
    <>
      <p style={{ ...muted, maxWidth: '68ch', marginTop: 0 }}>
        Write up the procedures you know as step-by-step workflows, and see the knowledge that has gathered from
        answers you found useful. This is <b>private to you</b> until your Be AI Ready consultant promotes it to
        shared company knowledge.
      </p>

      <div style={{ ...card, marginBottom: 22 }}>
        <div style={kicker}>Add a workflow</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How we qualify a new tender" style={input} />
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

      <div className="hub-section-label">My workflows</div>
      {data == null ? <p style={muted}>Loading…</p> : data.workflows.length === 0 ? (
        <p style={muted}>No workflows yet — add one above.</p>
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

      <div className="hub-section-label">From my use</div>
      {data == null ? <p style={muted}>Loading…</p> : data.knowledge.length === 0 ? (
        <p style={muted}>Nothing yet. Pin an answer you find useful in <b>Ask</b> and it gathers here.</p>
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
    </>
  );
}

function SourceChips({ sources }) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      <span style={{ fontSize: 11, color: '#8a8076' }}>Grounded in:</span>
      {list.slice(0, 8).map((s, i) => (
        <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#f1f0ec', color: '#6b6359' }}
          title={s.title}>{SOURCE_LABEL[s.type] || s.type}{s.title ? ` · ${s.title.slice(0, 28)}` : ''}</span>
      ))}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 };
const input = { width: '100%', padding: '8px 10px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const btn = { padding: '8px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tag = { fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, display: 'inline-block' };
const originPill = { background: '#eef2ff', color: '#3730a3' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', margin: '0 0 8px' };
const muted = { color: '#8a8076', fontSize: 13.5 };
const tabBtn = { padding: '9px 16px', background: 'none', border: 'none', borderBottom: '2px solid transparent', fontSize: 14, fontWeight: 600, color: '#8a8076', cursor: 'pointer', marginBottom: -1 };
const tabActive = { color: '#1c1b1a', borderBottomColor: '#c75b39' };
