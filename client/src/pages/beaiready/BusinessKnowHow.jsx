// BusinessKnowHow — /dashboard/knowhow. KnowHow is one tool: your team asks its AI
// (grounded in your own knowledge), you add your documents/website/notes, and you
// capture the procedures in people's heads as workflows. Everything a member does
// here is scoped server-side to their own business. Three tabs:
//   • Ask          — the pooled company AI assistant (/beaiready/workspace/*)
//   • Your knowledge — documents / website / notes that ground the AI (/beaiready/knowhow/sources*)
//   • My know-how   — my workflows + the knowledge accrued from my use (/beaiready/knowhow/*)
import { useEffect, useState, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getActiveNewsroomId } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

const TABS = [
  { key: 'ask', label: 'Ask' },
  { key: 'knowledge', label: 'Your knowledge' },
  { key: 'manifest', label: 'Manifest' },
  { key: 'workflows', label: 'My know-how' },
  { key: 'publish', label: 'Publish' },
];

const SOURCE_LABEL = { document: 'your documents', knowledge: 'company knowledge', pattern: 'sector pattern', team_history: 'earlier team Q&A' };
const KIND_LABEL = { doc: 'Document', website: 'Website', note: 'Note' };

export default function BusinessKnowHow() {
  const [tab, setTab] = useState('ask');
  const [err, setErr] = useState('');
  const { user } = useAuth();
  const [useCase, setUseCase] = useState('');
  useEffect(() => { apiFetch('/beaiready/knowhow/assistant').then((d) => setUseCase(d.use_case || '')).catch(() => {}); }, []);
  // Claims Verifier shows only for tenants on that use case; Assistant only for consultants.
  let tabs = [...TABS];
  if (useCase === 'claims-verification') tabs = [...tabs, { key: 'claims', label: 'Claims' }];
  if (user?.role === 'admin') tabs = [...tabs, { key: 'assistant', label: 'Assistant' }];

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
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { setErr(''); setTab(t.key); }}
            style={{ ...tabBtn, ...(tab === t.key ? tabActive : {}) }}>{t.label}</button>
        ))}
      </div>

      {err && <div style={banner}>{err}</div>}

      {tab === 'ask' && <AskPanel setErr={setErr} />}
      {tab === 'knowledge' && <KnowledgePanel setErr={setErr} />}
      {tab === 'manifest' && <ManifestPanel setErr={setErr} />}
      {tab === 'workflows' && <WorkflowsPanel setErr={setErr} />}
      {tab === 'publish' && <PublishPanel setErr={setErr} />}
      {tab === 'claims' && <ClaimsPanel setErr={setErr} />}
      {tab === 'assistant' && <AssistantPanel setErr={setErr} />}
    </div>
  );
}

// ── Assistant — consultant sets this client's AI persona via a use-case preset ────
function AssistantPanel({ setErr }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');

  const load = useCallback(() => { apiFetch('/beaiready/knowhow/assistant').then(setD).catch((e) => setErr(e.message)); }, [setErr]);
  useEffect(() => { load(); }, [load]);

  const pick = (p) => { setSaved(''); setD((x) => ({ ...x, use_case: p.key, instructions: p.instructions })); };
  const save = async () => {
    setBusy(true); setErr(''); setSaved('');
    try { await apiFetch('/beaiready/knowhow/assistant', { method: 'PUT', body: JSON.stringify({ use_case: d.use_case, instructions: d.instructions }) }); setSaved('Saved — the assistant now answers with this persona.'); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!d) return <p style={muted}>Loading…</p>;
  return (
    <>
      <p style={{ ...muted, maxWidth: '70ch', marginTop: 0 }}>
        Set this client's AI persona. Pick a use-case preset to seed it, then tailor the wording. It shapes how the
        assistant answers for this business — its role, expertise and tone — while grounding and privacy stay the same.
        <b> Consultant setting.</b>
      </p>

      <div style={{ ...card, marginBottom: 14 }}>
        <div style={kicker}>Use-case preset</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(d.presets || []).map((p) => (
            <button key={p.key} onClick={() => pick(p)} title={p.description}
              style={{ ...tag, ...(d.use_case === p.key ? { borderColor: '#c75b39', color: '#c75b39', fontWeight: 700 } : {}) }}>{p.label}</button>
          ))}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 14 }}>
        <div style={kicker}>Assistant instructions</div>
        <textarea value={d.instructions || ''} onChange={(e) => setD({ ...d, instructions: e.target.value })}
          placeholder="Describe the assistant's role, expertise and tone for this client…" style={{ ...input, minHeight: 130 }} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={save} disabled={busy} style={btn}>{busy ? 'Saving…' : 'Save persona'}</button>
        {saved && <span style={{ ...muted, color: '#166534' }}>{saved}</span>}
      </div>
    </>
  );
}

