// Ingestion — the unified command-centre for every scraper + AI pipeline.
// Top: an overview of all pipelines (what's coming in, what's been published to
// the user section, what's been synced to the RAG model). Below: manage a
// selected pipeline (Monetisation first) — its sources, the incoming raw-item
// queue, and the AI-compiled items you review → publish → sync to RAG.
import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { apiFetch } from '../../hooks/useApi.js';

export default function IngestionPage() {
  const [overview, setOverview] = useState(null);
  const [domain, setDomain] = useState('monetisation');

  const loadOverview = () => apiFetch('/content-sources/overview').then(setOverview).catch(() => setOverview({ domains: [] }));
  useEffect(() => { loadOverview(); }, []);

  return (
    <div>
      <PageHeader title="Ingestion" subtitle="Scrapers + AI pipelines across Grounded — coming in, sent to users, sent to the RAG model" />

      {/* Overview of every pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
        {(overview?.domains || []).map(d => (
          <div key={d.domain} className="card"
               onClick={() => d.managed && setDomain(d.domain)}
               style={{ padding: 16, cursor: d.managed ? 'pointer' : 'default', borderColor: d.managed && d.domain === domain ? 'var(--accent)' : 'var(--border-color)', borderWidth: d.managed && d.domain === domain ? 2 : 1, borderStyle: 'solid' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              {d.label}{!d.managed && <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 6 }}>(own page)</span>}
            </div>
            <FlowRow label="Sources" value={`${d.sources.active}/${d.sources.total}`} />
            <FlowRow label="Coming in" value={d.comingIn} accent="#D97706" />
            {d.managed && <FlowRow label="In review" value={d.inReview} />}
            <FlowRow label="→ Users" value={d.toUsers} accent="#059669" />
            <FlowRow label="→ RAG model" value={d.toRag} accent="#7C3AED" />
          </div>
        ))}
        {!overview && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      </div>

      {/* Selected pipeline manager */}
      {domain && <DomainManager domain={domain} onChange={loadOverview} />}
    </div>
  );
}

function FlowRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: accent || 'var(--text-primary)' }}>{value ?? 0}</span>
    </div>
  );
}

function DomainManager({ domain, onChange }) {
  const [tab, setTab] = useState('review');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  async function act(label, fn) {
    setBusy(label); setMsg('');
    try { const r = await fn(); setMsg(typeof r === 'string' ? r : JSON.stringify(r)); onChange(); }
    catch (e) { setMsg('Error: ' + e.message); }
    finally { setBusy(''); }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, textTransform: 'capitalize' }}>{domain} pipeline</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={!!busy}
                  onClick={() => act('scrape', () => apiFetch('/content-sources/run-due', { method: 'POST', body: JSON.stringify({ domain }) }).then(r => `Scraped: ${(r.runs || []).length} sources run`))}>
            {busy === 'scrape' ? 'Scraping…' : 'Run scrapers now'}
          </button>
          <button className="btn btn-primary" disabled={!!busy}
                  onClick={() => act('triage', () => apiFetch('/content-sources/triage', { method: 'POST', body: JSON.stringify({ domain }) }).then(r => `AI triage: ${r.promoted ?? 0} compiled, ${r.rejected ?? 0} rejected`))}>
            {busy === 'triage' ? 'Running AI…' : 'Run AI triage'}
          </button>
        </div>
      </div>
      {msg && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-color)', marginBottom: 14 }}>
        {['review', 'incoming', 'sources'].map(t => (
          <button key={t} onClick={() => setTab(t)}
                  style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', textTransform: 'capitalize' }}>
            {t === 'review' ? 'Review & publish' : t}
          </button>
        ))}
      </div>

      {tab === 'review'   && <ReviewTab domain={domain} onChange={onChange} />}
      {tab === 'incoming' && <IncomingTab domain={domain} />}
      {tab === 'sources'  && <SourcesTab domain={domain} onChange={onChange} />}
    </div>
  );
}

