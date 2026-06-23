// BusinessDashboard — what a BE AI READY client (e.g. L2B) sees at /dashboard.
// A coherent map of everything they have: the five productivity metrics, a card
// per client-facing pillar (each linking to its tool + showing that pillar's
// recommendations), the live toolbox, and the law/regulation tracker. The fuller
// training detail (agenda, materials) lives on the public /training page and the strategy
// (goals, automation roadmap, Staff AI Needs) on /dashboard/strategy; this just
// summarises + links. Real data only, honest empty states; scoped server-side to
// the caller's own tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

const METRICS = [
  ['deliverables', 'Deliverables'],
  ['revenue', 'Revenue'],
  ['time_spent', 'Time spent'],
  ['ai_hours_saved', 'AI hours saved'],
  ['client_outcomes', 'Client outcomes'],
];

// The client-facing pillars, each with the tool it opens. Visibility, Data Security
// and Strategy are hidden for the time being (Paul, 2026-06-23) — left here, commented,
// so they're one line from returning.
const PILLARS = [
  { key: 'training', label: 'Training', to: '/training', cta: 'Agenda & materials' },
  { key: 'governance', label: 'Governance', to: '/dashboard/governance', cta: 'Build your AI policy' },
  { key: 'productivity', label: 'Productivity', to: '/dashboard/productivity', cta: 'Track productivity' },
  // { key: 'visibility', label: 'Visibility', to: '/dashboard/visibility', cta: 'How AI sees your business' },
  // { key: 'data-security', label: 'Data Security', to: '/dashboard/security', cta: 'Your AI tools & data exposure' },
  // { key: 'strategy', label: 'Strategy', to: '/dashboard/strategy', cta: 'Goals, automation roadmap & Staff AI Needs' },
];

const PRIORITY_STYLE = {
  now: { bg: '#fee2e2', fg: '#991b1b' }, high: { bg: '#ffedd5', fg: '#9a3412' },
  medium: { bg: '#fef3c7', fg: '#92400e' }, low: { bg: '#f1f5f9', fg: '#475569' },
};

export default function BusinessDashboard() {
  const { user } = useAuth();
  const [recs, setRecs] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [policy, setPolicy] = useState(undefined);

  useEffect(() => {
    apiFetch('/beaiready/recommendations').then(setRecs).catch(() => setRecs([]));
    apiFetch('/beaiready/metrics').then(setMetrics).catch(() => setMetrics([]));
    apiFetch('/beaiready/policy').then(setPolicy).catch(() => setPolicy(null));
  }, []);

  const metricVal = (key) => {
    const m = (metrics || []).find((x) => x.metric === key);
    return m && m.value != null ? Number(m.value).toLocaleString() : '—';
  };
  const recsFor = (...pillars) => (recs || []).filter((r) => pillars.includes(r.pillar));

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · your dashboard</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
        {user?.newsroom_name || 'Your business'}
      </h1>
      <p style={{ color: '#6b6359', marginBottom: 24, maxWidth: '64ch' }}>
        Your living Be AI Ready dashboard — your pillars with the recommendations from your audit, your
        training and strategy, the live AI toolbox, and the law &amp; regulation tracker. Updated as your
        engagement progresses.
      </p>

      {/* ── The five productivity metrics (entered-only; em-dash otherwise) ── */}
      <div className="hub-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>Productivity</span>
        <Link to="/dashboard/productivity" style={{ fontSize: 12, color: '#c75b39', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>Manage →</Link>
      </div>
      <section className="hub-stats" style={{ marginBottom: 28 }}>
        {METRICS.map(([key, label]) => (
          <div key={key} className="hub-stat">
            <div className="hub-stat-value" style={{ color: '#c75b39' }}>{metrics ? metricVal(key) : '…'}</div>
            <div className="hub-stat-label">{label}</div>
          </div>
        ))}
      </section>

      {/* ── Pillars ── */}
      <div className="hub-section-label" id="pillars">Your pillars</div>
      <section className="hub-grid" style={{ marginBottom: 28 }}>
        {PILLARS.map((p) => {
          const list = recsFor(p.key);
          return (
            <div key={p.key} className="hub-card hub-card-section" style={{ '--accent': '#c75b39' }}>
              <div className="hub-card-kicker">{p.label}</div>
              <p style={{ fontSize: 12.5, color: '#6b6359', margin: '0 0 8px' }}>
                <Link to={p.to} style={{ fontWeight: 600 }}>{p.cta} →</Link>
                {p.key === 'governance' && (
                  <>
                    {policy === undefined ? '' : policy
                      ? <span style={{ color: '#16a34a' }}> · policy in place</span>
                      : <span style={{ color: '#8a8076' }}> · not yet built</span>}
                    <br />
                    <Link to="/tracker">Law &amp; regulation tracker →</Link>
                  </>
                )}
              </p>
              {recs == null ? (
                <p style={{ color: '#8a8076', fontSize: 13 }}>Loading…</p>
              ) : list.length === 0 ? (
                <p style={{ color: '#8a8076', fontSize: 13 }}>Recommendations appear here after your audit. <span style={{ color: '#c75b39' }}>—</span></p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map((r) => (
                    <li key={r.id} style={{ fontSize: 13, lineHeight: 1.5 }}>
                      <PriorityBadge p={r.priority} /> <strong>{r.title}</strong>
                      {r.detail && <div style={{ color: '#6b6359', marginTop: 2 }}>{r.detail}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {/* ── Toolbox + roadmap ── */}
      <div className="hub-section-label">Active AI toolbox</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        <p style={{ margin: 0 }}>
          A growing, scored guide to the best AI tools for each job — filter by cost, difficulty and data
          exposure. <Link to="/toolbox">Open the toolbox →</Link>
        </p>
      </section>

      <div className="hub-section-label">Prompt library</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        <p style={{ margin: 0 }}>
          Proven prompts for the AI model you use — copy, rate, and save your own.
          <Link to="/dashboard/prompts"> Open the library →</Link> · <Link to="/dashboard/my-prompts">My prompts</Link>
        </p>
      </section>

      <div className="hub-section-label">On the roadmap</div>
      <section className="hub-band" style={{ background: '#f4f1ec' }}>
        <p style={{ margin: 0 }}>
          <strong>KnowHow</strong> — clone a senior leader's expertise to coach your team.
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#8a8076' }}>Coming soon</span>
        </p>
      </section>
    </div>
  );
}

function PriorityBadge({ p }) {
  const s = PRIORITY_STYLE[p] || PRIORITY_STYLE.medium;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '1px 7px', borderRadius: 999, background: s.bg, color: s.fg }}>{p || 'medium'}</span>
  );
}
