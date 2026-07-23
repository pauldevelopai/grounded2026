// BeAIReadyAdminMediaMap — the operator's map of media organisations and where
// each stands on its AI journey. Two lenses over one payload:
//   • Newsrooms — the Africa-wide directory, read LIVE from the "MediaMap"
//     Airtable base, with each org's AI-journey overlaid (journey status + Pulse
//     cycle activity). Needs PULSE_ENABLED; shows an honest connect state if off.
//   • Clients   — the deeper BE AI READY portfolio from our own data, one card
//     per onboarded business with its real engagement signals.
// Every figure is real (from Airtable / Postgres) or an honest empty state —
// never an invented number.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../../hooks/useApi.js';
import { useAdminBase } from './adminBase.js';

const TERRACOTTA = '#c75b39';
const card = { background: '#fff', border: '1px solid #e7ddd1', borderRadius: 12, padding: '16px 18px', textDecoration: 'none', color: 'inherit', display: 'block' };
const muted = { color: '#8a8076' };
const sigLabel = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8076', marginBottom: 2 };
const emptyVal = { color: '#b0a99f', fontStyle: 'italic', fontWeight: 400, fontSize: 13 };
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null);

// A journey-status pill. We don't hard-code the Airtable enum — a few common
// stages get a colour, everything else falls back to a neutral slate.
const JOURNEY_COLOR = [
  { re: /(live|deployed|scaling|advanced|mature)/i, bg: '#dcfce7', fg: '#166534' },
  { re: /(pilot|building|implement|progress|active)/i, bg: '#dbeafe', fg: '#1e40af' },
  { re: /(explor|aware|early|assess|onboard|interest)/i, bg: '#fef3c7', fg: '#92400e' },
  { re: /(stalled|paused|blocked|dormant)/i, bg: '#fee2e2', fg: '#991b1b' },
];
function journeyStyle(status) {
  const hit = JOURNEY_COLOR.find((c) => c.re.test(status || ''));
  const { bg, fg } = hit || { bg: '#eef2ff', fg: '#3730a3' };
  return { background: bg, color: fg };
}

// One labelled signal. `value` renders bold; a null/empty value shows `empty` in
// quiet italic so a missing measurement never reads as a real zero.
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

// ── Newsrooms lens (Airtable directory + AI journey) ─────────────────────────
function NewsroomCard({ n, pulseEnabled }) {
  const meta = [n.type, n.country, n.cohort && `${n.cohort} cohort`].filter(Boolean).join(' · ') || 'Newsroom';
  const pulse = n.cyclesRun > 0
    ? `${n.cyclesRun} cycle${n.cyclesRun === 1 ? '' : 's'}${n.latestCycleStatus ? ` · latest ${n.latestCycleStatus}` : ''}${n.latestCycleDate ? ` (${fmtDate(n.latestCycleDate)})` : ''}`
    : null;
  // Deep-link into the existing Pulse newsroom detail when Pulse is on.
  const Wrapper = pulseEnabled
    ? ({ children }) => <Link to={`/admin/pulse/newsrooms/${n.id}`} style={card}>{children}</Link>
    : ({ children }) => <div style={card}>{children}</div>;

  return (
    <Wrapper>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15.5, color: '#1c1b1a' }}>{n.name || 'Unnamed newsroom'}</div>
        {n.journeyStatus
          ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', whiteSpace: 'nowrap', ...journeyStyle(n.journeyStatus) }}>{n.journeyStatus}</span>
          : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', background: '#f1ece5', color: '#8a8076' }}>Not assessed</span>}
      </div>
      <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>{meta}</div>

      {n.who && <div style={{ ...muted, fontSize: 12.5, marginTop: 8, ...clamp2 }}>{n.who}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginTop: 12 }}>
        <Signal label="Pulse activity" value={pulse} empty="No cycles yet" />
        <Signal label="Languages" value={n.languages} empty="—" />
        <Signal label="AI tools in use" value={n.aiTools} empty="None logged" />
        <Signal label="Notes" value={n.notes ? (n.notes.length > 60 ? `${n.notes.slice(0, 60)}…` : n.notes) : ''} empty="—" />
      </div>

      {pulseEnabled && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0ebe3', textAlign: 'right', fontSize: 11.5 }}>
          <span style={{ color: TERRACOTTA, fontWeight: 600 }}>Open AI journey →</span>
        </div>
      )}
    </Wrapper>
  );
}

