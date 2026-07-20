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

const CLAIMS_UC = 'claims-verification';   // the use case that turns KnowHow into the claims/mines version

const SOURCE_LABEL = { document: 'your documents', knowledge: 'company knowledge', pattern: 'sector pattern', team_history: 'earlier team Q&A' };
const KIND_LABEL = { doc: 'Document', website: 'Website', note: 'Note' };

export default function BusinessKnowHow() {
  const [tab, setTab] = useState(null);                 // null until we know the use case
  const [err, setErr] = useState('');
  const { user } = useAuth();
  const [useCase, setUseCase] = useState(undefined);    // undefined = still loading
  useEffect(() => { apiFetch('/beaiready/knowhow/assistant').then((d) => setUseCase(d.use_case || '')).catch(() => setUseCase('')); }, []);

  // KnowHow is the broader app; the tenant's use case decides which version of it they get —
  // which surfaces exist, what leads, and how the page describes itself.
  const isClaims = useCase === CLAIMS_UC;
  useEffect(() => { if (tab === null && useCase !== undefined) setTab(isClaims ? 'claims' : 'ask'); }, [useCase, tab, isClaims]);

  let tabs = [...TABS];
  if (user?.role === 'admin') tabs = [...tabs, { key: 'assistant', label: 'Assistant' }];

  if (tab === null) return <div className="hub hub-beaiready"><p style={muted}>Loading…</p></div>;

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · Knowledge</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>KnowHow</h1>
      <p style={{ color: '#6b6359', maxWidth: '70ch', marginBottom: 16 }}>
        {isClaims ? (
          <>
            Test what each mine <b>claims</b> against what your reporting and independent sources show it has
            actually <b>done</b>. Every mine is its own bucket of evidence; KnowHow reads each document, weighs
            each claim against your evidence and your criteria, and surfaces where they don't match.
            Nothing leaves your newsroom.
          </>
        ) : (
          <>
            Your team's AI, grounded in your <b>own</b> knowledge. Ask anything and every answer is kept so the
            business builds on it; add your documents, website and notes so the AI knows how you really work; and
            capture the know-how in people's heads as workflows. Nothing leaves your company.
          </>
        )}
      </p>

      {/* Claims tenants get one working page — no tabs hiding the job. Everyone else keeps the tabbed tools. */}
      {!isClaims && (
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eee5da', marginBottom: 18, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setErr(''); setTab(t.key); }}
              style={{ ...tabBtn, ...(tab === t.key ? tabActive : {}) }}>{t.label}</button>
          ))}
        </div>
      )}

      {err && <div style={banner}>{err}</div>}

      {isClaims ? (
        <>
          <ClaimsWorkspace setErr={setErr} isAdmin={user?.role === 'admin'} />
          <MoreTools setErr={setErr} isAdmin={user?.role === 'admin'} />
        </>
      ) : (
        <>
          {tab === 'ask' && <AskPanel setErr={setErr} />}
          {tab === 'knowledge' && <KnowledgePanel setErr={setErr} />}
          {tab === 'manifest' && <ManifestPanel setErr={setErr} />}
          {tab === 'workflows' && <WorkflowsPanel setErr={setErr} />}
          {tab === 'publish' && <PublishPanel setErr={setErr} />}
          {tab === 'assistant' && <AssistantPanel setErr={setErr} />}
        </>
      )}
    </div>
  );
}

// ── Assistant — consultant sets this client's AI persona via a use-case preset ────
// The claims page has no tabs — so the rest of KnowHow lives here, on the same page,
// each tool opening in place. Nothing is removed by dropping the tab bar.
const MORE_TOOLS = [
  { key: 'ask', label: 'Ask the AI', hint: 'Ask anything across every document you have added', C: AskPanel },
  { key: 'knowledge', label: 'All your documents', hint: 'Everything you have added, searchable, with per-document controls', C: KnowledgePanel },
  { key: 'manifest', label: 'Manifest', hint: 'Per-document rules, sensitivity and AI-readiness', C: ManifestPanel },
  { key: 'workflows', label: 'My know-how', hint: 'Capture how your team works, step by step', C: WorkflowsPanel },
  { key: 'publish', label: 'Publish', hint: 'llms.txt and outward publishing', C: PublishPanel },
];

function MoreTools({ setErr, isAdmin }) {
  const [open, setOpen] = useState(null);
  const tools = isAdmin ? [...MORE_TOOLS, { key: 'assistant', label: 'Assistant persona', hint: 'Consultant: how this client’s AI behaves', C: AssistantPanel }] : MORE_TOOLS;
  const Active = tools.find((t) => t.key === open)?.C;
  return (
    <div style={{ marginTop: 28, borderTop: '1px solid #eee5da', paddingTop: 14 }}>
      <div className="hub-section-label">The rest of KnowHow</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0 0' }}>
        {tools.map((t) => (
          <button key={t.key} onClick={() => { setErr(''); setOpen(open === t.key ? null : t.key); }}
            title={t.hint}
            style={{ ...tag, ...(open === t.key ? { borderColor: '#c75b39', color: '#c75b39', fontWeight: 700 } : {}) }}>
            {open === t.key ? '▾ ' : '▸ '}{t.label}
          </button>
        ))}
      </div>
      {Active && <div style={{ marginTop: 14 }}><Active setErr={setErr} /></div>}
    </div>
  );
}

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
    if (!fileList || !fileList.length) return;
    setBusy(true); setErr('');
    try {
      const r = await uploadFileList(fileList);
      if (!r.added) setErr(r.error || 'Nothing uploaded.');
      else { if (r.skipped) setErr(`Uploaded ${r.added}; skipped ${r.skipped} unsupported file(s).`); load(); }
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
        <label style={{ ...btn, display: 'inline-block', marginLeft: 8, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          Choose folder…
          <input type="file" hidden disabled={busy} webkitdirectory="" directory="" multiple
            onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <span style={{ ...muted, marginLeft: 10 }}>PDF, Word, spreadsheets, CSV or text — a whole folder at once is fine.</span>
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
const ROLE_LABEL = { claim: "Company claim", reporting: 'EnviroPress reporting', external: 'External source', criteria: 'Judging criteria' };
const ROLE_PILL = { claim: { background: '#fee2e2', color: '#b91c1c' }, reporting: { background: '#dbeafe', color: '#1e40af' }, external: { background: '#dcfce7', color: '#166534' }, criteria: { background: '#fef3c7', color: '#92400e' } };
const STANCE_COLOR = { supports: '#166534', contradicts: '#b91c1c', context: '#8a8076', counterclaim: '#b45309' };
const STANCE_LABEL = { supports: 'Supports', contradicts: 'Contradicts', context: 'Context', counterclaim: 'Counterclaim' };
const CLAIM_STATUSES = ['open', 'needs_reporting', 'disputed', 'resolved'];
const UPLOAD_EXT = /\.(pdf|docx|xlsx|csv|txt)$/i;   // server-accepted types; folder uploads are filtered to these

// Upload files (from a file OR folder picker) to KnowHow, filtering to supported types and
// tagging with extra fields (collection/role). Returns { added, skipped, error }.
async function uploadFileList(fileList, extra = {}) {
  let files = Array.from(fileList || []);
  const before = files.length;
  files = files.filter((f) => UPLOAD_EXT.test(f.name));
  const skipped = before - files.length;
  if (!files.length) return { added: 0, skipped, error: 'No supported files here (PDF, Word, Excel, CSV, text).' };
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f, f.name));
  for (const [k, v] of Object.entries(extra)) if (v != null) fd.append(k, v);
  const headers = {}; const nid = getActiveNewsroomId(); if (nid) headers['X-Newsroom-Id'] = nid;
  const res = await fetch('/api/beaiready/knowhow/sources/upload', { method: 'POST', body: fd, credentials: 'include', headers });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || 'Upload failed'); }
  return { added: files.length, skipped, error: null };
}
const STATUS_LABEL = { open: 'Open', needs_reporting: 'Needs reporting', disputed: 'Disputed', resolved: 'Resolved' };
const VERDICT_CHOICES = ['pending', 'supported', 'contradicted', 'misleading', 'unverified'];

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

// ── The single claims page: dashboard on top, one clear place to add each kind of data,
// then every mine and its inconsistencies inline. No tabs. ──────────────────────────────

// Evidence that belongs to ONE mine.
const MINE_ZONES = [
  { role: 'claim', title: 'What the mine claims', hint: "The mine's own reports, press releases, website copy — or a transcript of what they said on video." },
  { role: 'reporting', title: 'Your reporting', hint: 'EnviroPress field reporting, investigations, interviews, site visits.' },
  { role: 'external', title: 'External sources', hint: 'Government inspections, NGO studies, court records, academic work.' },
];
// Criteria are the yardstick — org-wide by default, so they sit apart from the per-mine zones.
const CRITERIA_ZONE = { role: 'criteria', title: 'Add judging criteria', hint: 'Environmental law, rehabilitation norms, disclosure rules — the standards every claim is measured against.' };

