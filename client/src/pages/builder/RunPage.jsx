// Run — user mode. Pick a saved workflow, fill its inputs, run it, see the result.
// No graph, no blocks — just "what problem do you want solved?".
import { useEffect, useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

export default function RunPage() {
  const [workflows, setWorkflows] = useState([]);
  const [active, setActive] = useState(null);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { apiFetch('/workflows').then(setWorkflows).catch(() => setWorkflows([])); }, []);

  const inputs = active?.definition?.inputs || [];

  async function run() {
    setBusy(true); setResult(null);
    try {
      const res = await apiFetch(`/workflows/${active.id}/run`, { method: 'POST', body: JSON.stringify({ input: values }) });
      setResult(res);
    } catch (e) { setResult({ status: 'failed', error: e.message }); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Run a workflow" subtitle="Pick a workflow and run it — no setup, just answer the prompts." />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 280 }}>
          {workflows.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>No workflows yet. Build one in the Builder.</div>}
          {workflows.map((w) => (
            <button key={w.id} onClick={() => { setActive(w); setValues({}); setResult(null); }}
                    className="card" style={{ display: 'block', width: '100%', textAlign: 'left', padding: 14, marginBottom: 8, cursor: 'pointer', border: active?.id === w.id ? '2px solid var(--accent)' : '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name}</div>
              {(w.problem_statement || w.description) && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>{w.problem_statement || w.description}</div>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          {!active ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 14, paddingTop: 20 }}>Select a workflow on the left.</div>
          ) : (
            <div className="card" style={{ padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>{active.name}</h2>
              {active.user_instructions && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{active.user_instructions}</p>}
              {inputs.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No inputs — just press Run.</p>}
              {inputs.map((inp) => (
                <label key={inp.name} style={{ display: 'block', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{inp.label || inp.name}</div>
                  <textarea rows={inp.type === 'longtext' ? 4 : 1} value={values[inp.name] || ''}
                            onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
                            style={{ width: '100%', padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13 }} />
                </label>
              ))}
              <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run'}</button>

              {result && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6 }}>Result · {result.status}</div>
                  {result.error
                    ? <div style={{ color: '#991B1B', fontSize: 13 }}>{result.error}</div>
                    : <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflow: 'auto', background: '#efe9e1', padding: 12, borderRadius: 6 }}>{JSON.stringify(result.output, null, 2)}</pre>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
