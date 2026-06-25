// BeAIReadyAdminInsights — the admin's cross-business insight engine. Aggregates,
// across consenting businesses only (and only where >=2 contribute), de-identified
// patterns: what works, what gets adopted, common pitfalls. Review them, then publish
// the good ones — publishing feeds an anonymised 'pattern' into every client's AI.
// Nothing here is traceable to an individual business.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const TYPE_STYLE = {
  automation: ['#eef2ff', '#3730a3'], goal: ['#ecfeff', '#155e75'], pitfall: ['#fef2f2', '#991b1b'],
  adoption: ['#f0fdf4', '#166534'], measurement: ['#fef3c7', '#92400e'],
};

export default function BeAIReadyAdminInsights() {
  const [consent, setConsent] = useState(null);
  const [insights, setInsights] = useState(null);
  const [sector, setSector] = useState('');       // '' = all sectors
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    apiFetch('/beaiready/insights/consent').then(setConsent).catch((e) => setErr(e.message));
    apiFetch('/beaiready/insights').then(setInsights).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);

  const derive = async () => {
    setBusy(true); setErr(''); setNote(null);
    try {
      const r = await apiFetch('/beaiready/insights/derive', { method: 'POST', body: JSON.stringify({ sector_id: sector || null }) });
      setNote({ ok: true, text: `Derived ${r.count} pattern${r.count === 1 ? '' : 's'} from ${r.supporting_orgs} businesses. Review and publish below.` });
      load();
    } catch (e) {
      // 422 from the service carries an honest reason (e.g. k-anonymity not met).
      setNote({ ok: false, text: e.message });
    }
    setBusy(false);
  };

  const togglePublish = async (it) => {
    setErr('');
    try { await apiFetch(`/beaiready/insights/${it.id}/publish`, { method: 'POST', body: JSON.stringify({ published: !it.is_published }) }); load(); }
    catch (e) { setErr(e.message); }
  };

  const totalConsenting = (consent || []).reduce((s, c) => s + c.consenting, 0);

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Cross-business insight</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '70ch' }}>
        Anonymised patterns learned across <b>consenting</b> businesses — what works, what gets adopted, where the
        common pitfalls are. Built only where at least two businesses contribute (so nothing is traceable), and
        published patterns feed every client's AI as “what works for businesses like yours”. Turn a business's
        consent on under <b>Users</b>.
      </p>
      {err && <div style={banner}>{err}</div>}

      {/* Consent picture + derive control */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={kicker}>Consenting businesses</div>
        {consent == null ? <p style={muted}>Loading…</p> : consent.length === 0 ? (
          <p style={muted}>No business has opted in yet. Turn on “contribute anonymised insights” for a client under Users.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 12px', display: 'grid', gap: 4 }}>
            {consent.map((c) => (
              <li key={c.sector_id || 'none'} style={{ fontSize: 13.5 }}>
                <strong>{c.sector_name || 'No sector'}</strong> — {c.consenting} business{c.consenting === 1 ? '' : 'es'}
                {c.consenting < 2 && <span style={{ color: '#b45309' }}> · need ≥2 to derive</span>}
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={sector} onChange={(e) => setSector(e.target.value)} style={inp}>
            <option value="">All sectors</option>
            {(consent || []).filter((c) => c.sector_id).map((c) => <option key={c.sector_id} value={c.sector_id}>{c.sector_name}</option>)}
          </select>
          <button onClick={derive} disabled={busy || totalConsenting < 2} style={btn}>{busy ? 'Deriving…' : 'Derive patterns'}</button>
          <span style={muted}>Uses one model call; replaces this sector's prior set.</span>
        </div>
        {note && <p style={{ fontSize: 13, margin: '10px 0 0', color: note.ok ? '#166534' : '#b45309' }}>{note.text}</p>}
      </div>

      {/* The derived patterns */}
      <div style={kicker}>Patterns</div>
      {insights == null ? <p style={muted}>Loading…</p> : insights.length === 0 ? (
        <p style={muted}>No patterns derived yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          {insights.map((it) => {
            const [bg, fg] = TYPE_STYLE[it.pattern_type] || ['#f1f0ec', '#6b6359'];
            return (
              <div key={it.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: bg, color: fg }}>{it.pattern_type}</span>
                    <strong style={{ marginLeft: 8 }}>{it.title}</strong>
                    <div style={{ fontSize: 11.5, color: '#a89e92', marginTop: 2 }}>
                      {it.sector_name || 'All sectors'} · from {it.supporting_orgs} businesses
                    </div>
                  </div>
                  <button onClick={() => togglePublish(it)} style={{ ...btn, background: it.is_published ? '#1c1b1a' : '#c75b39', flexShrink: 0 }}>
                    {it.is_published ? 'Published ✓ (unpublish)' : 'Publish to clients'}
                  </button>
                </div>
                <p style={{ fontSize: 13.5, color: '#5b5249', margin: '8px 0 0', lineHeight: 1.5 }}>{it.insight}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const kicker = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', marginBottom: 8 };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '8px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const muted = { color: '#8a8076', fontSize: 13 };
