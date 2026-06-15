// BairAudit — /bair/:id. One audit: header + readiness score (recompute),
// findings grouped by pillar with a per-finding consent control (the corpus
// lever), and a consultant add-finding form where consent_scope is mandatory.
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const PILLARS = ['visibility', 'governance', 'security', 'productivity', 'capability', 'usage'];
const SEVERITIES = [1, 2, 3, 4, 5];
const CONSENT = ['client_only', 'anonymised_corpus_ok', 'sealed'];
const DATA_CLASSES = ['none', 'client_pii', 'financial', 'ip'];
const CONSENT_STYLE = {
  client_only: { bg: '#f1f0ec', fg: '#6b6359' },
  anonymised_corpus_ok: { bg: '#dcfce7', fg: '#166534' },
  sealed: { bg: '#fee2e2', fg: '#991b1b' },
};

export default function BairAudit() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);
  const [findings, setFindings] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ pillar: 'security', finding_type: '', severity: 3, consent_scope: 'client_only', data_class: '', evidence_note: '' });
  const [busy, setBusy] = useState(false);

  const loadAudit = () => apiFetch('/bair/audits/' + id).then(setAudit).catch((e) => setErr(e.message));
  const loadFindings = () => apiFetch('/bair/findings?audit_id=' + id).then(setFindings).catch((e) => setErr(e.message));
  useEffect(() => { loadAudit(); loadFindings(); }, [id]);

  const recompute = async () => {
    setErr('');
    try { const r = await apiFetch('/bair/score/' + id, { method: 'POST' }); setBreakdown(r); await loadAudit(); }
    catch (e) { setErr(e.message); }
  };

  const setConsent = async (fid, consent_scope) => {
    setErr('');
    try { await apiFetch('/bair/findings/' + fid, { method: 'PUT', body: JSON.stringify({ consent_scope }) }); await loadFindings(); }
    catch (e) { setErr(e.message); }
  };

  const addFinding = async (e) => {
    e.preventDefault();
    if (!form.finding_type.trim()) { setErr('finding_type is required'); return; }
    setBusy(true); setErr('');
    try {
      await apiFetch('/bair/findings', { method: 'POST', body: JSON.stringify({
        audit_id: id, source: 'consultant', ...form,
        data_class: form.data_class || null, evidence_note: form.evidence_note || null,
      }) });
      setForm({ pillar: form.pillar, finding_type: '', severity: 3, consent_scope: 'client_only', data_class: '', evidence_note: '' });
      await loadFindings();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!audit) return <p style={{ color: '#8a8076' }}>{err || 'Loading…'}</p>;

  return (
    <div>
      <Link to="/bair" style={{ fontSize: 13, color: '#1f6f54' }}>← All audits</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', margin: '8px 0 18px' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 2px' }}>{audit.organisation_name || '— unassigned —'}</h1>
          <div style={{ color: '#5b6b63', fontSize: 13.5 }}>
            {audit.sector_name || 'no sector'} · {audit.company_size || 'size unset'} · {audit.region || 'region unset'} · status <strong>{audit.status}</strong>
          </div>
        </div>
        <div style={{ ...card, textAlign: 'center', minWidth: 150 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076' }}>Readiness</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#1f6f54', lineHeight: 1.1 }}>{audit.readiness_score != null ? Number(audit.readiness_score).toFixed(0) : '—'}</div>
          <button onClick={recompute} style={{ ...btn, padding: '5px 12px', fontSize: 12, marginTop: 6 }}>Recompute</button>
        </div>
      </div>
      {err && <div style={banner}>{err}</div>}

      {breakdown && (
        <div style={{ ...card, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1f6f54', marginBottom: 8 }}>Per-pillar (cap {breakdown.cap})</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {breakdown.pillars.map((p) => (
              <div key={p.pillar} style={{ fontSize: 13 }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{p.pillar}</span>: <strong>{p.score}</strong>
                <span style={{ color: '#8a8076' }}> (dmg {p.damage}, {p.finding_count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings grouped by pillar */}
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5b6b63', margin: '4px 0 10px' }}>Findings</div>
      {findings == null ? <p style={{ color: '#8a8076' }}>Loading…</p> : findings.length === 0 ? (
        <p style={{ color: '#8a8076' }}>No findings yet — add one below, or have the client complete the self-serve questionnaire.</p>
      ) : (
        PILLARS.filter((p) => findings.some((f) => f.pillar === p)).map((p) => (
          <div key={p} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', marginBottom: 6 }}>{p}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {findings.filter((f) => f.pillar === p).map((f) => {
                const cs = CONSENT_STYLE[f.consent_scope] || CONSENT_STYLE.client_only;
                return (
                  <div key={f.id} style={{ ...card, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={sevBadge(f.severity)}>S{f.severity}</span>
                      <strong style={{ marginLeft: 8 }}>{f.finding_type}</strong>
                      <span style={{ color: '#8a8076', fontSize: 12, marginLeft: 8 }}>{f.source}</span>
                      {f.evidence_note && <div style={{ fontSize: 12.5, color: '#5b6b63', marginTop: 3 }}>{f.evidence_note}</div>}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ ...pill, background: cs.bg, color: cs.fg }}>consent</span>
                      <select value={f.consent_scope} onChange={(e) => setConsent(f.id, e.target.value)} style={{ ...inp, minWidth: 0, padding: '5px 8px', fontSize: 12.5 }}>
                        {CONSENT.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Add finding (consultant) */}
      <form onSubmit={addFinding} style={{ ...card, marginTop: 18, display: 'grid', gap: 10, maxWidth: 620 }}>
        <div style={{ fontWeight: 700 }}>Add a finding</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value })} style={inp}>
            {PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={form.finding_type} onChange={(e) => setForm({ ...form, finding_type: e.target.value })} placeholder="finding_type (e.g. shadow_tool)" style={{ ...inp, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: Number(e.target.value) })} style={inp}>
            {SEVERITIES.map((s) => <option key={s} value={s}>severity {s}</option>)}
          </select>
          <select value={form.consent_scope} onChange={(e) => setForm({ ...form, consent_scope: e.target.value })} style={inp}>
            {CONSENT.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={form.data_class} onChange={(e) => setForm({ ...form, data_class: e.target.value })} style={inp}>
            <option value="">data class —</option>
            {DATA_CLASSES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <textarea value={form.evidence_note} onChange={(e) => setForm({ ...form, evidence_note: e.target.value })} placeholder="Evidence / note (optional)" style={{ ...inp, minHeight: 48 }} />
        <button type="submit" disabled={busy} style={{ ...btn, justifySelf: 'start' }}>{busy ? 'Adding…' : 'Add finding'}</button>
      </form>
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { padding: '8px 12px', border: '1px solid #d9d2c7', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#1f6f54', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase' };
const sevBadge = (s) => ({ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, color: '#fff', background: s >= 4 ? '#c2410c' : s === 3 ? '#b45309' : '#16a34a' });