// One labelled drop-zone per kind of data. Files, a whole folder, a URL, or pasted text.
function DataZone({ zone, collection, setErr, onAdded }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [orgWide, setOrgWide] = useState(zone.role === 'criteria');
  const isCriteria = zone.role === 'criteria';
  // Criteria can apply to every mine (no collection) or just this one.
  const meta = () => ({ role: zone.role, collection: isCriteria && orgWide ? null : collection });
  const done = (msg) => { setBusy(false); onAdded?.(msg); };
  const run = async (fn) => {
    if (!isCriteria || !orgWide) { if (!collection) { setErr('Pick a mine first (or add one).'); return; } }
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    done();
  };
  const onFiles = (fl) => run(async () => {
    const r = await uploadFileList(fl, meta());
    if (!r.added) setErr(r.error || 'Nothing uploaded.');
    else if (r.skipped) setErr(`Added ${r.added}; skipped ${r.skipped} unsupported file(s).`);
  });
  const addUrl = () => run(async () => { await apiFetch('/beaiready/knowhow/sources/website', { method: 'POST', body: JSON.stringify({ url: url.trim(), ...meta() }) }); setUrl(''); });
  const addText = () => run(async () => { await apiFetch('/beaiready/knowhow/sources/note', { method: 'POST', body: JSON.stringify({ title: zone.title, text: text.trim(), ...meta() }) }); setText(''); });

  return (
    <div style={{ ...card, display: 'grid', gap: 7, alignContent: 'start', borderTop: `3px solid ${ROLE_PILL[zone.role]?.color || '#c75b39'}` }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{zone.title}</div>
        <div style={{ ...muted, fontSize: 11.5, marginTop: 2 }}>{zone.hint}</div>
      </div>
      {isCriteria && (
        <select value={orgWide ? 'all' : 'mine'} onChange={(e) => setOrgWide(e.target.value === 'all')} style={sel}>
          <option value="all">Applies to all mines</option>
          <option value="mine">Only this mine</option>
        </select>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <label style={{ ...tag, cursor: busy ? 'wait' : 'pointer' }}>Files<input type="file" multiple hidden disabled={busy} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} /></label>
        <label style={{ ...tag, cursor: busy ? 'wait' : 'pointer' }}>Folder<input type="file" hidden multiple disabled={busy} webkitdirectory="" directory="" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} /></label>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a URL" style={{ ...input, fontSize: 12.5, padding: '6px 8px' }} />
        <button onClick={addUrl} disabled={busy || !url.trim()} style={{ ...tag, fontWeight: 700 }}>Add</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste text" style={{ ...input, minHeight: 44, fontSize: 12.5, padding: '6px 8px', resize: 'vertical' }} />
      <div><button onClick={addText} disabled={busy || !text.trim()} style={{ ...tag, fontWeight: 700 }}>Add text</button></div>
    </div>
  );
}

// The output proper: each claim the evidence contradicts, with the quote that does it.
function Inconsistencies({ items, onOpen }) {
  if (!items.length) {
    return <p style={{ ...muted, margin: 0 }}>Nothing contradicted yet — either the claims hold up, or there isn't enough evidence on file to test them. Check the gaps below.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {items.map((c) => (
        <div key={c.id} style={{ ...card, borderLeft: `4px solid ${VERDICT_COLORS[c.verdict]}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ ...pill, background: `${VERDICT_COLORS[c.verdict]}22`, color: VERDICT_COLORS[c.verdict], border: `1px solid ${VERDICT_COLORS[c.verdict]}` }}>{VERDICT_LABEL[c.verdict]}</span>
            <button onClick={() => onOpen(c.collection)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: '#c75b39', cursor: 'pointer' }}>{c.collection}</button>
            {typeof c.confidence === 'number' && <span style={{ ...muted, fontSize: 11 }}>confidence {Math.round(c.confidence * 100)}%</span>}
            {(c.themes || []).map((t) => <span key={t} style={{ ...muted, fontSize: 11 }}>· {t}</span>)}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, margin: '6px 0 0' }}>They claim: “{c.claim_text}”</div>
          {c.rationale && <div style={{ fontSize: 12.5, color: '#5b5249', marginTop: 4 }}>{c.rationale}</div>}
          {c.evidence.map((e, i) => (
            <div key={i} style={{ marginTop: 6, borderLeft: `3px solid ${STANCE_COLOR[e.stance] || '#e4dcd2'}`, paddingLeft: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: STANCE_COLOR[e.stance] || '#8a8076' }}>
                {e.stance === 'counterclaim' ? 'Counterclaim' : 'But your evidence says'}{e.title ? ` · ${e.title}` : ''}{e.role ? ` (${ROLE_LABEL[e.role] || e.role})` : ''}
              </div>
              <div style={{ fontSize: 12, fontStyle: 'italic', color: '#5b5249' }}>“{e.quote}”</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// The gaps, on both sides of the comparison.
function GapsPanel({ a, onOpen }) {
  const shaky = (a.balance || []).filter((b) => b.missing.length);
  const Col = ({ title, count, blurb, empty, children }) => (
    <div style={{ ...card, alignContent: 'start' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title} <span style={{ ...muted, fontWeight: 400 }}>({count})</span></div>
      <p style={{ ...muted, fontSize: 11.5, margin: '3px 0 8px' }}>{blurb}</p>
      {count === 0 ? <p style={{ ...muted, fontSize: 12, margin: 0 }}>{empty}</p> : children}
    </div>
  );
  return (
    <>
      {shaky.length > 0 && (
        <div style={{ ...card, marginBottom: 10, background: '#fffdf7', borderColor: '#f0e4c4' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Mines missing a whole side of the comparison</div>
          {shaky.map((b) => (
            <div key={b.name} style={{ fontSize: 12.5, marginTop: 3 }}>
              <button onClick={() => onOpen(b.name)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#c75b39', cursor: 'pointer' }}>{b.name}</button>
              <span style={muted}> — has {b.missing.join(', ')}.</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Col title="Claims you can’t test yet" count={a.untested.length}
          blurb="They claim it; nothing on file checks it either way. This is your reporting to-do list."
          empty="None — every claim has something to test it against.">
          <div style={{ display: 'grid', gap: 7 }}>
            {a.untested.slice(0, 8).map((u) => (
              <div key={u.id}>
                <button onClick={() => onOpen(u.collection)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, fontWeight: 700, color: '#c75b39', cursor: 'pointer' }}>{u.collection}</button>
                <div style={{ fontSize: 12.5, color: '#5b5249' }}>{u.claim_text}</div>
              </div>
            ))}
            {a.untested.length > 8 && <div style={{ ...muted, fontSize: 11 }}>+{a.untested.length - 8} more</div>}
          </div>
        </Col>
        <Col title="They claim nothing about this" count={a.unused.length}
          blurb="Your reporting and independent sources that none of their claims rests on — what they stay silent about."
          empty="None — every document you've added is connected to a claim.">
          <div style={{ display: 'grid', gap: 7 }}>
            {a.unused.slice(0, 8).map((s) => (
              <div key={s.id}>
                <button onClick={() => onOpen(s.collection)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, fontWeight: 700, color: '#c75b39', cursor: 'pointer' }}>{s.collection}</button>
                <div style={{ fontSize: 12.5, color: '#5b5249' }}>
                  <span style={{ ...pill, ...(ROLE_PILL[s.role] || {}), marginRight: 5 }}>{ROLE_LABEL[s.role] || s.role}</span>{s.title}
                </div>
              </div>
            ))}
            {a.unused.length > 8 && <div style={{ ...muted, fontSize: 11 }}>+{a.unused.length - 8} more</div>}
          </div>
        </Col>
      </div>
    </>
  );
}

// Documents already on file that aren't part of any mine yet — anything added before the
// mines existed. They're intact and searchable; they just take no part in a comparison
// until they're filed, so we surface them rather than let them look lost.
// Step 1 of the whole workflow, and it leads the page: everything else needs a mine to
// hang off, so creating one is the first thing you see rather than a control to hunt for.
function MinesBar({ mines, setErr, onChanged, onJump }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/knowhow/claims', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); setName(''); onChanged?.(name.trim()); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ ...card, borderTop: '3px solid #c75b39', marginBottom: 18 }}>
      <div style={{ ...kicker, margin: '0 0 6px' }}>The mines you're tracking</div>
      {mines.length === 0 ? (
        <p style={{ ...muted, fontSize: 13, margin: '0 0 8px' }}>
          None yet — <b>start here</b>. Each mine is its own bucket: its claims, your reporting and the independent
          sources all sit inside it, and everything on this page hangs off them.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {mines.map((m) => (
            <button key={m.name} onClick={() => onJump(m.name)} title="Jump to this mine"
              style={{ ...tag, fontWeight: 700, borderColor: '#e4dcd2' }}>{m.name}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Mine name — e.g. Bikita Minerals" style={{ ...input, maxWidth: 280 }} />
        <button onClick={add} disabled={busy || !name.trim()} style={btn}>{busy ? 'Adding…' : 'Add mine'}</button>
      </div>
    </div>
  );
}

// What's actually in a mine, and whether each document is really in the system yet.
// "Uploaded" is not the same as usable: the text has to be split into passages and each
// passage embedded before a claim can be tested against it, so say which state it's in.
function docState(s) {
  if (!s.has_text) return { label: 'No readable text', tone: '#b45309', hint: 'Probably a scanned PDF — upload its transcript instead.' };
  if (!s.chunks) return { label: 'Reading…', tone: '#8a8076', hint: 'Saved. Being split into passages — this finishes on its own.' };
  if (s.embedded < s.chunks) return { label: `Ready · ${s.embedded}/${s.chunks} passages`, tone: '#b45309', hint: 'Mostly searchable; the rest catches up automatically.' };
  return { label: `Ready · ${s.chunks} passages`, tone: '#166534', hint: 'Fully read and searchable.' };
}

function MineDocuments({ mine, setErr, reloadKey, onChanged }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(mine)}`).then(setData).catch(() => {}), [mine]);
  useEffect(() => { load(); }, [load, reloadKey]);
  const sources = data?.sources || [];
  const stillReading = sources.filter((s) => s.has_text && !s.chunks).length;
  // keep looking while anything is mid-read, so "Reading…" turns into "Ready" by itself
  useEffect(() => {
    if (!stillReading) return undefined;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [stillReading, load]);

  const del = async (id, title) => {
    if (!window.confirm(`Remove “${title}” from ${mine}? The document and its passages are deleted.`)) return;
    setErr('');
    try { await apiFetch(`/beaiready/knowhow/sources/${id}`, { method: 'DELETE' }); load(); onChanged?.(); }
    catch (e) { setErr(e.message); }
  };

  if (!data) return null;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 18 }}>
        <div className="hub-section-label" style={{ margin: 0, flex: 1 }}>In {mine} ({sources.length})</div>
        {stillReading > 0 && <span style={{ ...muted, fontSize: 11.5 }}>{stillReading} still being read…</span>}
      </div>
      {sources.length === 0 ? (
        <p style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>Nothing yet. Add the mine&rsquo;s own documents plus your reporting above.</p>
      ) : (
        <div style={{ ...card, marginTop: 4, padding: 0, overflow: 'hidden' }}>
          {sources.map((s) => {
            const st = docState(s);
            return (
              <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f7f3ee', flexWrap: 'wrap' }}>
                <span style={{ ...pill, ...(ROLE_PILL[s.role] || {}), flex: '0 0 auto' }}>{ROLE_LABEL[s.role] || s.role}</span>
                <span style={{ fontSize: 12.5, flex: '1 1 180px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                <span title={st.hint} style={{ fontSize: 11.5, fontWeight: 700, color: st.tone, flex: '0 0 auto' }}>{st.label}</span>
                <button onClick={() => del(s.id, s.title)} style={{ ...tag, color: '#b91c1c', fontSize: 11 }}>Remove</button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const ORG_CRITERIA = '__org_criteria__';   // destination: applies to every mine, not one

function UnfiledPanel({ mines, setErr, onFiled }) {
  const [items, setItems] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [dest, setDest] = useState('');
  const [role, setRole] = useState('claim');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const load = useCallback(() => apiFetch('/beaiready/knowhow/claims/unassigned').then((d) => setItems(d.sources || [])).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!dest && mines.length) setDest(mines[0].name); }, [mines, dest]);

  const shown = (items || []).filter((s) => !q.trim() || (s.title || '').toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isOrg = dest === ORG_CRITERIA;

  const fileSelected = async () => {
    if (!picked.size) { setErr('Tick the documents you want to file first.'); return; }
    setBusy(true); setErr('');
    try {
      const body = isOrg ? { ids: [...picked], collection: null, role: 'criteria' } : { ids: [...picked], collection: dest, role };
      const r = await apiFetch('/beaiready/knowhow/claims/unassigned', { method: 'PATCH', body: JSON.stringify(body) });
      setPicked(new Set()); load(); onFiled?.();
      if (!r.updated) setErr('Nothing was filed.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!items || !items.length) return null;
  return (
    <>
      <div className="hub-section-label" style={{ marginTop: 18 }}>Documents not filed to a mine yet ({items.length})</div>
      <div style={{ ...card, margin: '4px 0 22px' }}>
        <p style={{ ...muted, fontSize: 12, margin: '0 0 8px' }}>
          These are on file and fully searchable — they just take no part in any comparison until you say what they are.
          Tick several at once: the mine's own reports are <b>claims</b>, your work is <b>reporting</b>, and a law or standard is
          <b> judging criteria for all mines</b>.
        </p>

        {/* the bulk bar — one destination + one role for everything ticked */}
        <div style={{ ...card, background: '#faf8f5', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={() => setPicked(new Set(shown.map((s) => s.id)))} style={tag}>Select all {q.trim() ? 'shown' : ''}</button>
          <button onClick={() => setPicked(new Set())} style={tag}>Clear</button>
          <span style={{ ...muted, fontSize: 12.5, fontWeight: 700 }}>{picked.size} selected</span>
          <span style={{ ...muted, fontSize: 12 }}>→ file as</span>
          <select value={dest} onChange={(e) => setDest(e.target.value)} style={sel}>
            {mines.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            <option value={ORG_CRITERIA}>⚖ Judging criteria — all mines</option>
          </select>
          {!isOrg && (
            <select value={role} onChange={(e) => setRole(e.target.value)} style={sel}>
              <option value="claim">What the mine claims</option>
              <option value="reporting">Your reporting</option>
              <option value="external">External source</option>
              <option value="criteria">Criteria for this mine only</option>
            </select>
          )}
          <button onClick={fileSelected} disabled={busy || !picked.size} style={btn}>
            {busy ? 'Filing…' : `File ${picked.size || ''} document${picked.size === 1 ? '' : 's'}`}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by filename… (e.g. “Bikita”, “Act”)" style={{ ...input, flex: '1 1 200px' }} />
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #f2ece4', borderRadius: 8 }}>
          {shown.length === 0 ? <p style={{ ...muted, fontSize: 12, padding: 10, margin: 0 }}>Nothing matches “{q}”.</p> : shown.map((s) => (
            <label key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #f7f3ee', cursor: 'pointer', background: picked.has(s.id) ? '#fdf6f3' : 'transparent' }}>
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{s.title || '(untitled)'}</span>
              <span style={{ ...muted, fontSize: 11 }}>{KIND_LABEL[s.kind] || s.kind}</span>
            </label>
          ))}
        </div>
        <div style={{ ...muted, fontSize: 11, marginTop: 6 }}>Showing {shown.length} of {items.length}. Filing marks that mine for re-checking, so the next Check folds them in.</div>
      </div>
    </>
  );
}

// Generated reports: each run is kept and stamped, so results accumulate into a record
// the newsroom can look back through as more evidence lands.
function ReportsPanel({ mines, setErr, onOpen, onCount }) {
  const [reports, setReports] = useState(null);
  const [scope, setScope] = useState('');
  const [kind, setKind] = useState('inconsistencies');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const load = useCallback(() => apiFetch('/beaiready/knowhow/claims/reports').then((d) => setReports(d.reports || [])).catch((e) => setErr(e.message)), [setErr]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (reports) onCount?.(reports.length); }, [reports, onCount]);

  const gen = async () => {
    setBusy(true); setErr('');
    try {
      const r = await apiFetch('/beaiready/knowhow/claims/reports', { method: 'POST', body: JSON.stringify({ collection: scope || null, kind }) });
      load();
      // You asked for a report — so show the report, not a row you then have to hunt for.
      if (r?.id) { try { setViewing(await apiFetch(`/beaiready/knowhow/claims/reports/${r.id}`)); } catch { /* the list still has it */ } }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const open = async (id) => { setErr(''); try { setViewing(await apiFetch(`/beaiready/knowhow/claims/reports/${id}`)); } catch (e) { setErr(e.message); } };
  const del = async (id) => {
    if (!window.confirm('Delete this saved report? It is the record of what you knew on that date.')) return;
    try { await apiFetch(`/beaiready/knowhow/claims/reports/${id}`, { method: 'DELETE' }); setViewing(null); load(); } catch (e) { setErr(e.message); }
  };
  const when = (t) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const summarise = (r) => r.kind === 'inconsistencies'
    ? `${r.stats.inconsistencies ?? 0} inconsistenc${(r.stats.inconsistencies ?? 0) === 1 ? 'y' : 'ies'} · ${r.stats.contradicted ?? 0} contradicted · ${r.stats.misleading ?? 0} misleading`
    : `${r.stats.untested ?? 0} untestable claim(s) · ${r.stats.unused ?? 0} unmatched source(s) · ${r.stats.minesMissingASide ?? 0} mine(s) missing a side`;

  return (
    <>
      <div style={{ ...card, margin: '4px 0 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...muted, fontSize: 13 }}>Build a report on</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={sel}>
          <option value="inconsistencies">Inconsistencies</option>
          <option value="gaps">Gaps in the data</option>
        </select>
        <span style={{ ...muted, fontSize: 13 }}>for</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={sel}>
          <option value="">All mines</option>
          {mines.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
        <button onClick={gen} disabled={busy} style={btn}>{busy ? 'Building…' : 'Generate report'}</button>
        <span style={{ ...muted, fontSize: 11.5, flex: 1 }}>Each report is stamped and kept — generate again as evidence lands and you build a record over time.</span>
      </div>

      {reports == null ? <p style={muted}>Loading…</p> : reports.length === 0 ? (
        <p style={{ ...muted, fontSize: 12.5 }}>No reports yet. Generate one above and it becomes the first entry in your record.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {reports.map((r) => (
            <div key={r.id} style={{ ...card, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <button onClick={() => open(r.id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#1c1b1a', cursor: 'pointer' }}>{r.title} →</button>
                <div style={{ ...muted, fontSize: 11.5 }}>{when(r.generated_at)} · {summarise(r)}</div>
              </div>
              <button onClick={() => del(r.id)} style={{ ...tag, color: '#b91c1c', fontSize: 11 }}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <div style={{ ...card, marginTop: 12, background: '#faf8f5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 15 }}>{viewing.title}</strong>
              <div style={{ ...muted, fontSize: 11.5 }}>As at {when(viewing.generated_at)} — a snapshot, not a live view.</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => window.print()} style={tag}>Print</button>
              <button onClick={() => setViewing(null)} style={tag}>Close</button>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {viewing.kind === 'inconsistencies'
              ? <Inconsistencies items={viewing.payload.inconsistencies || []} onOpen={onOpen} />
              : <GapsPanel a={{ untested: viewing.payload.untested || [], unused: viewing.payload.unused || [], balance: viewing.payload.balance || [] }} onOpen={onOpen} />}
          </div>
        </div>
      )}
    </>
  );
}

// Where the inconsistencies are: one row per mine, ranked by claims that don't hold up.
function InconsistencyTable({ mines, onJump }) {
  if (!mines.length) return <p style={muted}>No mines yet — add your first below.</p>;
  const ranked = [...mines].sort((a, b) => ((b.counts.contradicted || 0) + (b.counts.misleading || 0)) - ((a.counts.contradicted || 0) + (a.counts.misleading || 0)));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {ranked.map((m) => {
        const bad = (m.counts.contradicted || 0) + (m.counts.misleading || 0);
        const tested = m.claims - (m.counts.pending || 0);
        return (
          <div key={m.name} style={{ ...card, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => onJump(m.name)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 14.5, fontWeight: 800, color: '#1c1b1a', cursor: 'pointer' }}>{m.name} →</button>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: bad ? VERDICT_COLORS.contradicted : '#8a8076' }}>
                {bad ? `${bad} of ${tested} claims don't hold up` : tested ? 'nothing contradicted yet' : 'not tested yet'}
              </span>
            </div>
            <div style={{ ...muted, fontSize: 11, marginTop: 2 }}>
              {m.sources.claim} claim docs · {m.sources.reporting} reporting · {m.sources.external} external
            </div>
            <VerdictBar counts={m.counts} />
          </div>
        );
      })}
    </div>
  );
}

// The job is a process, so the tabs are its steps, in the order you do them.
const STEPS = [
  { key: 'mines', n: 1, label: 'Mines', hint: 'Step 1 — which mines are you tracking? Everything else hangs off these.' },
  { key: 'criteria', n: 2, label: 'Criteria', hint: 'Step 2 — the standards you judge claims against. Optional, but it is what makes a verdict defensible.' },
  { key: 'evidence', n: 3, label: 'Evidence', hint: 'Step 3 — for each mine: what they claim, your reporting, and independent sources.' },
  { key: 'check', n: 4, label: 'Check', hint: 'Step 4 — test every claim against the evidence and your criteria.' },
  { key: 'results', n: 5, label: 'Results', hint: 'Step 5 — what does not match, and what is missing on either side.' },
  { key: 'reports', n: 6, label: 'Reports', hint: 'Step 6 — save a stamped snapshot, search everything, export.' },
];

// One-click preset — Moses doesn't need database access to load the exact framework.
const ZESGI_PRESET = [
  { name: 'Environmental Protection & Ecological Rehabilitation', weight: 35, definition: 'Ecosystem protection, pollution prevention, and progressive rehabilitation of disturbed land.' },
  { name: 'Water Security & Climate Resilience', weight: 25, definition: 'Watercourse and catchment protection, discharge control, and climate adaptation.' },
  { name: 'Community Integration, Socio-Economic Rights & Benefit Sharing', weight: 20, definition: 'Local employment, community investment, and fair benefit sharing.' },
  { name: 'Statutory Compliance, Transparency & Institutional Governance', weight: 20, definition: 'Compliance with law, public disclosure, and institutional governance.' },
];

// The rating framework itself — a WEIGHTED pillar list claims are tagged and rated against.
// Admins edit it (or load the ZES-GI preset in one click); everyone else sees the rubric
// being applied, read-only, so the team understands what "rated" means before trusting it.
function PillarEditor({ isAdmin, setErr, onSaved }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => apiFetch('/beaiready/knowhow/claims/pillars/config').then((d) => setRows(d.pillars || [])).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);

  const setRow = (i, patch) => setRows((r) => r.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addRow = () => setRows((r) => [...r, { name: '', weight: 0, definition: '' }]);
  const delRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const loadPreset = () => { setRows(ZESGI_PRESET); setOpen(true); };
  const totalWeight = (rows || []).reduce((a, p) => a + (Number(p.weight) || 0), 0);
  const save = async () => {
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/knowhow/claims/pillars/config', { method: 'PUT', body: JSON.stringify({ pillars: rows }) }); onSaved?.(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (rows === null) return null;
  if (!isAdmin) {
    if (!rows.length) return null;
    return (
      <div style={{ ...card, marginBottom: 12, background: '#faf8f5' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Rating framework in use</div>
        {rows.map((p) => (
          <div key={p.name} style={{ fontSize: 12.5, color: '#5b5249', marginTop: 2 }}>{p.name} <span style={muted}>· {p.weight}%</span></div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ ...card, marginBottom: 12, borderColor: '#f0e4c4', background: '#fffdf7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Rating framework <span style={{ ...muted, fontWeight: 400 }}>— the weighted pillars claims are tagged and rated against</span></div>
          {rows.length > 0 && <div style={{ ...muted, fontSize: 11.5 }}>{rows.length} pillar{rows.length === 1 ? '' : 's'} · {totalWeight}% weight{totalWeight !== 100 ? ' (doesn’t total 100 — that’s fine if intentional)' : ''}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!rows.length && <button onClick={loadPreset} style={btn}>Use ZES-GI framework</button>}
          <button onClick={() => setOpen(!open)} style={tag}>{open ? 'Close' : rows.length ? 'Edit' : 'Set up manually'}</button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {rows.map((p, i) => (
            <div key={i} style={{ ...card, padding: '8px 10px', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={p.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Pillar name" style={{ ...input, flex: 1 }} />
                <input type="number" min="0" max="100" value={p.weight} onChange={(e) => setRow(i, { weight: Number(e.target.value) })} placeholder="%" style={{ ...input, width: 64 }} />
                <button onClick={() => delRow(i)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
              </div>
              <textarea value={p.definition} onChange={(e) => setRow(i, { definition: e.target.value })} placeholder="What this pillar means — the ideal situation being tested for" style={{ ...input, minHeight: 40, fontSize: 12.5, resize: 'vertical' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addRow} style={tag}>Add pillar</button>
            {rows.length > 0 && <button onClick={loadPreset} style={tag}>Replace with ZES-GI framework</button>}
            <button onClick={save} disabled={busy} style={{ ...btn, marginLeft: 'auto' }}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const PILLAR_STATUS = {
  rated:       { label: 'Rated', color: '#166534' },
  thin:        { label: 'Thin data', color: '#b45309' },
  no_evidence: { label: 'No evidence yet', color: '#b91c1c' },
  no_claims:   { label: 'No claims mapped', color: '#b91c1c' },
};

// The thematic, weighted view the framework exists to produce — every pillar shown, gaps
// stated plainly rather than a false all-clear, so a missing rating reads as missing data.
function PillarRatings({ collection, reloadKey, title }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    const qs = collection ? `?collection=${encodeURIComponent(collection)}` : '';
    apiFetch(`/beaiready/knowhow/claims/pillars${qs}`).then(setR).catch(() => setR(null));
  }, [collection, reloadKey]);
  if (!r || !r.pillars.length) return null;
  return (
    <div style={{ margin: collection ? '10px 0' : '8px 0 14px' }}>
      {title && <div className="hub-section-label" style={{ marginBottom: 4 }}>{title}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>{r.overallScore != null ? `${r.overallScore}/100` : '—'}</span>
        <span style={{ ...muted, fontSize: 12 }}>
          weighted across {r.pillars.filter((p) => p.score != null).length} of {r.pillars.length} pillars
          {r.weightCovered < r.totalWeight ? ` (${r.weightCovered}% of ${r.totalWeight}% framework weight has enough data)` : ''}
        </span>
      </div>
      {r.gaps.length > 0 && (
        <div style={{ ...card, marginBottom: 8, background: '#fef2f2', borderColor: '#fecaca' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', marginBottom: 3 }}>
            {r.gaps.length} pillar{r.gaps.length === 1 ? '' : 's'} can’t be rated yet — add data to improve this
          </div>
          {r.gaps.map((g) => (
            <div key={g.name} style={{ fontSize: 12, color: '#7f1d1d', marginTop: 1 }}>
              <b>{g.name}</b> ({g.weight}% weight) — {g.status === 'no_claims' ? 'no claims map to this pillar yet' : 'claims exist, but nothing to test them against'}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 7 }}>
        {r.pillars.map((p) => {
          const st = PILLAR_STATUS[p.status];
          return (
            <div key={p.name} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name} <span style={{ ...muted, fontWeight: 400, fontSize: 11.5 }}>· {p.weight}%</span></span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color }}>{p.score != null ? `${p.score}/100 · ${p.band}` : st.label}</span>
              </div>
              {p.score != null && (
                <div style={{ height: 8, borderRadius: 4, background: '#ece6dc', marginTop: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${p.score}%`, height: '100%', background: st.color }} />
                </div>
              )}
              <div style={{ ...muted, fontSize: 11, marginTop: 4 }}>
                {p.tested} tested of {p.total} claim{p.total === 1 ? '' : 's'} mapped to this pillar
                {p.status === 'thin' && ' — below 3 tested claims, treat this rating as provisional'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClaimsWorkspace({ setErr, isAdmin }) {
  const [mines, setMines] = useState(null);
  const [report, setReport] = useState(null);
  const [allClaims, setAllClaims] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [target, setTarget] = useState('');        // mine the upload zones write to
  const [openMine, setOpenMine] = useState(null);  // expanded mine section
  const [verifying, setVerifying] = useState('');
  const [critKey, setCritKey] = useState(0);       // bump to refresh the org-wide criteria list
  const [showSearch, setShowSearch] = useState(false);
  const [step, setStep] = useState(null);          // null until we know where to drop you
  const [critCount, setCritCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [indexing, setIndexing] = useState(0);     // stored but not yet chunked/embedded
  const [docsKey, setDocsKey] = useState(0);       // bump to re-read the mine's document list
  const [pillarsKey, setPillarsKey] = useState(0); // bump to re-fetch pillar ratings

  const loadMines = useCallback(() => apiFetch('/beaiready/knowhow/claims')
    .then((d) => { setMines(d.mines || []); setIndexing(d.indexing || 0); })
    .catch((e) => setErr(e.message)), [setErr]);
  const loadDash = useCallback(() => {
    apiFetch('/beaiready/knowhow/claims/report').then(setReport).catch(() => {});
    apiFetch('/beaiready/knowhow/claims/db/search').then((r) => setAllClaims(r.claims || [])).catch(() => setAllClaims([]));
    apiFetch('/beaiready/knowhow/claims/analysis').then(setAnalysis).catch(() => {});
    // counts drive the step ticks, so they must be true whether or not you've opened that step
    apiFetch('/beaiready/knowhow/claims/criteria').then((d) => setCritCount((d.criteria || []).length)).catch(() => {});
    apiFetch('/beaiready/knowhow/claims/reports').then((d) => setReportCount((d.reports || []).length)).catch(() => {});
  }, []);
  const refresh = useCallback(() => { loadMines(); loadDash(); setPillarsKey((k) => k + 1); }, [loadMines, loadDash]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!target && mines?.length) setTarget(mines[0].name); }, [mines, target]);
  // While a backlog is being read, keep checking so the count clears itself on screen.
  useEffect(() => {
    if (!indexing) return undefined;
    const t = setTimeout(loadMines, 4000);
    return () => clearTimeout(t);
  }, [indexing, loadMines]);
  // Drop you at the first step that still needs you — and at Results once there's an answer.
  useEffect(() => {
    if (step !== null || mines == null) return;
    const tested = mines.some((m) => m.claims > 0);
    const ready = mines.some((m) => m.sources.claim > 0 && (m.sources.reporting + m.sources.external) > 0);
    setStep(!mines.length ? 'mines' : tested ? 'results' : ready ? 'check' : 'evidence');
  }, [mines, step]);

  const delMine = async (name) => {
    if (!window.confirm(`Remove "${name}" from the list? Its documents and verdicts stay.`)) return;
    try { const d = await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(name)}`, { method: 'DELETE' }); setMines(d.mines || []); }
    catch (e) { setErr(e.message); }
  };
  // A Check is minutes of model calls, so the server starts it and we follow along. Nothing
  // here waits on a long request — that's what was timing out.
  const followVerify = useCallback(async (mine) => {
    for (let i = 0; i < 900; i++) {                       // ~30 min ceiling
      await new Promise((r) => setTimeout(r, 2000));
      let s;
      try { s = await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(mine)}/verify-status`); }
      catch { continue; }                                  // a blip shouldn't abandon the run
      if (s.phase === 'extracting') setVerifying(`${mine}: reading the mine's own documents and pulling out its claims…`);
      else if (s.phase === 'checking') setVerifying(`${mine}: testing claim ${Math.min(s.done + 1, s.total)} of ${s.total}${s.claim ? ` — “${s.claim}…”` : ''}`);
      if (!s.running) {
        if (s.phase === 'failed') { setErr(s.error || 'The check failed.'); setVerifying(''); }
        else setVerifying(`${mine}: done — ${s.verified} claim${s.verified === 1 ? '' : 's'} tested.`);
        refresh();
        return s;
      }
    }
    setVerifying(`${mine}: still running — leave it, it finishes on its own.`);
    return null;
  }, [setErr, refresh]);

  // A Check runs on the server, so reloading the page shouldn't look like it stopped — if one
  // is still going for this mine, pick the reporting back up. Declared AFTER followVerify so it
  // isn't referenced in the temporal dead zone (that crashed the whole page — blank screen).
  useEffect(() => {
    if (!target || verifying) return undefined;
    let gone = false;
    apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(target)}/verify-status`)
      .then((s) => { if (!gone && s?.running) followVerify(target); })
      .catch(() => {});
    return () => { gone = true; };
  }, [target, verifying, followVerify]);

  const verifyOne = async () => {
    if (!target) return;
    setErr(''); setVerifying(`${target}: starting…`);
    try { await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(target)}/verify`, { method: 'POST', body: '{}' }); }
    catch (e) { setErr(e.message); setVerifying(''); return; }
    await followVerify(target);
  };
  const verifyAll = async () => {
    if (!mines?.length) return;
    setErr('');
    for (const m of mines) {
      try { await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(m.name)}/verify`, { method: 'POST', body: '{}' }); }
      catch (e) { setErr(e.message); continue; }
      await followVerify(m.name);                          // one at a time: they share the model
    }
    setVerifying('Done — every mine checked.');
    refresh();
  };
  const exp = async (fmt) => {
    setErr('');
    try {
      const headers = {}; const nid = getActiveNewsroomId(); if (nid) headers['X-Newsroom-Id'] = nid;
      const res = await fetch(`/api/beaiready/knowhow/claims/export?format=${fmt}`, { credentials: 'include', headers });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `claims-database.${fmt === 'json' ? 'json' : 'csv'}`; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setErr(e.message); }
  };

  if (mines == null || step === null) return <p style={muted}>Loading…</p>;

  const list = report?.mines || mines;
  const sum = (k) => list.reduce((a, m) => a + (m.counts?.[k] || 0), 0);
  const supported = sum('supported'), contradicted = sum('contradicted'), misleading = sum('misleading'), unverified = sum('unverified'), pending = sum('pending');
  const total = supported + contradicted + misleading + unverified + pending;
  const tested = total - pending;
  const bad = contradicted + misleading;
  const rate = tested ? Math.round((bad / tested) * 100) : 0;
  const sources = list.reduce((a, m) => a + (m.sources.claim + m.sources.reporting + m.sources.external), 0);

  const tmap = {};
  for (const c of (allClaims || [])) for (const th of (c.themes || [])) {
    tmap[th] = tmap[th] || { name: th, total: 0, bad: 0 };
    tmap[th].total++; if (c.verdict === 'contradicted' || c.verdict === 'misleading') tmap[th].bad++;
  }
  const themes = Object.values(tmap).sort((a, b) => b.bad - a.bad || b.total - a.total).slice(0, 6);

  const hasMines = mines.length > 0;
  const readyMines = list.filter((m) => m.sources.claim > 0 && (m.sources.reporting + m.sources.external) > 0);
  const done = { mines: hasMines, criteria: critCount > 0, evidence: readyMines.length > 0, check: total > 0, results: total > 0, reports: reportCount > 0 };
  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const next = STEPS[stepIdx + 1];

  return (
    <>
      {/* The process in order — each tab is a step, and you can see where you are in it. */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #eee5da', marginBottom: 6, flexWrap: 'wrap' }}>
        {STEPS.map((s) => {
          const active = step === s.key;
          return (
            <button key={s.key} onClick={() => { setErr(''); setStep(s.key); }} title={s.hint}
              style={{ ...tabBtn, ...(active ? tabActive : {}), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                fontSize: 10.5, fontWeight: 700, flex: '0 0 auto',
                background: done[s.key] ? '#166534' : active ? '#c75b39' : '#e8e2d8',
                color: done[s.key] || active ? '#fff' : '#8a8076' }}>{done[s.key] ? '✓' : s.n}</span>
              {s.label}
            </button>
          );
        })}
      </div>
      <p style={{ ...muted, fontSize: 12.5, margin: '0 0 16px' }}>{STEPS[stepIdx]?.hint}</p>

      {/* Uploads return the moment the text is stored; the reading happens after. Say so,
          or a big upload looks like it did nothing — or worse, like it was lost. */}
      {indexing > 0 && (
        <div style={{ ...card, background: '#fffdf7', borderColor: '#f0e4c4', margin: '0 0 16px', fontSize: 12.5 }}>
          <b>Reading {indexing} document{indexing === 1 ? '' : 's'}…</b> They are <b>saved</b> — this is KnowHow working
          through them so they can be searched and tested. It carries on by itself, and you can keep adding or leave the
          page; refreshing won&rsquo;t lose anything.
        </div>
      )}

      {/* ── Step 1 · Mines ── */}
      {step === 'mines' && (
        <>
          <MinesBar mines={mines} setErr={setErr} onJump={(n) => { setTarget(n); setStep('evidence'); }}
            onChanged={(n) => { if (n) setTarget(n); refresh(); }} />
          {hasMines && (
            <div style={{ display: 'grid', gap: 8 }}>
              {mines.map((m) => (
                <div key={m.name} style={{ ...card, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 14.5 }}>{m.name}</strong>
                    <div style={{ ...muted, fontSize: 11.5 }}>{m.sources.claim} claim docs · {m.sources.reporting} reporting · {m.sources.external} external</div>
                  </div>
                  <button onClick={() => delMine(m.name)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Step 2 · Criteria ── */}
      {step === 'criteria' && (
        <>
          <p style={{ ...muted, fontSize: 12.5, margin: '0 0 8px', maxWidth: '72ch' }}>
            The standards every mine's claims are measured against — environmental law, rehabilitation norms, disclosure
            rules. Load these <b>before</b> you Check: without them a claim is judged only against your evidence; with them
            it's judged against the law. This step is optional, but it's what makes a verdict defensible.
          </p>
          <PillarEditor isAdmin={isAdmin} setErr={setErr} onSaved={() => setPillarsKey((k) => k + 1)} />
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <DataZone zone={CRITERIA_ZONE} collection={target} setErr={setErr} onAdded={() => { refresh(); setCritKey((k) => k + 1); }} />
            <CriteriaList setErr={setErr} reloadKey={critKey} onCount={setCritCount} />
          </div>
        </>
      )}

      {/* ── Step 3 · Evidence ── */}
      {step === 'evidence' && (!hasMines ? (
        <p style={muted}>Add a mine in step 1 first — evidence has to belong to one.</p>
      ) : (
        <>
          <div style={{ ...card, margin: '0 0 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...muted, fontSize: 13 }}>Add to mine:</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={sel}>
              {mines.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))' }}>
            {MINE_ZONES.map((z) => <DataZone key={z.role} zone={z} collection={target} setErr={setErr}
              onAdded={() => { refresh(); setDocsKey((k) => k + 1); }} />)}
          </div>
          <MineDocuments mine={target} setErr={setErr} reloadKey={docsKey} onChanged={refresh} />
          <UnfiledPanel mines={mines} setErr={setErr} onFiled={() => { refresh(); setDocsKey((k) => k + 1); }} />
        </>
      ))}

      {/* ── Step 4 · Check ── */}
      {step === 'check' && (
        <>
          <div style={{ ...card, marginBottom: 12 }}>
            <p style={{ ...muted, fontSize: 12.5, margin: '0 0 10px' }}>
              This pulls the concrete claims out of each mine's <b>own</b> documents and tests every one against your
              reporting, your independent sources and your criteria. It re-runs itself nightly as you add evidence, so
              you only need to press this when you want an answer now.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={target} onChange={(e) => setTarget(e.target.value)} style={sel}>
                {mines.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
              <button onClick={verifyOne} disabled={!target} style={btn}>Check {target || 'this mine'}</button>
              <button onClick={verifyAll} disabled={!mines.length} style={tag}>Check every mine</button>
              {verifying && <span style={{ ...muted, fontSize: 12 }}>{verifying}</span>}
            </div>
          </div>
          <div className="hub-section-label">Is each mine ready?</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
            {list.map((m) => {
              const missing = [!m.sources.claim ? 'nothing the mine claims' : null, !(m.sources.reporting + m.sources.external) ? 'nothing to test it against' : null].filter(Boolean);
              return (
                <div key={m.name} style={{ ...card, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13.5 }}>{m.name}</strong>
                  <span style={{ fontSize: 12, color: missing.length ? '#b45309' : '#166534', fontWeight: 700 }}>
                    {missing.length ? `Not ready — ${missing.join(' and ')}` : `Ready · ${m.sources.claim} claim docs vs ${m.sources.reporting + m.sources.external} to test against`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Step 5 · Results ── */}
      {step === 'results' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="hub-section-label" style={{ margin: 0 }}>Where the claims don't match the evidence</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => exp('csv')} style={tag}>Export CSV</button>
              <button onClick={() => window.print()} style={tag}>Print</button>
            </div>
          </div>
          {total === 0 ? (
            <div style={{ ...card, margin: '8px 0 20px' }}>
              <p style={{ ...muted, margin: 0 }}>Nothing tested yet — go back to step 4 and press Check.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 0 14px' }}>
                <StatTile value={`${rate}%`} label="Claims that don't hold up" sub={`${bad} of ${tested} tested`} accent={VERDICT_COLORS.contradicted} />
                <StatTile value={contradicted} label="Contradicted" accent={VERDICT_COLORS.contradicted} />
                <StatTile value={misleading} label="Misleading" accent={VERDICT_COLORS.misleading} />
                <StatTile value={supported} label="Supported" accent={VERDICT_COLORS.supported} />
                <StatTile value={unverified} label="Not settled" />
                <StatTile value={list.length} label={`Mine${list.length === 1 ? '' : 's'}`} />
                <StatTile value={sources} label="Documents" />
              </div>
              <PillarRatings collection={null} reloadKey={pillarsKey} title="By pillar — the whole portfolio" />
              {analysis && (
                <>
                  <div className="hub-section-label" style={{ marginTop: 16 }}>What they claim vs what you found</div>
                  <div style={{ marginTop: 4 }}><Inconsistencies items={analysis.inconsistencies} onOpen={(n) => setOpenMine(n)} /></div>
                </>
              )}
              <div className="hub-section-label" style={{ marginTop: 20 }}>By mine</div>
              <div style={{ marginTop: 4 }}><InconsistencyTable mines={list} onJump={(n) => setOpenMine(n)} /></div>
              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', margin: '16px 0 22px' }}>
                <div>
                  <div className="hub-section-label">Themes — where they cluster</div>
                  <div style={{ ...card, marginTop: 4 }}><ThemeBars themes={themes} /></div>
                </div>
                <div>
                  <div className="hub-section-label">Found over time</div>
                  <div style={{ ...card, marginTop: 4 }}><TrendChart snapshots={report?.snapshots} /></div>
                </div>
              </div>
            </>
          )}

          {analysis && (analysis.untested.length > 0 || analysis.unused.length > 0 || analysis.balance.some((b) => b.missing.length)) && (
            <>
              <div className="hub-section-label" style={{ marginTop: 18 }}>Gaps in the data — both sides</div>
              <div style={{ margin: '4px 0 22px' }}><GapsPanel a={analysis} onOpen={(n) => setOpenMine(n)} /></div>
            </>
          )}

          <div className="hub-section-label">Mines &amp; their claims</div>
          {mines.length === 0 ? <p style={muted}>No mines yet.</p> : (
            <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
              {mines.map((m) => (
                <div key={m.name} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setOpenMine(openMine === m.name ? null : m.name)}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 15, fontWeight: 800, color: '#1c1b1a', cursor: 'pointer' }}>
                      {openMine === m.name ? '▾' : '▸'} {m.name}
                    </button>
                    <span style={{ ...muted, fontSize: 11.5 }}>{m.claims} claim{m.claims === 1 ? '' : 's'}</span>
                  </div>
                  <VerdictBar counts={m.counts} />
                  {openMine === m.name && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #eee5da', paddingTop: 10 }}>
                      <PillarRatings collection={m.name} reloadKey={pillarsKey} title={`By pillar — ${m.name}`} />
                      <MineView setErr={setErr} mine={m.name} embedded onChanged={refresh} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Step 6 · Reports ── */}
      {step === 'reports' && (
        <>
          <ReportsPanel mines={mines} setErr={setErr} onOpen={(n) => { setOpenMine(n); setStep('results'); }} onCount={setReportCount} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 0' }}>
            <div className="hub-section-label" style={{ margin: 0, flex: 1 }}>Search every claim</div>
            <button onClick={() => setShowSearch(!showSearch)} style={tag}>{showSearch ? 'Hide' : 'Open search'}</button>
          </div>
          {showSearch && <div style={{ marginTop: 8 }}><ClaimsDatabase setErr={setErr} embedded open={(n) => { setOpenMine(n); setStep('results'); }} /></div>}
        </>
      )}

      {/* onward — the process has an end */}
      {next && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24, paddingTop: 12, borderTop: '1px solid #eee5da' }}>
          <button onClick={() => { setErr(''); setStep(next.key); }} style={btn}>Next: {next.n}. {next.label} →</button>
        </div>
      )}
    </>
  );
}

// Org-wide judging criteria — the standards every mine's claims are tested against.
// The org-wide criteria on file — adding is done in the "Judging criteria" zone above.
function CriteriaList({ setErr, reloadKey, onCount }) {
  const [items, setItems] = useState(null);
  const load = useCallback(() => apiFetch('/beaiready/knowhow/claims/criteria').then((d) => setItems(d.criteria || [])).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load, reloadKey]);
  useEffect(() => { if (items) onCount?.(items.length); }, [items, onCount]);
  const del = async (id) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/sources/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };
  if (!items) return null;
  if (!items.length) {
    return (
      <div style={{ ...card, background: '#fffdf7', borderColor: '#f0e4c4' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Criteria on file</div>
        <p style={{ ...muted, fontSize: 12, margin: 0 }}>None yet. Until you add criteria, claims are judged on your evidence alone.</p>
      </div>
    );
  }
  return (
    <div style={{ ...card, background: '#fffdf7', borderColor: '#f0e4c4' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
        Criteria applying to all mines <span style={{ ...muted, fontWeight: 400 }}>({items.length})</span>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {items.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span>{it.title || 'Criteria'}</span>
            <button onClick={() => del(it.id)} style={{ ...tag, color: '#b91c1c', fontSize: 11 }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}


// `embedded` renders just the mine's claims/verdicts/sources inline on the single claims
// page — the back button, title and add-evidence card are provided by the page around it.
function MineView({ setErr, mine, back, embedded = false, onChanged }) {
  const [data, setData] = useState(null);
  const [role, setRole] = useState('claim');
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState('');
  const [url, setUrl] = useState('');
  const [ttl, setTtl] = useState('');
  const [text, setText] = useState('');
  const [mc, setMc] = useState('');
  const [driveFolder, setDriveFolder] = useState('');
  const [caps, setCaps] = useState({});
  const load = useCallback(() => apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(mine)}`).then(setData).catch((e) => setErr(e.message)), [mine, setErr]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiFetch('/beaiready/knowhow/sources/capabilities').then(setCaps).catch(() => {}); }, []);

  const addClaim = async () => {
    if (!mc.trim()) return;
    setErr('');
    try { const d = await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(mine)}/claim`, { method: 'POST', body: JSON.stringify({ text: mc.trim() }) }); setData(d); setMc(''); }
    catch (e) { setErr(e.message); }
  };
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
    if (!fileList || !fileList.length) return;
    setBusy(true); setErr('');
    try {
      const r = await uploadFileList(fileList, { collection: mine, role });
      if (!r.added) setErr(r.error || 'Nothing uploaded.');
      else { if (r.skipped) setErr(`Uploaded ${r.added}; skipped ${r.skipped} unsupported file(s).`); load(); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const addDrive = async () => {
    if (!driveFolder.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await apiFetch('/beaiready/knowhow/sources/drive', { method: 'POST', body: JSON.stringify({ folder: driveFolder.trim(), ...meta() }) });
      if (r?.error) setErr(r.message || 'Drive import failed.');
      else { setDriveFolder(''); load(); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const verify = async () => {
    setVerifying('Extracting claims and checking them against your evidence…'); setErr('');
    try { const r = await apiFetch(`/beaiready/knowhow/claims/${encodeURIComponent(mine)}/verify`, { method: 'POST', body: '{}' }); setVerifying(`Done — ${r.verified} claim(s) checked.`); load(); onChanged?.(); }
    catch (e) { setErr(e.message); setVerifying(''); }
  };
  const delSource = async (id) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/sources/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };

  if (!data) return <p style={muted}>Loading…</p>;
  return (
    <>
      {!embedded && <button onClick={back} style={{ ...tag, marginBottom: 10 }}>← All mines</button>}
      {!embedded && <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 2px' }}>{mine}</h2>}
      {!embedded && <VerdictBar counts={data.counts} />}

      {!embedded && (
      <div style={{ ...card, margin: '14px 0', display: 'grid', gap: 8 }}>
        <div style={kicker}>Add evidence to this bucket</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...muted, fontSize: 13 }}>This is a</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={sel}>
            <option value="claim">Company's own claim</option>
            <option value="reporting">EnviroPress reporting</option>
            <option value="external">External source</option>
            <option value="criteria">Judging criteria</option>
          </select>
          <label style={{ ...tag, cursor: busy ? 'wait' : 'pointer' }}>Upload files<input type="file" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} /></label>
          <label style={{ ...tag, cursor: busy ? 'wait' : 'pointer' }}>Upload folder<input type="file" hidden webkitdirectory="" directory="" multiple onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} /></label>
        </div>
        <p style={{ ...muted, fontSize: 12, margin: 0 }}>PDF, Word, Excel, CSV or text — a whole folder at once is fine. For a <b>video or audio</b> claim, upload or paste its <b>transcript</b>. <b>Judging criteria</b> are the standards this mine's claims are tested against.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste a web-page URL" style={input} />
          <button onClick={addUrl} disabled={busy || !url.trim()} style={btn}>Add</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={driveFolder} onChange={(e) => setDriveFolder(e.target.value)} disabled={!caps.drive}
            placeholder="…or a Google Drive folder link" style={input} />
          <button onClick={addDrive} disabled={busy || !caps.drive || !driveFolder.trim()} style={btn}>Import</button>
        </div>
        <p style={{ ...muted, fontSize: 12, margin: 0 }}>
          {caps.drive
            ? 'Share the Drive folder as “anyone with the link (Viewer)” — Google Docs, PDFs and Word files are imported.'
            : 'Google Drive import needs a Google API key on the server — ask your Be AI Ready consultant to enable it. Folder upload above works now.'}
        </p>
        <input value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="…or a note title (optional)" style={input} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste text — a claim, a finding, a quote" style={{ ...input, minHeight: 56, resize: 'vertical' }} />
        <div><button onClick={addNote} disabled={busy || !text.trim()} style={btn}>Add note</button></div>
      </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 8px' }}>
        <div className="hub-section-label" style={{ margin: 0, flex: 1 }}>Claims &amp; verdicts</div>
        <button onClick={verify} style={btn}>Verify claims</button>
      </div>
      <p style={{ ...muted, fontSize: 12, margin: '0 0 8px' }}>Verify extracts claims from the company's own documents and tests them. Verdicts also refresh automatically each night as you add evidence. You can also log a claim by hand:</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={mc} onChange={(e) => setMc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClaim()} placeholder="Add a claim to test by hand…" style={input} />
        <button onClick={addClaim} disabled={!mc.trim()} style={tag}>Add claim</button>
      </div>
      {verifying && <p style={{ ...muted, fontSize: 12.5, margin: '0 0 8px' }}>{verifying}</p>}
      {data.claims.length === 0 ? (
        <p style={muted}>No claims yet. Add the mine's own documents as “Company's own claim”, then hit <b>Verify</b> to extract and test them against your reporting and external sources.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.claims.map((cl) => <ClaimCard key={cl.id} cl={cl} onChange={load} setErr={setErr} />)}
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

// A claim with full editorial controls: evidence + counterclaims, history, and an edit
// panel to override/lock the verdict, set status, and add reporter notes.
function ClaimCard({ cl, onChange, setErr }) {
  const [editing, setEditing] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [form, setForm] = useState({ verdict: cl.verdict, status: cl.status || 'open', locked: !!cl.locked, notes: cl.notes || '' });
  const [cc, setCc] = useState({ text: '', attribution: '' });
  const save = async () => {
    setErr('');
    try { await apiFetch(`/beaiready/knowhow/claims/claim/${cl.id}`, { method: 'PATCH', body: JSON.stringify(form) }); setEditing(false); onChange(); }
    catch (e) { setErr(e.message); }
  };
  const addCounter = async () => {
    if (!cc.text.trim()) return;
    setErr('');
    try { await apiFetch(`/beaiready/knowhow/claims/claim/${cl.id}/counter`, { method: 'POST', body: JSON.stringify(cc) }); setCc({ text: '', attribution: '' }); setShowCc(false); onChange(); }
    catch (e) { setErr(e.message); }
  };
  const delEvidence = async (id) => { setErr(''); try { await apiFetch(`/beaiready/knowhow/claims/evidence/${id}`, { method: 'DELETE' }); onChange(); } catch (e) { setErr(e.message); } };
  const events = Array.isArray(cl.events) ? cl.events.filter((e) => e.event_type === 'verdict_changed' || e.event_type === 'verdict_overridden') : [];
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ ...pill, background: `${VERDICT_COLORS[cl.verdict]}22`, color: VERDICT_COLORS[cl.verdict], border: `1px solid ${VERDICT_COLORS[cl.verdict]}` }}>{VERDICT_LABEL[cl.verdict] || cl.verdict}</span>
        {cl.locked && <span title="Verdict locked by an editor — the AI won't change it" style={{ fontSize: 11 }}>🔒</span>}
        {typeof cl.confidence === 'number' && <span style={{ ...muted, fontSize: 11 }}>{Math.round(cl.confidence * 100)}% conf.</span>}
        {cl.status && cl.status !== 'open' && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359' }}>{STATUS_LABEL[cl.status] || cl.status}</span>}
        <strong style={{ fontSize: 13.5, flexBasis: '100%' }}>{cl.claim_text}</strong>
      </div>
      {Array.isArray(cl.themes) && cl.themes.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
          {cl.themes.map((t, i) => <span key={i} style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' }}>{t}</span>)}
        </div>
      )}
      {cl.rationale && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{cl.rationale}</p>}
      {Array.isArray(cl.evidence) && cl.evidence.length > 0 && (
        <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
          {cl.evidence.map((e) => (
            <div key={e.id || `${e.stance}${e.title}`} style={{ borderLeft: `3px solid ${STANCE_COLOR[e.stance] || '#e4dcd2'}`, padding: '1px 0 1px 8px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: STANCE_COLOR[e.stance] || '#8a8076' }}>
                  {STANCE_LABEL[e.stance] || e.stance}{e.title ? ` · ${e.title}` : ''}{e.role ? ` · ${ROLE_LABEL[e.role] || e.role}` : ''}
                </div>
                {e.quote && <div style={{ fontSize: 12, color: '#5b5249', fontStyle: 'italic' }}>“{e.quote}”</div>}
              </div>
              {e.manual && <button onClick={() => delEvidence(e.id)} title="Remove" style={{ ...tag, fontSize: 10, padding: '2px 6px', alignSelf: 'start' }}>✕</button>}
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div style={{ ...muted, fontSize: 11, marginTop: 7 }}>
          History: {events.slice(0, 5).reverse().map((e, i) => (
            <span key={i}>{i > 0 ? ' → ' : ''}{VERDICT_LABEL[e.new_verdict] || e.new_verdict}{e.event_type === 'verdict_overridden' ? ' ✎' : ''} <span style={{ opacity: 0.65 }}>{new Date(e.created_at).toLocaleDateString()}</span></span>
          ))}
        </div>
      )}
      {cl.notes && !editing && <div style={{ fontSize: 12, color: '#6b6359', marginTop: 6, borderLeft: '3px solid #e4dcd2', paddingLeft: 8 }}>📝 {cl.notes}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => setEditing(!editing)} style={{ ...tag, fontSize: 11 }}>{editing ? 'Cancel' : 'Edit verdict / status'}</button>
        <button onClick={() => setShowCc(!showCc)} style={{ ...tag, fontSize: 11 }}>Add counterclaim</button>
      </div>
      {editing && (
        <div style={{ ...card, marginTop: 8, display: 'grid', gap: 8, background: '#faf8f5' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12 }}>Verdict <select value={form.verdict} onChange={(e) => setForm({ ...form, verdict: e.target.value })} style={sel}>{VERDICT_CHOICES.map((v) => <option key={v} value={v}>{VERDICT_LABEL[v] || v}</option>)}</select></label>
            <label style={{ fontSize: 12 }}>Status <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={sel}>{CLAIM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })} /> Lock (AI won't change it)</label>
          </div>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reporter notes…" style={{ ...input, minHeight: 44, resize: 'vertical' }} />
          <div><button onClick={save} style={btn}>Save</button></div>
        </div>
      )}
      {showCc && (
        <div style={{ ...card, marginTop: 8, display: 'grid', gap: 8, background: '#faf8f5' }}>
          <textarea value={cc.text} onChange={(e) => setCc({ ...cc, text: e.target.value })} placeholder="The counterclaim — an opposing statement…" style={{ ...input, minHeight: 44, resize: 'vertical' }} />
          <input value={cc.attribution} onChange={(e) => setCc({ ...cc, attribution: e.target.value })} placeholder="Who says it (attribution, optional)" style={input} />
          <div><button onClick={addCounter} disabled={!cc.text.trim()} style={btn}>Add counterclaim</button></div>
        </div>
      )}
    </div>
  );
}

// The cross-mine claims database: search + filters + export.
function ClaimsDatabase({ setErr, back, open, embedded = false }) {
  const [f, setF] = useState({ q: '', mine: '', verdict: '', theme: '', status: '' });
  const [rows, setRows] = useState(null);
  const [mines, setMines] = useState([]);
  const [themes, setThemes] = useState([]);
  const run = useCallback(() => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    apiFetch(`/beaiready/knowhow/claims/db/search${qs ? `?${qs}` : ''}`).then((d) => setRows(d.claims || [])).catch((e) => setErr(e.message));
  }, [f, setErr]);
  useEffect(() => { run(); }, [run]);
  useEffect(() => {
    apiFetch('/beaiready/knowhow/claims').then((d) => setMines((d.mines || []).map((m) => m.name))).catch(() => {});
    apiFetch('/beaiready/knowhow/claims/db/themes').then((d) => setThemes(d.themes || [])).catch(() => {});
  }, []);
  const exp = async (fmt) => {
    setErr('');
    try {
      const headers = {}; const nid = getActiveNewsroomId(); if (nid) headers['X-Newsroom-Id'] = nid;
      const res = await fetch(`/api/beaiready/knowhow/claims/export?format=${fmt}`, { credentials: 'include', headers });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `claims-database.${fmt === 'json' ? 'json' : 'csv'}`; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setErr(e.message); }
  };
  return (
    <>
      {!embedded && <button onClick={back} style={{ ...tag, marginBottom: 10 }}>← All mines</button>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {!embedded && <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Claims database</h2>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => exp('csv')} style={tag}>Export CSV</button>
          <button onClick={() => exp('json')} style={tag}>Export JSON</button>
        </div>
      </div>
      <div style={{ ...card, margin: '10px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search claim text…" style={{ ...input, flex: '1 1 200px' }} />
        <select value={f.mine} onChange={(e) => setF({ ...f, mine: e.target.value })} style={sel}><option value="">All mines</option>{mines.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        <select value={f.verdict} onChange={(e) => setF({ ...f, verdict: e.target.value })} style={sel}><option value="">Any verdict</option>{VERDICT_CHOICES.map((v) => <option key={v} value={v}>{VERDICT_LABEL[v]}</option>)}</select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={sel}><option value="">Any status</option>{CLAIM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <select value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} style={sel}><option value="">Any theme</option>{themes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      </div>
      {rows == null ? <p style={muted}>Loading…</p> : rows.length === 0 ? <p style={muted}>No claims match.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: '#8a8076' }}><th style={th}>Mine</th><th style={th}>Claim</th><th style={th}>Verdict</th><th style={th}>Status</th><th style={th}>Themes</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #eee5da' }}>
                  <td style={td}><button onClick={() => open(r.collection)} style={{ background: 'none', border: 'none', padding: 0, color: '#c75b39', cursor: 'pointer', fontSize: 13 }}>{r.collection}</button></td>
                  <td style={{ ...td, maxWidth: 360 }}>{r.claim_text}</td>
                  <td style={td}><span style={{ color: VERDICT_COLORS[r.verdict], fontWeight: 700 }}>{VERDICT_LABEL[r.verdict] || r.verdict}</span></td>
                  <td style={td}>{STATUS_LABEL[r.status] || r.status}</td>
                  <td style={td}>{(r.themes || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

function StatTile({ value, label, sub, accent }) {
  return (
    <div style={{ ...card, padding: '12px 14px', flex: '1 1 130px', minWidth: 118 }}>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.05, color: accent || '#1c1b1a' }}>{value}</div>
      <div style={{ ...muted, fontSize: 12, marginTop: 3 }}>{label}</div>
      {sub != null && <div style={{ fontSize: 11, color: '#8a8076', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// Horizontal bars: theme by claim count, with the false/misleading share filled red.
function ThemeBars({ themes }) {
  if (!themes.length) return <p style={muted}>No themes yet — run Verify and KnowHow tags each claim by topic.</p>;
  const max = Math.max(1, ...themes.map((t) => t.total));
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {themes.map((t) => (
        <div key={t.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{t.name}</span>
            <span style={muted}>{t.total} claim{t.total === 1 ? '' : 's'}{t.bad ? ` · ${t.bad} false/misleading` : ''}</span>
          </div>
          <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid #eee5da', width: `${Math.max(10, (t.total / max) * 100)}%`, background: '#ece6dc' }}>
            {t.bad > 0 && <div style={{ width: `${(t.bad / t.total) * 100}%`, height: '100%', background: VERDICT_COLORS.contradicted }} />}
          </div>
        </div>
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
const sel = { padding: '5px 6px', border: '1px solid #e4dcd2', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' };
const th = { padding: '6px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.03, fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', verticalAlign: 'top' };
