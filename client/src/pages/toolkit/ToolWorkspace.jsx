// Generic operations-tool workspace. Renders ANY tool block's form from its
// input schema, runs it (/api/tool-kit/:slug/run), shows the result, and lists
// saved history. One component serves all four tools.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

export default function ToolWorkspace() {
  const { slug } = useParams();
  const [meta, setMeta] = useState(null);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setMeta(null); setValues({}); setResult(null); setErr(null);
    apiFetch(`/tool-kit/${slug}`).then(setMeta).catch(() => setMeta({ notFound: true }));
    loadHistory();
  }, [slug]);
  const loadHistory = () => apiFetch(`/tool-kit/${slug}/history`).then(setHistory).catch(() => setHistory([]));

  async function run() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await apiFetch(`/tool-kit/${slug}/run`, { method: 'POST', body: JSON.stringify({ input: values }) });
      setResult(res.output); loadHistory();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (meta?.notFound) return <div style={{ padding: 24 }}>Unknown tool. <Link to="/tools-hub">Back to tools</Link></div>;
  if (!meta) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>;
  const fields = Object.entries(meta.inputs || {});

  return (
    <div>
      <div style={{ marginBottom: 8 }}><Link to="/tools-hub" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>← Operations tools</Link></div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px' }}>{meta.icon} {meta.name}</h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 720, margin: '0 0 20px' }}>{meta.description}</p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 20, flex: '1 1 380px', minWidth: 320 }}>
          {fields.map(([name, schema]) => (
            <label key={name} style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                {name}{schema.required ? ' *' : ''}
              </div>
              {schema.description && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{schema.description}</div>}
              {schema.type === 'longtext'
                ? <textarea rows={4} value={values[name] || ''} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))} style={inp} />
                : <input value={values[name] || ''} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))} style={inp} />}
            </label>
          ))}
          {meta.comingSoon
            ? <div style={{ fontSize: 13, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px' }}>This one is <b>coming soon</b> — it needs local AI models that aren’t enabled on this deployment yet.</div>
            : <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run'}</button>}
          {err && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 10 }}>{err}</div>}
        </div>

        <div style={{ flex: '1 1 380px', minWidth: 320 }}>
          {result && (
            <div className="card" style={{ padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>Result</div>
              <Output data={result} />
            </div>
          )}
          {history.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '4px 0 8px' }}>Recent</div>
              {history.map((h) => (
                <button key={h.id} onClick={() => setResult(h.output)} className="card" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 6, cursor: 'pointer', fontSize: 12 }}>
                  {h.title || (h.input && Object.values(h.input)[0]) || '(run)'} · <span style={{ color: 'var(--text-secondary)' }}>{new Date(h.created_at).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Friendly render of the structured tool output; falls back to pretty JSON.
function Output({ data }) {
  if (data == null) return null;
  if (typeof data === 'string') return <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{data}</div>;
  if (data.text && Object.keys(data).length === 1) return <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{data.text}</div>;
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, textTransform: 'capitalize', marginBottom: 4 }}>{k.replace(/_/g, ' ')}</div>
          <Value v={v} />
        </div>
      ))}
    </div>
  );
}
function Value({ v }) {
  if (Array.isArray(v)) return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {v.map((item, i) => <li key={i} style={{ marginBottom: 4 }}>{typeof item === 'object' ? <Output data={item} /> : String(item)}</li>)}
    </ul>
  );
  if (v && typeof v === 'object') return <Output data={v} />;
  return <span style={{ whiteSpace: 'pre-wrap' }}>{String(v)}</span>;
}

const inp = { width: '100%', padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' };
