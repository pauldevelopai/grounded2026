// BusinessExtraction — /dashboard/extraction. A client team member's OWN document
// space (Tier 1, private to them): upload a document, get the text + an AI summary +
// structured data back. It does NOT flow into the company knowledge the AI reasons
// over — only your Be AI Ready consultant can lift something to the company tier.
// Server-scoped to the member's own uploads within their tenant.
import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const STATUS_LABEL = { pending: 'queued', extracting: 'reading…', extracted: 'read', failed: 'failed' };

export default function BusinessExtraction() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const fileKey = useRef(0);
  const poll = useRef();

  const load = () => apiFetch('/beaiready/extraction').then((r) => {
    setList(r);
    // Keep polling while anything is still processing.
    if (r.some((d) => d.ai_analysis_status !== 'complete' && d.extraction_status !== 'failed')) {
      clearTimeout(poll.current); poll.current = setTimeout(load, 2500);
    }
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); return () => clearTimeout(poll.current); }, []); // eslint-disable-line

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/beaiready/extraction', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
      fileKey.current += 1; load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const view = async (id) => { setErr(''); try { setOpen(await apiFetch(`/beaiready/extraction/${id}`)); } catch (e) { setErr(e.message); } };
  const del = async (id) => { setErr(''); try { await apiFetch(`/beaiready/extraction/${id}`, { method: 'DELETE' }); if (open?.id === id) setOpen(null); load(); } catch (e) { setErr(e.message); } };

  const done = (d) => d.ai_analysis_status === 'complete';

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · Knowledge</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Your documents</h1>
      <p style={{ color: '#6b6359', maxWidth: '64ch', marginBottom: 14 }}>
        Drop in a document — a contract, a report, a spreadsheet — and get the text plus a plain‑language summary
        and the key facts pulled out. This space is <b>private to you</b>; nothing here feeds the company's AI
        unless your Be AI Ready consultant chooses to add it.
      </p>
      <p style={{ marginBottom: 16 }}><Link to="/dashboard">← Back to dashboard</Link></p>

      {err && <div style={banner}>{err}</div>}

      <label style={{ ...btn, display: 'inline-block', cursor: 'pointer', marginBottom: 18 }}>
        {busy ? 'Uploading…' : '＋ Upload a document'}
        <input key={fileKey.current} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" style={{ display: 'none' }}
          onChange={(e) => upload(e.target.files?.[0])} />
      </label>

      {list == null ? <p style={muted}>Loading…</p> : list.length === 0 ? (
        <p style={muted}>No documents yet — upload one to get started.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {list.map((d) => (
            <div key={d.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: 14 }}>📄 {d.original_name}</strong>
                  <span style={{ ...pill, marginLeft: 8, ...(done(d) ? okPill : d.extraction_status === 'failed' ? failPill : workPill) }}>
                    {done(d) ? 'ready' : d.extraction_status === 'failed' ? 'failed' : (STATUS_LABEL[d.extraction_status] || 'processing…')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {done(d) && <button onClick={() => view(d.id)} style={tag}>View</button>}
                  <button onClick={() => del(d.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
                </div>
              </div>
              {done(d) && d.ai_summary && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{d.ai_summary.slice(0, 200)}{d.ai_summary.length > 200 ? '…' : ''}</p>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{ ...card, marginTop: 16, borderColor: '#eaddd3', background: '#fbf7f4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <strong style={{ fontSize: 15 }}>{open.original_name}</strong>
            <button onClick={() => setOpen(null)} style={tag}>Close</button>
          </div>
          {open.ai_summary && <><div style={kicker}>Summary</div><p style={{ fontSize: 14, lineHeight: 1.55, color: '#2a2520', margin: '0 0 12px' }}>{open.ai_summary}</p></>}
          {open.ai_extracted_data && (() => { let d; try { d = typeof open.ai_extracted_data === 'string' ? JSON.parse(open.ai_extracted_data) : open.ai_extracted_data; } catch { d = null; } return d ? (
            <><div style={kicker}>Key facts</div>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}><tbody>
                {Object.entries(d).filter(([k]) => k !== 'summary').map(([k, v]) => (
                  <tr key={k} style={{ borderTop: '1px solid #eee5da' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#5b6b63', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                    <td style={{ padding: '6px 10px', color: '#3a342e' }}>{typeof v === 'string' ? v : JSON.stringify(v)}</td>
                  </tr>
                ))}
              </tbody></table></>
          ) : null; })()}
          {open.extracted_text && <><div style={{ ...kicker, marginTop: 12 }}>Extracted text</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: '#5b5249', maxHeight: 280, overflow: 'auto', background: '#fff', border: '1px solid #eee5da', borderRadius: 8, padding: 10, margin: 0 }}>{open.extracted_text.slice(0, 6000)}</pre></>}
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 };
const btn = { padding: '10px 18px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600 };
const tag = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999 };
const okPill = { background: '#dcfce7', color: '#166534' };
const workPill = { background: '#fef3c7', color: '#92400e' };
const failPill = { background: '#fee2e2', color: '#991b1b' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', margin: '0 0 6px' };
const muted = { color: '#8a8076', fontSize: 13.5 };