// ── Manifest — full per-document editorial control (inclusion, publication toggles,
// sensitivity, metadata, bulk rules, AI Generate, JSON-LD copy) ───────────────────
const INCLUSIONS = ['include', 'exclude', 'local_only'];
const SENSITIVITIES = ['none', 'source-protected', 'legal-hold', 'embargoed', 'withdrawn'];
const TOGGLE_KEYS = ['out_clean_markdown', 'out_json_ld', 'out_mirror_md', 'in_llms_txt', 'in_llms_full'];
const TOGGLE_LABEL = { out_clean_markdown: 'Clean MD', out_json_ld: 'JSON-LD', out_mirror_md: 'Mirror', in_llms_txt: 'llms.txt', in_llms_full: 'llms-full' };

function ManifestPanel({ setErr }) {
  const [data, setData] = useState(null);
  const [gen, setGen] = useState('');
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [rule, setRule] = useState({ field: 'category', op: 'eq', value: '', then_field: 'inclusion', then_value: 'exclude' });
  const [preview, setPreview] = useState('');

  const load = useCallback(() => { apiFetch('/beaiready/knowhow/manifest').then(setData).catch((e) => setErr(e.message)); }, [setErr]);
  useEffect(() => { load(); }, [load]);

  const patchDoc = async (id, changes) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/manifest/${id}`, { method: 'PUT', body: JSON.stringify(changes) }); load(); } catch (e) { setErr(e.message); } };
  const del = async (id) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/sources/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };
  const copyLd = async (id) => {
    try { const r = await apiFetch(`/beaiready/knowhow/jsonld/${id}`); try { await navigator.clipboard.writeText(r.script); alert('JSON-LD copied — paste it into the page <head>.'); } catch { prompt('Copy this JSON-LD:', r.script); } }
    catch (e) { setErr(e.message); }
  };
  const generate = async () => {
    if (!window.confirm('Use AI to write short summaries for documents that need them?')) return;
    setGen('Generating…'); setErr('');
    try { const r = await apiFetch('/beaiready/knowhow/generate', { method: 'POST', body: JSON.stringify({}) }); setGen(`Done — ${r.done} written, ${r.failed} failed.`); load(); }
    catch (e) { setErr(e.message); setGen(''); }
  };
  const startEdit = (s) => { setEditId(s.id); setEdit({ title: s.title || '', category: s.category || '', author: s.author || '', published_at: s.published_at ? String(s.published_at).slice(0, 10) : '', summary: s.summary || '', notes: s.notes || '' }); };
  const saveEdit = async () => { await patchDoc(editId, edit); setEditId(null); };

  const currentWhen = () => rule.op === 'is_empty' ? { field: rule.field, op: rule.op } : (rule.value ? { field: rule.field, op: rule.op, value: rule.value } : null);
  const doPreview = async () => { const when = currentWhen(); if (!when) { setPreview(''); return; } try { const r = await apiFetch('/beaiready/knowhow/rules/preview', { method: 'POST', body: JSON.stringify({ when }) }); setPreview(`Would match ${r.matches} document(s).`); } catch { /* ignore */ } };
  const addRule = async () => {
    const when = currentWhen(); if (!when) return;
    let v = rule.then_value; if (v === 'true') v = true; else if (v === 'false') v = false;
    const nr = { id: 'r' + Date.now(), when, then: { [rule.then_field]: v } };
    try { await apiFetch('/beaiready/knowhow/rules', { method: 'PUT', body: JSON.stringify({ rules: [...(data.rules || []), nr] }) }); setRule({ ...rule, value: '' }); setPreview(''); load(); } catch (e) { setErr(e.message); }
  };
  const delRule = async (id) => { try { await apiFetch('/beaiready/knowhow/rules', { method: 'PUT', body: JSON.stringify({ rules: (data.rules || []).filter((r) => r.id !== id) }) }); load(); } catch (e) { setErr(e.message); } };

  if (!data) return <p style={muted}>Loading…</p>;
  const c = data.counts || {};
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12.5, color: '#6b6359', marginBottom: 14 }}>
        {[['Documents', c.total], ['Converted', c.converted], ['Embedded', c.embedded], ['Publishable', c.publishable], ['Excluded', c.excluded], ['Local-only', c.local_only], ['Sensitive', c.sensitive], ['In llms.txt', c.in_llms_txt]].map(([k, v]) => <span key={k}>{k}: <b>{v || 0}</b></span>)}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={kicker}>Bulk rules</div>
        <p style={{ ...muted, marginTop: 0, fontSize: 12.5 }}>Set defaults across many documents at once. A hand edit always wins over a rule.</p>
        {(data.rules || []).length === 0 ? <p style={{ ...muted, fontSize: 13 }}>No rules yet.</p> : (data.rules || []).map((r) => {
          const k = Object.keys(r.then || {})[0];
          return (<div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, fontSize: 13 }}>
            <span style={{ flex: 1 }}>When <b>{r.when.field}</b> {String(r.when.op).replace(/_/g, ' ')} {r.when.op !== 'is_empty' && <b>{String(r.when.value)}</b>} → <b>{TOGGLE_LABEL[k] || k}</b> = <b>{String(r.then[k])}</b></span>
            <button onClick={() => delRule(r.id)} style={tag}>Remove</button>
          </div>);
        })}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <select value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value })} style={sel}>{(data.fields.whenFields || []).map((f) => <option key={f}>{f}</option>)}</select>
          <select value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value })} style={sel}>{(data.fields.ops || []).map((o) => <option key={o}>{o}</option>)}</select>
          <input value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} onBlur={doPreview} placeholder="value" style={{ ...input, width: 120 }} />
          <span style={muted}>→</span>
          <select value={rule.then_field} onChange={(e) => setRule({ ...rule, then_field: e.target.value, then_value: e.target.value === 'inclusion' ? 'exclude' : 'true' })} style={sel}><option value="inclusion">inclusion</option>{TOGGLE_KEYS.map((t) => <option key={t} value={t}>{TOGGLE_LABEL[t]}</option>)}</select>
          <select value={String(rule.then_value)} onChange={(e) => setRule({ ...rule, then_value: e.target.value })} style={sel}>{(rule.then_field === 'inclusion' ? INCLUSIONS : ['true', 'false']).map((v) => <option key={v}>{v}</option>)}</select>
          <button onClick={addRule} style={btn}>Add rule</button>
        </div>
        {preview && <p style={{ ...muted, fontSize: 12, marginTop: 6 }}>{preview}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div className="hub-section-label" style={{ margin: 0, flex: 1 }}>Documents</div>
        <button onClick={generate} style={tag} title="AI-write summaries that feed llms.txt + JSON-LD">Generate summaries</button>
        {gen && <span style={{ ...muted, fontSize: 12 }}>{gen}</span>}
      </div>

      {data.sources.length === 0 ? <p style={muted}>Nothing added yet — add sources in “Your knowledge”.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: 'left', color: '#8a8076' }}>
              <th style={th}>Document</th><th style={th}>Inclusion</th>{TOGGLE_KEYS.map((t) => <th key={t} style={{ ...th, textAlign: 'center' }}>{TOGGLE_LABEL[t]}</th>)}<th style={th}>Sensitivity</th><th style={th} />
            </tr></thead>
            <tbody>
              {data.sources.map((s) => {
                const eff = s._effective || {};
                const ruled = (k) => eff[k] !== undefined && eff[k] !== s[k];
                return (
                  <Fragment key={s.id}>
                    <tr style={{ borderTop: '1px solid #eee5da' }}>
                      <td style={td}><div style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => startEdit(s)} title="Edit details">{s.title || '(untitled)'}</div>
                        <div style={{ ...muted, fontSize: 11 }}>{s.kind}{s.category ? ` · ${s.category}` : ''}{s.chunks ? ` · ${s.chunks} passages` : ''}{s.summary ? ' · summarised' : ''}</div></td>
                      <td style={td}><select value={s.inclusion} onChange={(e) => patchDoc(s.id, { inclusion: e.target.value })} style={{ ...sel, ...(ruled('inclusion') ? { borderColor: '#c9b27a' } : {}) }}>{INCLUSIONS.map((v) => <option key={v}>{v}</option>)}</select></td>
                      {TOGGLE_KEYS.map((t) => <td key={t} style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!s[t]} onChange={(e) => patchDoc(s.id, { [t]: e.target.checked })} title={ruled(t) ? `effective: ${eff[t]} (by rule)` : ''} style={ruled(t) ? { outline: '2px solid #c9b27a' } : {}} /></td>)}
                      <td style={td}><select value={s.sensitivity} onChange={(e) => patchDoc(s.id, { sensitivity: e.target.value })} style={sel}>{SENSITIVITIES.map((v) => <option key={v}>{v}</option>)}</select></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><button onClick={() => copyLd(s.id)} style={tag} title="Copy JSON-LD snippet">&lt;ld&gt;</button> <button onClick={() => del(s.id)} style={{ ...tag, color: '#b91c1c' }}>✕</button></td>
                    </tr>
                    {editId === s.id && (
                      <tr style={{ background: '#fbf7f4' }}>
                        <td colSpan={9} style={{ padding: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Title" style={input} />
                            <input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="Category (groups llms.txt)" style={input} />
                            <input value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} placeholder="Author" style={input} />
                            <input value={edit.published_at} onChange={(e) => setEdit({ ...edit, published_at: e.target.value })} placeholder="Published (YYYY-MM-DD)" style={input} />
                          </div>
                          <textarea value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} placeholder="Summary (feeds llms.txt + JSON-LD)" style={{ ...input, minHeight: 50, marginTop: 8 }} />
                          <textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Private notes" style={{ ...input, minHeight: 40, marginTop: 8 }} />
                          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}><button onClick={saveEdit} style={btn}>Save</button><button onClick={() => setEditId(null)} style={tag}>Cancel</button></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Publish — the outward AI-ready export bundle for the business's own website ───
const EXPORT_CRAWLERS = ['ClaudeBot', 'GPTBot', 'PerplexityBot', 'CCBot', 'Google-Extended', '*'];
function PublishPanel({ setErr }) {
  const [settings, setSettings] = useState(null);
  const [publishable, setPublishable] = useState(0);
  const [prev, setPrev] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');

  const load = useCallback(() => {
    apiFetch('/beaiready/knowhow/settings')
      .then((d) => { setSettings(d.settings || { org_name: '', site_url: '', crawlers: {} }); setPublishable(d.publishable || 0); })
      .catch((e) => setErr(e.message));
    apiFetch('/beaiready/knowhow/bundle/preview').then(setPrev).catch(() => {});
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
        <input value={settings.llms_summary || ''} onChange={(e) => setField('llms_summary', e.target.value)} placeholder="One-line description (llms.txt header)" style={input} />
        <input value={settings.mirror_base || ''} onChange={(e) => setField('mirror_base', e.target.value)} placeholder="Mirror base path (default /)" style={input} />
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
      {prev ? (
        <p style={{ ...muted, fontSize: 12, marginTop: 8 }}>
          Bundle will contain: <b>{prev.publishable || 0}</b> publishable · <b>{prev.mirror || 0}</b> mirrors · <b>{prev.jsonld || 0}</b> JSON-LD · <b>{prev.llms_txt || 0}</b> in llms.txt · <b>{prev.llms_full || 0}</b> in llms-full.
          {' '}Set which outputs each document uses in the <b>Manifest</b> tab.
        </p>
      ) : (
        <p style={{ ...muted, fontSize: 12, marginTop: 8 }}>
          {publishable ? `${publishable} publishable item(s).` : 'Nothing publishable yet — mark sources Publish (or set outputs in Manifest).'}
        </p>
      )}
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

// ─────────────────────────── Claims Verifier (bespoke: use_case='claims-verification') ───────────────────────────
const VERDICT_COLORS = { supported: '#166534', contradicted: '#b91c1c', misleading: '#b45309', unverified: '#8a8076', pending: '#c9c2b8' };
const VERDICT_LABEL = { supported: 'Supported', contradicted: 'Contradicted', misleading: 'Misleading', unverified: 'Unverified', pending: 'Pending' };
const VERDICT_ORDER = ['supported', 'contradicted', 'misleading', 'unverified', 'pending'];
const ROLE_LABEL = { claim: "Company claim", reporting: 'EnviroPress reporting', external: 'External source' };
const ROLE_PILL = { claim: { background: '#fee2e2', color: '#b91c1c' }, reporting: { background: '#dbeafe', color: '#1e40af' }, external: { background: '#dcfce7', color: '#166534' } };

function VerdictBar({ counts }) {
  const c = counts || {};
  const total = VERDICT_ORDER.reduce((a, k) => a + (c[k] || 0), 0);
  if (!total) return <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>No claims tested yet.</div>;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', border: '1px solid #eee5da' }}>
        {VERDICT_ORDER.map((k) => (c[k] ? <div key={k} title={`${VERDICT_LABEL[k]}: ${c[k]}`} style={{ width: `${(c[k] / total) * 100}%`, background: VERDICT_COLORS[k] }} /> : null))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 5, fontSize: 11.5, color: '#6b6359' }}>
        {VERDICT_ORDER.map((k) => (c[k] ? <span key={k}><span style={{ color: VERDICT_COLORS[k] }}>●</span> {VERDICT_LABEL[k]} {c[k]}</span> : null))}
      </div>
    </div>
  );
}

function ClaimsPanel({ setErr }) {
  const [mines, setMines] = useState(null);
  const [view, setView] = useState('mines');          // 'mines' | 'report' | <mine name>
  const [newMine, setNewMine] = useState('');
  const load = useCallback(() => apiFetch('/beaiready/knowhow/claims').then((d) => setMines(d.mines || [])).catch((e) => setErr(e.message)), [setErr]);
  useEffect(() => { load(); }, [load]);

  const addMine = async () => {
    if (!newMine.trim()) return;
    try { const d = await apiFetch('/beaiready/knowhow/claims', { method: 'POST', body: JSON.stringify({ name: newMine.trim() }) }); setMines(d.mines || []); setNewMine(''); }
    catch (e) { setErr(e.message); }
  };
  const delMine = async (name) => {
    if (!window.confirm(`Remove "${name}" from the list? Its documents and verdicts stay in your knowledge — this just hides the bucket.`)) return;
    try { const d = await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(name)}`, { method: 'DELETE' }); setMines(d.mines || []); }
    catch (e) { setErr(e.message); }
  };

  if (view === 'report') return <ClaimsReport setErr={setErr} back={() => { setView('mines'); load(); }} />;
  if (view !== 'mines') return <MineView setErr={setErr} mine={view} back={() => { setView('mines'); load(); }} />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <p style={{ ...muted, maxWidth: '64ch', marginTop: 0 }}>
          Each <b>mine</b> is a separate bucket. Add the mine's own <b>claims</b>, your <b>reporting</b>, and <b>external</b> sources, then
          Verify — KnowHow tests each claim against the evidence and tells you what's supported, contradicted or misleading.
        </p>
        <button onClick={() => setView('report')} style={btn}>View report →</button>
      </div>
      <div style={{ ...card, margin: '4px 0 16px', display: 'flex', gap: 8 }}>
        <input value={newMine} onChange={(e) => setNewMine(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMine()} placeholder="Add a mine (e.g. Bikita Minerals)…" style={input} />
        <button onClick={addMine} disabled={!newMine.trim()} style={btn}>Add mine</button>
      </div>
      {mines == null ? <p style={muted}>Loading…</p> : mines.length === 0 ? <p style={muted}>No mines yet — add your first bucket above.</p> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {mines.map((m) => (
            <div key={m.name} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <button onClick={() => setView(m.name)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 15, fontWeight: 800, color: '#1c1b1a', cursor: 'pointer' }}>{m.name} →</button>
                <button onClick={() => delMine(m.name)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
              </div>
              <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
                {m.sources.claim} claim{m.sources.claim === 1 ? '' : 's'} · {m.sources.reporting} reporting · {m.sources.external} external · {m.claims} claim{m.claims === 1 ? '' : 's'} tested
                {m.last_verified ? ` · verified ${new Date(m.last_verified).toLocaleDateString()}` : ''}
              </div>
              <VerdictBar counts={m.counts} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function MineView({ setErr, mine, back }) {
  const [data, setData] = useState(null);
  const [role, setRole] = useState('claim');
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState('');
  const [url, setUrl] = useState('');
  const [ttl, setTtl] = useState('');
  const [text, setText] = useState('');
  const load = useCallback(() => apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(mine)}`).then(setData).catch((e) => setErr(e.message)), [mine, setErr]);
  useEffect(() => { load(); }, [load]);

  const meta = () => ({ collection: mine, role });
  const addNote = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/knowhow/sources/note', { method: 'POST', body: JSON.stringify({ title: ttl.trim(), text: text.trim(), ...meta() }) }); setText(''); setTtl(''); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const addUrl = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/knowhow/sources/website', { method: 'POST', body: JSON.stringify({ url: url.trim(), ...meta() }) }); setUrl(''); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f, f.name));
      fd.append('collection', mine); fd.append('role', role);
      const headers = {}; const nid = getActiveNewsroomId(); if (nid) headers['X-Newsroom-Id'] = nid;
      const res = await fetch('/api/beaiready/knowhow/sources/upload', { method: 'POST', body: fd, credentials: 'include', headers });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || 'Upload failed'); }
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const verify = async () => {
    setVerifying('Extracting claims and checking them against your evidence…'); setErr('');
    try { const r = await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(mine)}/verify`, { method: 'POST', body: '{}' }); setVerifying(`Done — ${r.verified} claim(s) checked.`); load(); }
    catch (e) { setErr(e.message); setVerifying(''); }
  };
  const delSource = async (id) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/sources/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };

  if (!data) return <p style={muted}>Loading…</p>;
  return (
    <>
      <button onClick={back} style={{ ...tag, marginBottom: 10 }}>← All mines</button>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 2px' }}>{mine}</h2>
      <VerdictBar counts={data.counts} />

      <div style={{ ...card, margin: '14px 0', display: 'grid', gap: 8 }}>
        <div style={kicker}>Add evidence to this bucket</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...muted, fontSize: 13 }}>This is a</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={sel}>
            <option value="claim">Company's own claim</option>
            <option value="reporting">EnviroPress reporting</option>
            <option value="external">External source</option>
          </select>
          <label style={{ ...tag, cursor: busy ? 'wait' : 'pointer' }}>Upload files<input type="file" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} /></label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste a web-page URL" style={input} />
          <button onClick={addUrl} disabled={busy || !url.trim()} style={btn}>Add</button>
        </div>
        <input value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="…or a note title (optional)" style={input} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste text — a claim, a finding, a quote" style={{ ...input, minHeight: 56, resize: 'vertical' }} />
        <div><button onClick={addNote} disabled={busy || !text.trim()} style={btn}>Add note</button></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 8px' }}>
        <div className="hub-section-label" style={{ margin: 0, flex: 1 }}>Claims &amp; verdicts</div>
        <button onClick={verify} style={btn}>Verify claims</button>
      </div>
      {verifying && <p style={{ ...muted, fontSize: 12.5, margin: '0 0 8px' }}>{verifying}</p>}
      {data.claims.length === 0 ? (
        <p style={muted}>No claims yet. Add the mine's own documents as “Company's own claim”, then hit <b>Verify</b> to extract and test them against your reporting and external sources.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.claims.map((cl) => (
            <div key={cl.id} style={card}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ ...pill, background: `${VERDICT_COLORS[cl.verdict]}22`, color: VERDICT_COLORS[cl.verdict], border: `1px solid ${VERDICT_COLORS[cl.verdict]}` }}>{VERDICT_LABEL[cl.verdict] || cl.verdict}</span>
                <strong style={{ fontSize: 13.5 }}>{cl.claim_text}</strong>
              </div>
              {cl.rationale && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{cl.rationale}</p>}
              {Array.isArray(cl.citations) && cl.citations.length > 0 && (
                <div style={{ ...muted, fontSize: 11.5, marginTop: 5 }}>Sources: {cl.citations.map((c) => c.title || c.kind).filter(Boolean).join(' · ')}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="hub-section-label" style={{ marginTop: 18 }}>Sources in this bucket</div>
      {data.sources.length === 0 ? <p style={muted}>None yet.</p> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {data.sources.map((s) => (
            <div key={s.id} style={{ ...card, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div><span style={{ ...pill, ...(ROLE_PILL[s.role] || {}) }}>{ROLE_LABEL[s.role] || s.role}</span> <span style={{ fontSize: 13 }}>{s.title}</span></div>
              <button onClick={() => delSource(s.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TrendChart({ snapshots }) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  if (!list.length) return <p style={muted}>No verification runs yet — hit Verify on a mine to start the record.</p>;
  // Aggregate per run-time across mines: total contradicted+misleading (= false/misleading claims found).
  const byTime = {};
  for (const s of list) {
    const t = new Date(s.taken_at); const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}-${t.getHours()}${t.getMinutes()}`;
    const c = s.counts || {};
    byTime[key] = byTime[key] || { t, v: 0 };
    byTime[key].v += (c.contradicted || 0) + (c.misleading || 0);
  }
  const pts = Object.values(byTime).sort((a, b) => a.t - b.t).slice(-20);
  const max = Math.max(1, ...pts.map((p) => p.v));
  const W = Math.max(220, pts.length * 44); const H = 96;
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: Math.min(W, 640), height: 96 }} role="img" aria-label="False or misleading claims found over time">
        <text x={4} y={12} fontSize={10} fill="#8a8076">False / misleading claims found</text>
        {pts.map((p, i) => {
          const x = i * 44 + 24; const h = (p.v / max) * (H - 34);
          return (
            <g key={i}>
              <rect x={x - 10} y={H - 18 - h} width={20} height={h} fill="#b91c1c" rx={2} />
              <text x={x} y={H - 20 - h} fontSize={10} textAnchor="middle" fill="#5b5249">{p.v}</text>
              <text x={x} y={H - 5} fontSize={8.5} textAnchor="middle" fill="#8a8076">{`${p.t.getDate()}/${p.t.getMonth() + 1}`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ClaimsReport({ setErr, back }) {
  const [d, setD] = useState(null);
  useEffect(() => { apiFetch('/beaiready/knowhow/claims/report').then(setD).catch((e) => setErr(e.message)); }, [setErr]);
  if (!d) return <p style={muted}>Loading…</p>;
  return (
    <>
      <button onClick={back} style={{ ...tag, marginBottom: 10 }}>← All mines</button>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>Claims verification report</h2>
      {d.mines.length === 0 ? <p style={muted}>No mines yet.</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {d.mines.map((m) => (
            <div key={m.name} style={card}>
              <strong style={{ fontSize: 15 }}>{m.name}</strong>
              <div style={{ ...muted, fontSize: 11.5 }}>{m.claims} claim{m.claims === 1 ? '' : 's'} tested · {m.sources.claim + m.sources.reporting + m.sources.external} sources</div>
              <VerdictBar counts={m.counts} />
            </div>
          ))}
        </div>
      )}
      <div className="hub-section-label" style={{ marginTop: 20 }}>Over time</div>
      <TrendChart snapshots={d.snapshots} />
      <div style={{ marginTop: 16 }}><button onClick={() => window.print()} style={tag}>Print / save as PDF</button></div>
    </>
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
const sel = { padding: '5px 6px', border: '1px solid #e4dcd2', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' };
const th = { padding: '6px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.03, fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', verticalAlign: 'top' };
