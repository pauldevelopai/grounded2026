// Ethics Policy Builder — a public page under the AI Policies menu. Two modes:
//   • Create  — generate a newsroom AI-ethics policy from a short brief.
//   • Review  — paste or upload an existing policy and get gap analysis +
//               concrete suggestions + an improved draft.
// Calls POST /public/ethics-policy (rate-limited, runs Claude server-side).
import { useRef, useState } from 'react';
import { publicFetch } from '../../hooks/usePublicApi.js';

const inp = { width: '100%', padding: '9px 11px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const label = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 };

export default function EthicsPolicyBuilder() {
  const [mode, setMode] = useState('create'); // 'create' | 'review'
  const [form, setForm] = useState({ newsroomName: '', jurisdiction: '', aiUses: '', existingPolicy: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Read plain-text formats client-side into the textarea. (PDF/Word: ask
    // the user to paste — we don't parse binary formats here.)
    if (/\.(txt|md|markdown|text)$/i.test(file.name) || file.type.startsWith('text/')) {
      const text = await file.text();
      set('existingPolicy', text.slice(0, 20000));
      setErr(null);
    } else {
      setErr('That file type can’t be read here — please open it and paste the text below.');
    }
  }

  async function run() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await publicFetch('/public/ethics-policy', {
        method: 'POST',
        body: JSON.stringify({ mode, ...form }),
      });
      setResult(res.output);
    } catch (e) {
      setErr(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const canRun = mode === 'create'
    ? true
    : (form.existingPolicy.trim().length >= 40);

  return (
    <div>
      <section style={{ marginBottom: 24, maxWidth: 760 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
          AI Policies &middot; Policy Builder
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: '0 0 12px 0', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Build or review your AI ethics policy
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Draft a newsroom AI-ethics policy from scratch, or paste/upload your existing one to get a gap
          analysis and concrete suggestions — grounded in the six principles on the Ethics page.
        </p>
      </section>

      {/* Mode toggle */}
      <div style={{ display: 'inline-flex', gap: 4, border: '1px solid var(--border-color)', borderRadius: 999, padding: 4, marginBottom: 20 }}>
        {[['create', 'Create new'], ['review', 'Review existing']].map(([k, lbl]) => (
          <button key={k} onClick={() => { setMode(k); setResult(null); setErr(null); }}
            style={{ padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                     background: mode === k ? 'var(--accent)' : 'transparent', color: mode === k ? '#fff' : 'var(--text-primary)', fontFamily: 'inherit' }}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Input */}
        <div className="card" style={{ padding: 20, flex: '1 1 380px', minWidth: 320 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Newsroom name</label>
              <input style={inp} value={form.newsroomName} onChange={e => set('newsroomName', e.target.value)} placeholder="e.g. The Continent" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Country / jurisdiction</label>
              <input style={inp} value={form.jurisdiction} onChange={e => set('jurisdiction', e.target.value)} placeholder="e.g. South Africa" />
            </div>
          </div>

          {mode === 'create' ? (
            <div style={{ marginBottom: 12 }}>
              <label style={label}>How do you use (or plan to use) AI?</label>
              <textarea style={{ ...inp, minHeight: 120, resize: 'vertical' }} value={form.aiUses}
                        onChange={e => set('aiUses', e.target.value)}
                        placeholder="e.g. transcription, translation, summarising documents, drafting headlines, research…" />
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Your existing policy</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => fileRef.current?.click()}>Upload .txt / .md</button>
                <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/*" onChange={onFile} style={{ display: 'none' }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>or paste below</span>
              </div>
              <textarea style={{ ...inp, minHeight: 200, resize: 'vertical', fontFamily: 'inherit' }} value={form.existingPolicy}
                        onChange={e => set('existingPolicy', e.target.value)}
                        placeholder="Paste your current AI / editorial-AI policy here…" />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{form.existingPolicy.length.toLocaleString()} characters</div>
            </div>
          )}

          <button className="btn btn-primary" disabled={busy || !canRun} onClick={run} style={{ opacity: busy || !canRun ? 0.6 : 1 }}>
            {busy ? 'Working…' : (mode === 'create' ? 'Generate policy' : 'Review & suggest')}
          </button>
          {err && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 10 }}>{err}</div>}
          {busy && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>This takes ~10–20 seconds.</div>}
        </div>

        {/* Output */}
        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
          {!result && !busy && (
            <div className="card" style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 14 }}>
              Your {mode === 'create' ? 'draft policy' : 'review'} will appear here.
            </div>
          )}
          {result && <Result result={result} />}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Result({ result }) {
  const copy = () => { try { navigator.clipboard?.writeText(result.policy_markdown || ''); } catch { /* ignore */ } };
  return (
    <div className="card" style={{ padding: 22 }}>
      {result.title && <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>{result.title}</h2>}
      {result.summary && <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.55 }}>{result.summary}</p>}

      {Array.isArray(result.gaps) && result.gaps.length > 0 && (
        <Section title="Gaps in your current policy">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </Section>
      )}

      {Array.isArray(result.suggestions) && result.suggestions.length > 0 && (
        <Section title="Suggestions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.suggestions.map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {s.area && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: '#efe9e1', color: '#4F46E5', textTransform: 'capitalize', marginRight: 6 }}>{s.area}</span>}
                  {s.point}
                </div>
                {s.why && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.why}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {result.policy_markdown && (
        <Section title={result.gaps ? 'Improved draft' : 'Policy draft'}>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, margin: 0, color: 'var(--text-primary)' }}>{result.policy_markdown}</pre>
          <button className="btn btn-secondary" style={{ fontSize: 13, marginTop: 10 }} onClick={copy}>Copy policy</button>
        </Section>
      )}

      {Array.isArray(result.checklist) && result.checklist.length > 0 && (
        <Section title="Adoption checklist">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {result.checklist.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Section>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 0 }}>
        AI-generated starting point — review with your editors and legal counsel before adopting.
      </p>
    </div>
  );
}
