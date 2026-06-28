// BeAIReadyAdminStrategy — the BE AI READY admin's Strategy workspace, split out
// from Training (Paul, 2026-06-24). Pick a client, then set their AI strategy as
// Goals + an Automation roadmap, and record the Strategy recommendations shown in
// their dashboard. Reuses the Strategy + Recommendations sections from the Training
// page (single source of truth); everything writes to the selected client's tenant.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';
import { StrategySection, RecommendationsSection } from './BeAIReadyAdminTraining.jsx';

export default function BeAIReadyAdminStrategy() {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/beaiready/admin/clients').then((c) => { setClients(c); if (c.length) setClientId(c[0].id); }).catch((e) => setErr(e.message));
  }, []);

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Strategy</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '66ch' }}>
        The client's AI strategy — their goals and automation roadmap — the measurable goals you agree at the
        start (the Measurement pillar), plus the strategy recommendations shown in their dashboard. Training
        (intake, agenda, materials) is on its own page.
      </p>
      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div style={{ marginBottom: 22 }}>
        <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' }}>Client</label>{' '}
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', minWidth: 240 }}>
          {clients === null && <option>Loading…</option>}
          {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {clientId && (
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <StrategySection clientId={clientId} setErr={setErr} />
          <GoalsSection clientId={clientId} setErr={setErr} />
          <RecommendationsSection clientId={clientId} setErr={setErr} pillars={['strategy']} />
        </div>
      )}
    </div>
  );
}

// Measurement: the measurable goals the consultant agrees with the client at the start
// (baseline → target, optionally tied to one of the five tracked metrics so progress
// reads off the client's latest reading). Consultant-authored; the client sees them +
// progress on their Productivity page.
const MEASURE_KEYS = [
  ['', '— no metric (manual) —'],
  ['time_spent', 'Time spent (hours)'],
  ['ai_hours_saved', 'AI hours saved'],
  ['revenue', 'Revenue generated'],
  ['deliverables', 'Deliverables completed'],
  ['client_outcomes', 'Client & customer outcomes'],
];
const emptyGoal = { title: '', detail: '', metric: '', unit: '', baseline: '', target: '', target_date: '' };

function GoalsSection({ clientId, setErr }) {
  const api = (path, opts = {}) => apiFetch(path, { ...opts, headers: { 'X-Newsroom-Id': clientId, ...(opts.headers || {}) } });
  const [goals, setGoals] = useState(null);
  const [draft, setDraft] = useState(emptyGoal);
  const [busy, setBusy] = useState(false);
  const load = () => api('/beaiready/goals').then(setGoals).catch((e) => setErr(e.message));
  useEffect(() => { setGoals(null); load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setBusy(true); setErr('');
    try { await api('/beaiready/goals', { method: 'POST', body: JSON.stringify({ newsroom_id: clientId, ...draft, metric: draft.metric || null }) }); setDraft(emptyGoal); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const update = async (id, patch) => { setErr(''); try { await api(`/beaiready/goals/${id}`, { method: 'PUT', body: JSON.stringify(patch) }); load(); } catch (e) { setErr(e.message); } };
  const del = async (id) => { setErr(''); try { await api(`/beaiready/goals/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };

  return (
    <section>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Goals &amp; results <span style={{ fontSize: 12, fontWeight: 400, color: '#8a8076' }}>· Measurement</span></h2>
      <p style={{ fontSize: 12.5, color: '#8a8076', margin: '0 0 10px' }}>Agree measurable targets at the start; the client sees them + progress, measured off their tracked metrics.</p>
      <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        {goals == null ? <p style={mut}>Loading…</p> : goals.length === 0 ? <p style={mut}>No goals yet.</p> :
          goals.map((g) => (
            <div key={g.id} style={gcard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{g.title}</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => update(g.id, { status: g.status === 'achieved' ? 'active' : 'achieved' })} style={tagb}>{g.status === 'achieved' ? '✓ achieved' : 'Mark achieved'}</button>
                  <button onClick={() => del(g.id)} style={{ ...tagb, color: '#b91c1c' }}>Delete</button>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: '#6b6359', marginTop: 2 }}>
                {g.baseline != null && g.target != null ? `${g.baseline} → ${g.target}${g.unit ? ' ' + g.unit : ''}` : 'no target set'}
                {g.metric ? ` · via ${g.metric}` : ''}{g.current != null ? ` · now ${g.current}${g.progress != null ? ` (${Math.round(g.progress * 100)}%)` : ''}` : ''}
                {g.target_date ? ` · by ${g.target_date}` : ''}
              </div>
            </div>
          ))}
      </div>
      <form onSubmit={add} style={{ ...gcard, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>New goal</div>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Goal (e.g. Cut monthly report time in half)" style={ginp} />
        <input value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="Detail (optional)" style={ginp} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} style={ginp}>
            {MEASURE_KEYS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="unit (e.g. hours/month)" style={{ ...ginp, width: 150 }} />
          <input type="number" value={draft.baseline} onChange={(e) => setDraft({ ...draft, baseline: e.target.value })} placeholder="baseline" style={{ ...ginp, width: 100 }} />
          <input type="number" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="target" style={{ ...ginp, width: 100 }} />
          <input type="date" value={draft.target_date} onChange={(e) => setDraft({ ...draft, target_date: e.target.value })} style={ginp} />
        </div>
        <button type="submit" disabled={busy} style={{ ...gbtn, justifySelf: 'start' }}>{busy ? 'Adding…' : 'Add goal'}</button>
      </form>
    </section>
  );
}

const gcard = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14 };
const ginp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const gbtn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tagb = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const mut = { color: '#8a8076', fontSize: 13, margin: 0 };