// ── Clients lens (Postgres BE AI READY portfolio) ────────────────────────────
function ClientCard({ c }) {
  const { p } = useAdminBase();
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
    <Link to={p(`/client?c=${c.id}`)} style={card}>
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

const selStyle = { padding: '7px 10px', borderRadius: 8, border: '1px solid #e0d6c8', background: '#fff', fontSize: 13, color: '#2a2724' };

export default function BeAIReadyAdminMediaMap() {
  const { p } = useAdminBase();
  const [data, setData] = useState(undefined);  // undefined = loading, null = error, {} = loaded
  const [err, setErr] = useState('');
  const [tab, setTab] = useState(null);          // 'newsrooms' | 'clients' (null → auto)
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('');

  const load = () => {
    setData(undefined); setErr('');
    apiFetch('/beaiready/admin/mediamap')
      .then((d) => setData(d && typeof d === 'object' && !Array.isArray(d)
        ? d
        : { pulseEnabled: false, directoryError: null, newsrooms: [], clients: Array.isArray(d) ? d : [] }))
      .catch((e) => { setData(null); setErr(e.message || 'Failed to load'); });
  };
  useEffect(load, []);

  const newsrooms = data?.newsrooms || [];
  const clients = data?.clients || [];
  const pulseEnabled = !!data?.pulseEnabled;
  const directoryError = data?.directoryError;

  // Default lens: the directory when it has rows, otherwise the client portfolio.
  const activeTab = tab || (newsrooms.length ? 'newsrooms' : 'clients');

  const countries = useMemo(
    () => [...new Set(newsrooms.map((n) => n.country).filter(Boolean))].sort(),
    [newsrooms]);
  const statuses = useMemo(
    () => [...new Set(newsrooms.map((n) => n.journeyStatus).filter(Boolean))].sort(),
    [newsrooms]);

  const filteredNewsrooms = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return newsrooms.filter((n) => {
      if (country && n.country !== country) return false;
      if (status && n.journeyStatus !== status) return false;
      if (needle) {
        const hay = `${n.name} ${n.who} ${n.aiTools} ${n.type} ${n.cohort}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [newsrooms, q, country, status]);

  const Tab = ({ id, label, count }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        appearance: 'none', border: 'none', background: 'none', cursor: 'pointer',
        padding: '8px 2px', marginRight: 22, fontSize: 14, fontWeight: 700,
        color: activeTab === id ? '#1c1b1a' : '#8a8076',
        borderBottom: activeTab === id ? `2px solid ${TERRACOTTA}` : '2px solid transparent',
      }}>
      {label} <span style={{ fontWeight: 600, color: '#b0a99f' }}>{count}</span>
    </button>
  );

  return (
    <div style={{ maxWidth: 1080 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>MediaMap</h1>
      <p style={{ ...muted, marginBottom: 16, maxWidth: '74ch' }}>
        Every media organisation on the map and where each stands on its AI journey.
        <strong> Newsrooms</strong> is the live directory from Airtable with each org&apos;s journey overlaid;
        <strong> Clients</strong> is your deeper BE AI READY portfolio, pulled from their real data.
      </p>

      {data === undefined ? (
        <p style={muted}>Loading…</p>
      ) : data === null ? (
        <div style={{ ...card, borderColor: '#fecaca', background: '#FEF2F2', color: '#B91C1C' }}>
          Couldn&apos;t load the MediaMap{err ? `: ${err}` : ''}.{' '}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#B91C1C', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Retry</button>
        </div>
      ) : (
        <>
          <div style={{ borderBottom: '1px solid #eadfce', marginBottom: 18 }}>
            <Tab id="newsrooms" label="Newsrooms" count={newsrooms.length} />
            <Tab id="clients" label="Clients" count={clients.length} />
          </div>

          {activeTab === 'newsrooms' ? (
            <>
              {!pulseEnabled && (
                <div style={{ ...card, background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E', marginBottom: 16 }}>
                  The Airtable directory is switched <strong>off</strong>. Set <code>PULSE_ENABLED=true</code> in the
                  server environment to connect the “MediaMap” Airtable base and populate this view. Your client
                  portfolio (below) still works without it.
                </div>
              )}
              {pulseEnabled && directoryError && (
                <div style={{ ...card, background: '#FEF2F2', borderColor: '#fecaca', color: '#B91C1C', marginBottom: 16 }}>
                  Couldn&apos;t reach Airtable: {directoryError}.{' '}
                  <button onClick={load} style={{ background: 'none', border: 'none', color: '#B91C1C', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>Retry</button>
                </div>
              )}

              {newsrooms.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <input
                    value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Search newsrooms…"
                    style={{ ...selStyle, minWidth: 220, flex: '1 1 220px' }} />
                  <select value={country} onChange={(e) => setCountry(e.target.value)} style={selStyle}>
                    <option value="">All countries</option>
                    {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
                    <option value="">All journey stages</option>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span style={{ ...muted, fontSize: 12.5 }}>{filteredNewsrooms.length} of {newsrooms.length}</span>
                </div>
              )}

              {newsrooms.length === 0 ? (
                pulseEnabled && !directoryError ? (
                  <div style={card}><p style={{ margin: 0 }}>No newsrooms in the Airtable directory yet.</p></div>
                ) : null
              ) : filteredNewsrooms.length === 0 ? (
                <div style={card}><p style={{ margin: 0 }}>No newsrooms match those filters.</p></div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {filteredNewsrooms.map((n) => <NewsroomCard key={n.id} n={n} pulseEnabled={pulseEnabled} />)}
                </div>
              )}
            </>
          ) : (
            clients.length === 0 ? (
              <div style={card}>
                <p style={{ margin: 0 }}>No client businesses yet. Add one from <Link to={p()}>Today</Link> and it&apos;ll appear here.</p>
              </div>
            ) : (
              <>
                <div style={{ ...muted, fontSize: 12.5, marginBottom: 12 }}>{clients.length} {clients.length === 1 ? 'client' : 'clients'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {clients.map((c) => <ClientCard key={c.id} c={c} />)}
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
