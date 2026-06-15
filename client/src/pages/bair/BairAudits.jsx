// BairAudits — /bair. The audits list + a "new audit" form. Real data only:
// reads GET /api/bair/audits (admin); creates via POST. Sector drives the
// scoring overrides + the self-serve questionnaire, so it's the key field.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const SIZES = ['micro', 'small', 'medium', 'large'];
const STATUS_STYLE = {
  intake: { bg: '#e0e7ff', fg: '#3730a3' }, in_review: { bg: '#fef3c7', fg: '#92400e' },
  delivered: { bg: '#dcfce7', fg: '#166534' }, rechecked: { bg: '#cffafe', fg: '#155e75' },
};

export default function BairAudits() {
  const [audits, setAudits] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [form, setForm] = useState({ sector_id: '', company_size: '', region: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => apiFetch('/bair/audits').then(setAudits).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    apiFetch('/sectors').then((s) => setSectors(Array.isArray(s) ? s : [])).catch(() => setSectors([]));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await apiFetch('/bair/audits', { method: 'POST', body: JSON.stringify({
        sector_id: form.sector_id || null, company_size: form.company_size || null, region: form.region || null,
      }) });
      setForm({ sector_id: '', company_size: '', region: '' });
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Audits</h1>
      <p style={{ color: '#5b6b63', marginBottom: 20, maxWidth: '64ch' }}>
        Each audit captures one company's AI readiness across six pillars, scores it, and (with consent) feeds the cross-sector corpus.
      </p>
      {err && <div style={banner}>{err}</div>}

      {/* New audit */}
      <form onSubmit={create} style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 22 }}>
        <Field label="Sector">
          <select value={form.sector_id} onChange={(e) => setForm({ ...form, sector_id: e.target.value })} style={inp}>
            <option value="">— none —</option>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Company size">
          <select value={form.company_size} onChange={(e) => setForm({ ...form, company_size: e.target.value })} style={inp}>
            <option value="">— unset —</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Region">
          <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. ZA" style={inp} />
        </Field>
        <button type="submit" disabled={busy} style={btn}>{busy ? 'Creating…' : 'New audit'}</button>
      </form>

      {/* List */}
      {audits == null ? (
        <p style={{ color: '#8a8076' }}>Loading…</p>
      ) : audits.length === 0 ? (
        <p style={{ color: '#8a8076' }}>No audits yet — create the first one above.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#8a8076', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <th style={th}>Company</th><th style={th}>Sector</th><th style={th}>Size</th>
              <th style={th}>Status</th><th style={th}>Findings</th><th style={th}>Readiness</th><th style={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => {
              const s = STATUS_STYLE[a.status] || { bg: '#f1f0ec', fg: '#6b6359' };
              return (
                <tr key={a.id} style={{ borderTop: '1px solid #eee5da' }}>
                  <td style={td}><Link to={`/bair/${a.id}`} style={{ color: '#0f2e24', fontWeight: 600 }}>{a.organisation_name || '— unassigned —'}</Link></td>
                  <td style={td}>{a.sector_name || '—'}</td>
                  <td style={td}>{a.company_size || '—'}</td>
                  <td style={td}><span style={{ ...pill, background: s.bg, color: s.fg }}>{a.status}</span></td>
                  <td style={td}>{a.finding_count}</td>
                  <td style={td}>{a.readiness_score != null ? <strong>{Number(a.readiness_score).toFixed(0)}</strong> : '—'}</td>
                  <td style={{ ...td, color: '#8a8076' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: '#5b6b63' }}>
      {label}{children}
    </label>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { padding: '8px 12px', border: '1px solid #d9d2c7', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', minWidth: 150 };
const btn = { padding: '9px 16px', background: '#1f6f54', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const th = { padding: '6px 10px' };
const td = { padding: '10px' };
const pill = { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, textTransform: 'capitalize' };
