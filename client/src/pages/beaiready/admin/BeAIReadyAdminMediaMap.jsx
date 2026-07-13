// BeAIReadyAdminMediaMap — the operator's portfolio view: every newsroom / business
// Develop AI has worked with, one card each, and where they stand on their AI journey.
// Every figure is pulled LIVE from that client's real data (GET /beaiready/admin/mediamap)
// — real counts/values or an honest empty state ("Not assessed", "No training yet"),
// never an invented number. Each card opens that client's cockpit (/admin/client?c=…).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../../hooks/useApi.js';

const TERRACOTTA = '#c75b39';
const card = { background: '#fff', border: '1px solid #e7ddd1', borderRadius: 12, padding: '16px 18px', textDecoration: 'none', color: 'inherit', display: 'block' };
const muted = { color: '#8a8076' };
const sigLabel = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8076', marginBottom: 2 };
const emptyVal = { color: '#b0a99f', fontStyle: 'italic', fontWeight: 400, fontSize: 13 };

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null);

// One labelled signal. `value` renders bold; when it's null/empty we show `empty`
// in a quiet italic so a missing measurement never reads as a real zero.
function Signal({ label, value, empty }) {
  const has = value !== null && value !== undefined && value !== '';
  return (
    <div>
      <div style={sigLabel}>{label}</div>
      {has
        ? <div style={{ fontSize: 13.5, color: '#2a2724', fontWeight: 600 }}>{value}</div>
        : <div style={emptyVal}>{empty}</div>}
    </div>
  );
}

function ClientCard({ c }) {
  const trainings = c.trainings_live > 0
    ? `${c.trainings_live} run${c.outcomes_final ? ` · ${c.outcomes_final} report${c.outcomes_final === 1 ? '' : 's'}` : ''}`
    : c.trainings > 0 ? `${c.trainings} planned` : null;
  const tools = (c.tools_assigned || c.nodes_entitled)
    ? `${c.tools_assigned || 0} tool${c.tools_assigned === 1 ? '' : 's'} · ${c.nodes_entitled || 0} node${c.nodes_entitled === 1 ? '' : 's'}`
    : null;
  const governance = c.has_policy
    ? `Policy in place${c.recommendations ? ` · ${c.recommendations} rec${c.recommendations === 1 ? '' : 's'}` : ''}`
    : (c.recommendations ? `${c.recommendations} recommendation${c.recommendations === 1 ? '' : 's'}` : null);
  const readiness = c.readiness_score != null
    ? `${c.readiness_score}`
    : (c.audit_status ? `Audit: ${c.audit_status}` : null);
  const team = c.user_count > 0
    ? `${c.user_count} login${c.user_count === 1 ? '' : 's'}${c.survey_responses ? ` · ${c.survey_responses} surveyed` : ''}`
    : (c.survey_responses ? `${c.survey_responses} surveyed` : null);

  return (
    <Link to={`/admin/client?c=${c.id}`} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15.5, color: '#1c1b1a' }}>{c.name}</div>
        {!c.is_active && <span style={{ fontSize: 10, fontWeight: 700, background: '#f1ece5', color: '#8a8076', padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' }}>Inactive</span>}
      </div>
      <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>
        {[c.sector, c.country].filter(Boolean).join(' · ') || 'Business'}
        {c.created_at && <> · since {fmtDate(c.created_at)}</>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginTop: 14 }}>
        <Signal label="Team" value={team} empty="No logins yet" />
        <Signal label="Readiness" value={readiness} empty="Not assessed" />
        <Signal label="Training" value={trainings} empty="No training yet" />
        <Signal label="Tools adopted" value={tools} empty="None yet" />
        <Signal label="Governance" value={governance} empty="No policy yet" />
        <Signal label="Last engagement" value={fmtDate(c.last_engagement_at)} empty="No sessions logged" />
      </div>

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0ebe3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
        <span style={c.shares_anonymised_insights ? { color: '#166534', fontWeight: 600 } : muted}>
          {c.shares_anonymised_insights ? '◆ Sharing anonymised insights' : '◇ Not sharing insights'}
        </span>
        <span style={{ color: TERRACOTTA, fontWeight: 600 }}>Open client →</span>
      </div>
    </Link>
  );
}

export default function BeAIReadyAdminMediaMap() {
  const [rows, setRows] = useState(undefined);   // undefined = loading, null = error, [] = empty
  const [err, setErr] = useState('');

  const load = () => {
    setRows(undefined); setErr('');
    apiFetch('/beaiready/admin/mediamap').then(setRows).catch((e) => { setRows(null); setErr(e.message || 'Failed to load'); });
  };
  useEffect(load, []);

  return (
    <div style={{ maxWidth: 1080 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>MediaMap</h1>
      <p style={{ ...muted, marginBottom: 20, maxWidth: '70ch' }}>
        Every newsroom and business you&apos;ve worked with, and where each stands on its AI journey — pulled
        live from their real data. Click a card to open that client&apos;s cockpit.
      </p>

      {rows === undefined ? (
        <p style={muted}>Loading…</p>
      ) : rows === null ? (
        <div style={{ ...card, borderColor: '#fecaca', background: '#FEF2F2', color: '#B91C1C' }}>
          Couldn&apos;t load the MediaMap{err ? `: ${err}` : ''}.{' '}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#B91C1C', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...card }}>
          <p style={{ margin: 0 }}>No client businesses yet. Add one from <Link to="/admin">Today</Link> and it&apos;ll appear here.</p>
        </div>
      ) : (
        <>
          <div style={{ ...muted, fontSize: 12.5, marginBottom: 12 }}>{rows.length} {rows.length === 1 ? 'client' : 'clients'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {rows.map((c) => <ClientCard key={c.id} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}
