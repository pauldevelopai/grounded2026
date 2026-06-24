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
        The client's AI strategy — their goals and automation roadmap — plus the strategy recommendations
        shown in their dashboard. Training (intake, agenda, materials) is on its own page.
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
          <RecommendationsSection clientId={clientId} setErr={setErr} pillars={['strategy']} />
        </div>
      )}
    </div>
  );
}
