// BeAIReadyAdminGovernance — load and manage the GLOBAL AI-governance knowledge
// corpus (regulations, frameworks, guidance, reports). Documents ingested here are
// chunked + embedded and become the grounding every tenant's governance AI cites —
// risk classification, controls, policy. Shared across all clients (visibility:global).
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

const FRAMEWORKS = [
  { v: '', label: 'Framework…' },
  { v: 'eu_ai_act', label: 'EU AI Act' },
  { v: 'nist_ai_rmf', label: 'NIST AI RMF' },
  { v: 'iso_42001', label: 'ISO/IEC 42001' },
  { v: 'popia', label: 'POPIA' },
  { v: 'oecd', label: 'OECD' },
  { v: 'other', label: 'Other / general' },
];
const FRAMEWORK_LABEL = Object.fromEntries(FRAMEWORKS.map((f) => [f.v, f.label]));
const blank = { title: '', framework: '', jurisdiction: '', sourceUrl: '', text: '' };

export default function BeAIReadyAdminGovernance() {
  const [docs, setDocs] = useState(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(() => {
    apiFetch('/beaiready/admin/governance/corpus').then(setDocs).catch((e) => { setErr(e.message); setDocs([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const ingest = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.text.trim()) { setErr('A title and the document text are both required.'); return; }
    setBusy(true); setErr(''); setOk('');
    try {
      const r = await apiFetch('/beaiready/admin/governance/ingest', { method: 'POST', body: JSON.stringify(form), timeout: 60000 });
      setOk(`Ingested “${form.title.trim()}” — ${r.chunks} chunk${r.chunks === 1 ? '' : 's'} embedded into the corpus.`);
      setForm(blank);
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const wordCount = form.text.trim() ? form.text.trim().split(/\s+/).length : 0;

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Governance corpus</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '74ch' }}>
        The shared AI-governance knowledge base. Paste the real text of a regulation, framework, guidance
        note or report — it's chunked, embedded, and becomes the grounding every client's governance AI
        <strong> cites</strong>: risk classification, controls and policy. One corpus, shared across all
        clients. Paste authentic source text only — never summaries you wouldn't stand behind.
      </p>
      {err && <div style={banner}>{err}</div>}
      {ok && <div style={{ ...banner, background: '#ecfdf5', color: '#065f46' }}>{ok}</div>}

      {/* Ingest form */}
      <form onSubmit={ingest} style={{ ...card, marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', marginBottom: 10 }}>Add a document</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          <input style={inp} placeholder="Title (e.g. EU AI Act — Article 6 & Annex III)" value={form.title} onChange={(e) => set('title', e.target.value)} />
          <input style={inp} placeholder="Source URL (where it's from)" value={form.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} />
          <select style={inp} value={form.framework} onChange={(e) => set('framework', e.target.value)}>
            {FRAMEWORKS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
          </select>
          <input style={inp} placeholder="Jurisdiction (e.g. EU, International, South Africa)" value={form.jurisdiction} onChange={(e) => set('jurisdiction', e.target.value)} />
        </div>
        <textarea style={{ ...inp, minHeight: 160, marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
          placeholder="Paste the document text here…" value={form.text} onChange={(e) => set('text', e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <button type="submit" disabled={busy} style={btn}>{busy ? 'Ingesting…' : 'Ingest into corpus'}</button>
          <span style={{ fontSize: 12, color: '#8a8076' }}>{wordCount > 0 ? `${wordCount} words · ~${Math.max(1, Math.ceil(wordCount / 170))} chunk(s)` : 'Chunked to ~170 words each for embedding'}</span>
        </div>
      </form>

      {/* Corpus list */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>In the corpus</h2>
        {docs && <span style={{ fontSize: 12, color: '#8a8076' }}>{docs.length} document{docs.length === 1 ? '' : 's'}</span>}
      </div>
      {docs == null ? <p style={muted}>Loading…</p> : docs.length === 0 ? (
        <p style={muted}>Nothing ingested yet — add the EU AI Act, NIST AI RMF, ISO 42001 and the guidance your clients need grounded.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {docs.map((d) => (
            <div key={d.document_id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <strong>{d.title}</strong>
                  {d.framework && <span style={{ ...pill, background: '#eef2ff', color: '#3730a3', marginLeft: 6 }}>{FRAMEWORK_LABEL[d.framework] || d.framework}</span>}
                  {d.jurisdiction && <span style={{ ...pill, background: '#f1f5f9', color: '#475569', marginLeft: 6 }}>{d.jurisdiction}</span>}
                  <div style={muted}>
                    {d.chunks} chunk{d.chunks === 1 ? '' : 's'} · {d.embedded ? 'embedded ✓' : 'embedding…'} · added {fmtDate(d.created_at)}
                  </div>
                </div>
                {d.source && /^https?:\/\//.test(d.source) && (
                  <a href={d.source} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#c75b39' }}>Source ↗</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' };
const muted = { color: '#8a8076', fontSize: 13, margin: '2px 0 0' };
