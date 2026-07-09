// BeAIReadyAdminTracker — review the lawsuits & regulations added automatically by
// our sources (the daily governance briefing, the TechieRay harvest). They're live
// on the public tracker the moment they're added (post-moderation); here an admin
// sees WHERE each came from and confirms ("Keep") or removes it. Pending first.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
// Where an auto-added entry came from (source_origin → friendly label).
const SOURCE_LABEL = {
  governance_today: 'Daily briefing',
  techieray: 'TechieRay tracker',
  lawsuit_tracker: 'AI-litigation news scan',
  courtlistener: 'CourtListener',
};

export default function BeAIReadyAdminTracker() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    apiFetch('/tracker-review').then(setData).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const keep = async (kind, id) => { setBusy(id); setErr(''); try { await apiFetch(`/tracker-review/${kind}/${id}/keep`, { method: 'PUT' }); load(); } catch (e) { setErr(e.message); } setBusy(''); };
  const remove = async (kind, id) => { setBusy(id); setErr(''); try { await apiFetch(`/tracker-review/${kind}/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } setBusy(''); };

  const lawsuits = data?.lawsuit || [];
  const regulations = data?.regulation || [];
  const pending = [...lawsuits, ...regulations].filter((r) => r.review_status === 'pending').length;

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Tracker review</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '70ch' }}>
        Every lawsuit and regulation added automatically by our sources — the daily AI-litigation news scan,
        the daily briefing, the CourtListener sync and the TechieRay harvest. Each row shows <strong>where it
        came from</strong> (“via …”) and links to its source. They go live on the public tracker the moment
        they’re found — review them here: confirm the ones that are right, and remove anything inaccurate or
        duplicated. {pending > 0 && <strong>{pending} pending review.</strong>}
      </p>
      {err && <div style={banner}>{err}</div>}

      {data == null ? <p style={muted}>Loading…</p> : (
        <div style={{ display: 'grid', gap: 22 }}>
          <Group title="Regulations" kind="regulation" rows={regulations} busy={busy} keep={keep} remove={remove} />
          <Group title="Lawsuits" kind="lawsuit" rows={lawsuits} busy={busy} keep={keep} remove={remove} />
        </div>
      )}
    </div>
  );
}

function Group({ title, kind, rows, busy, keep, remove }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, color: '#8a8076' }}>{rows.length} auto-added</span>
      </div>
      {rows.length === 0 ? <p style={muted}>None added yet.</p> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((r) => (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <strong>{r.name}</strong>
                  <span style={{ ...pill, ...(r.review_status === 'pending' ? pendOn : pubOn), marginLeft: 6 }}>{r.review_status}</span>
                  <span style={{ ...pill, background: '#eef2ff', color: '#3730a3', marginLeft: 6 }}>via {SOURCE_LABEL[r.source_origin] || r.source_origin || 'manual'}</span>
                  <div style={muted}>
                    {[r.jurisdiction, r.status && String(r.status).replace(/_/g, ' '), fmtDate(r.dated)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {r.review_status === 'pending' && (
                    <button onClick={() => keep(kind, r.id)} disabled={busy === r.id} style={tag}>Keep</button>
                  )}
                  <button onClick={() => remove(kind, r.id)} disabled={busy === r.id} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
                </div>
              </div>
              {r.summary && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>{r.summary}</p>}
              {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#c75b39' }}>Source ↗</a>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const tag = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' };
const pendOn = { background: '#fef3c7', color: '#92400e' };
const pubOn = { background: '#dcfce7', color: '#166534' };
const muted = { color: '#8a8076', fontSize: 13, margin: '2px 0 0' };