function ReviewTab({ domain, onChange }) {
  const [status, setStatus] = useState('review');
  const [items, setItems] = useState([]);
  const load = () => apiFetch(`/content-sources/items?domain=${domain}&status=${status}`).then(r => setItems(r.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, [status, domain]);

  async function item(id, path) { await apiFetch(`/content-sources/items/${domain}/${id}/${path}`, { method: 'POST' }); load(); onChange(); }

  const isTools = domain === 'tools';
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['review', 'published', 'rejected'].map(s => (
          <button key={s} onClick={() => setStatus(s)} style={pill(status === s)}>{s}</button>
        ))}
      </div>
      {items.length === 0 && <Empty>No {status} items. Run the scrapers then AI triage to populate this.</Empty>}
      {items.map(it => {
        const title = it.title || it.name;
        const tags = isTools ? [it.category, it.language, it.license] : [it.topic, it.item_type];
        const body = isTools ? [it.description, it.newsroom_use && `Newsroom use: ${it.newsroom_use}`].filter(Boolean).join(' · ') : it.summary;
        return (
          <div key={it.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              {tags.filter(Boolean).map((t, i) => <span key={i} style={tag(i === 0 ? '#EEF2FF' : '#F3F4F6', i === 0 ? '#4F46E5' : '#374151')}>{t}</span>)}
              {it.rag_synced && <span style={tag('#F5F3FF', '#7C3AED')}>in RAG</span>}
              {it.source_name && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{it.source_name}</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{it.url ? <a href={it.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{title}</a> : title}</div>
            {body && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{body}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {it.status !== 'published' && <button className="btn btn-primary" style={btnSm} onClick={() => item(it.id, 'publish')}>Publish to users</button>}
              {it.status !== 'rejected' && <button className="btn" style={btnSm} onClick={() => item(it.id, 'reject')}>Reject</button>}
              {!it.rag_synced && <button className="btn" style={btnSm} onClick={() => item(it.id, 'rag-sync')}>Sync to RAG</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncomingTab({ domain }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { apiFetch(`/content-sources/raw-items?domain=${domain}`).then(r => setRows(r.items || [])).catch(() => setRows([])); }, [domain]);
  if (!rows.length) return <Empty>Nothing scraped yet. Add sources then “Run scrapers now”.</Empty>;
  return rows.map(r => (
    <div key={r.id} className="card" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || '(untitled)'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.published_at ? new Date(r.published_at).toLocaleDateString() : ''}</div>
      </div>
      <span style={tag('#F3F4F6', '#374151')}>{r.triage_status}</span>
    </div>
  ));
}

function SourcesTab({ domain, onChange }) {
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({ name: '', kind: 'rss', url: '' });
  const load = () => apiFetch(`/content-sources/sources?domain=${domain}`).then(setSources).catch(() => setSources([]));
  useEffect(() => { load(); }, [domain]);

  async function add(e) {
    e.preventDefault();
    if (!form.name || !form.url) return;
    await apiFetch('/content-sources/sources', { method: 'POST', body: JSON.stringify({ ...form, domain }) });
    setForm({ name: '', kind: 'rss', url: '' }); load(); onChange();
  }
  async function run(id) { await apiFetch(`/content-sources/sources/${id}/run`, { method: 'POST' }); load(); onChange(); }
  async function del(id) { await apiFetch(`/content-sources/sources/${id}`, { method: 'DELETE' }); load(); onChange(); }

  return (
    <div>
      <form onSubmit={add} style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} />
        <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} style={{ ...inp, flex: '0 0 110px' }}>
          {['rss', 'html', 'bluesky', 'mastodon', 'puppeteer'].map(k => <option key={k}>{k}</option>)}
        </select>
        <input placeholder="Feed / page URL" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} style={{ ...inp, flex: 2 }} />
        <button className="btn btn-primary" type="submit">Add source</button>
      </form>
      {sources.map(s => (
        <div key={s.id} className="card" style={{ padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name} <span style={tag('#F3F4F6', '#374151')}>{s.kind}</span></div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
            {s.last_error && <div style={{ fontSize: 11, color: '#B91C1C' }}>last error: {s.last_error.slice(0, 80)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.items_new} new</span>
            <button className="btn" style={btnSm} onClick={() => run(s.id)}>Run</button>
            <button className="btn" style={btnSm} onClick={() => del(s.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const Empty = ({ children }) => <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>{children}</div>;
const pill = on => ({ padding: '5px 12px', borderRadius: 999, border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: 12, textTransform: 'capitalize', background: on ? 'var(--accent)' : 'var(--card-bg)', color: on ? '#fff' : 'var(--text-primary)' });
const tag = (bg, c) => ({ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: bg, color: c });
const btnSm = { fontSize: 12, padding: '5px 10px' };
const inp = { flex: 1, padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13, minWidth: 120 };
