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

// The client-facing pillars, each with the tool it opens — the six-part Be AI Ready
// model (Paul, 2026-06-24): Knowledge (the foundation, holds the visibility scan +
// KnowHow), Training, Governance, AI Data Security (its own pillar now — the AI
// system register + acceptable use), Tools, Strategy, Measurement.
// `absorbs` lists legacy recommendation pillar keys this card should also show, so
// recs authored before the re-map still surface under their new home.
const PILLARS = [
  { key: 'knowledge', label: 'Knowledge', to: '/dashboard/visibility', cta: 'How AI sees your business', absorbs: ['visibility'] },
  { key: 'training', label: 'Training', to: '/training', cta: 'Agenda & materials' },
  { key: 'governance', label: 'Governance', to: '/dashboard/governance', cta: 'Policy & law tracker' },
  { key: 'data-security', label: 'AI Data Security', to: '/dashboard/security', cta: 'AI system register & acceptable use', absorbs: ['data-security'] },
  { key: 'productivity', label: 'Tools', to: '/toolbox', cta: 'Toolbox, prompts & Nodes' },
  { key: 'strategy', label: 'Strategy', to: '/dashboard/strategy', cta: 'Goals & automation roadmap' },
  { key: 'measurement', label: 'Measurement', to: '/dashboard/productivity', cta: 'Goals & productivity' },
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
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    apiFetch('/beaiready/recommendations').then(setRecs).catch(() => setRecs([]));
    apiFetch('/beaiready/metrics').then(setMetrics).catch(() => setMetrics([]));
    apiFetch('/beaiready/policy').then(setPolicy).catch(() => setPolicy(null));
    apiFetch('/beaiready/insights/mine').then(setInsights).catch(() => setInsights([]));
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
          const list = recsFor(p.key, ...(p.absorbs || []));
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

      {/* ── Team AI workspace — the pooled, knowledge-grounded company AI ── */}
      <div className="hub-section-label">Team AI workspace</div>
      <section className="hub-band" style={{ marginBottom: 24, background: '#fbf7f4', border: '1px solid #eaddd3' }}>
        <p style={{ margin: 0 }}>
          Your team's shared AI — ask anything, grounded in your own knowledge, and every answer is pooled so the
          business builds on it instead of losing it. <Link to="/dashboard/workspace">Open the workspace →</Link>
        </p>
      </section>

      {/* ── Your documents — a member's private extraction space (Tier 1) ── */}
      <div className="hub-section-label">Your documents</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        <p style={{ margin: 0 }}>
          Drop in a contract, report or spreadsheet and get the text, a plain‑language summary and the key
          facts pulled out — private to you. <Link to="/dashboard/extraction">Open your documents →</Link>
        </p>
      </section>

      {/* ── KnowHow — Tier-1 personal base + the company-grounded new-staff coach ── */}
      <div className="hub-section-label">KnowHow</div>
      <section className="hub-band" style={{ marginBottom: 24, background: '#fbf7f4', border: '1px solid #eaddd3' }}>
        <p style={{ margin: 0 }}>
          Build your own knowledge &amp; workflows, and let new staff learn the ropes from a coach grounded in your
          company's shared know‑how. <Link to="/dashboard/knowhow">My knowledge &amp; workflows →</Link> · <Link to="/dashboard/coach">New‑staff coach →</Link>
        </p>
      </section>

      {/* ── What works for businesses like yours — anonymised cross-business patterns ── */}
      {insights && insights.length > 0 && (
        <>
          <div className="hub-section-label">What works for businesses like yours</div>
          <p style={{ color: '#8a8076', fontSize: 13, margin: '-2px 0 10px', maxWidth: '64ch' }}>
            Patterns learned across similar businesses that chose to share — anonymised, never traceable to any one company.
          </p>
          <section style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
            {insights.slice(0, 5).map((it) => (
              <div key={it.id} style={{ background: '#fff', border: '1px solid #eee5da', borderRadius: 10, padding: '12px 14px' }}>
                <strong style={{ fontSize: 14 }}>{it.title}</strong>
                <p style={{ fontSize: 13, color: '#5b5249', margin: '4px 0 0', lineHeight: 1.5 }}>{it.insight}</p>
                <div style={{ fontSize: 11, color: '#a89e92', marginTop: 4 }}>from {it.supporting_orgs} similar businesses</div>
              </div>
            ))}
          </section>
        </>
      )}

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

    </div>
  );
}

function PriorityBadge({ p }) {
  const s = PRIORITY_STYLE[p] || PRIORITY_STYLE.medium;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '1px 7px', borderRadius: 999, background: s.bg, color: s.fg }}>{p || 'medium'}</span>
  );
}
