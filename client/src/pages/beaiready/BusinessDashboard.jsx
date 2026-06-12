// BusinessDashboard — what a BE AI READY client (e.g. L2B) sees at /dashboard.
// Honest v1, real data only: recommendations from their audit, the five
// productivity metrics (em-dash until entered — never computed), trainings read
// from the CRM by their organisation, training materials, and a link to the
// live AI toolbox. BetterBoss is shown as roadmap-only (not built). Wrapped in
// BeAIReadyLayout by the router; scoped server-side to the caller's own tenant.
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

const PILLAR_LABEL = { visibility: 'Visibility', governance: 'Governance', security: 'Security' };
const PRIORITY_STYLE = {
  now: { bg: '#fee2e2', fg: '#991b1b' }, high: { bg: '#ffedd5', fg: '#9a3412' },
  medium: { bg: '#fef3c7', fg: '#92400e' }, low: { bg: '#f1f5f9', fg: '#475569' },
};

export default function BusinessDashboard() {
  const { user } = useAuth();
  const [recs, setRecs] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [trainings, setTrainings] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [intake, setIntake] = useState(null);
  const [policy, setPolicy] = useState(undefined);

  useEffect(() => {
    apiFetch('/beaiready/recommendations').then(setRecs).catch(() => setRecs([]));
    apiFetch('/beaiready/metrics').then(setMetrics).catch(() => setMetrics([]));
    apiFetch('/beaiready/trainings').then(setTrainings).catch(() => setTrainings({ upcoming: [], past: [] }));
    apiFetch('/beaiready/materials').then(setMaterials).catch(() => setMaterials([]));
    apiFetch('/beaiready/intake').then(setIntake).catch(() => setIntake([]));
    apiFetch('/beaiready/policy').then(setPolicy).catch(() => setPolicy(null));
  }, []);

  const metricVal = (key) => {
    const m = (metrics || []).find((x) => x.metric === key);
    return m && m.value != null ? Number(m.value).toLocaleString() : '—';
  };
  const recsFor = (pillar) => (recs || []).filter((r) => r.pillar === pillar);

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · your dashboard</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
        {user?.newsroom_name || 'Your business'}
      </h1>
      <p style={{ color: '#6b6359', marginBottom: 24, maxWidth: '64ch' }}>
        Your living Be AI Ready dashboard — recommendations from your audit across the three pillars,
        your trainings and materials, and the live AI toolbox. Updated as your audit progresses.
      </p>

      {/* ── The five productivity metrics (entered-only; em-dash otherwise) ── */}
      <div className="hub-section-label">Productivity</div>
      <section className="hub-stats" style={{ marginBottom: 28 }}>
        {METRICS.map(([key, label]) => (
          <div key={key} className="hub-stat">
            <div className="hub-stat-value" style={{ color: '#c75b39' }}>{metrics ? metricVal(key) : '…'}</div>
            <div className="hub-stat-label">{label}</div>
          </div>
        ))}
      </section>

      {/* ── Three pillars ── */}
      <div className="hub-section-label" id="pillars">Your three pillars</div>
      <section className="hub-grid" style={{ marginBottom: 28 }}>
        {/* Visibility + Security → their recommendations */}
        {['visibility', 'governance', 'security'].map((pillar) => {
          const list = recsFor(pillar);
          return (
            <div key={pillar} className="hub-card hub-card-section" style={{ '--accent': '#c75b39' }}>
              <div className="hub-card-kicker">{PILLAR_LABEL[pillar]}</div>
              {pillar === 'governance' && (
                <p style={{ fontSize: 12.5, color: '#6b6359', margin: '0 0 8px' }}>
                  <Link to="/dashboard/governance" style={{ fontWeight: 600 }}>
                    {policy ? 'Your AI policy →' : 'Build your AI policy →'}
                  </Link>
                  {policy === undefined ? '' : policy
                    ? <span style={{ color: '#16a34a' }}> · in place</span>
                    : <span style={{ color: '#8a8076' }}> · not yet built</span>}
                  <br />
                  <Link to="/legal/lawsuits">AI lawsuits</Link> · <Link to="/legal/regulations">regulations</Link>, tracked daily
                </p>
              )}
              {recs == null ? (
                <p style={{ color: '#8a8076', fontSize: 13 }}>Loading…</p>
              ) : list.length === 0 ? (
                <p style={{ color: '#8a8076', fontSize: 13 }}>
                  Recommendations appear here after your audit. <span style={{ color: '#c75b39' }}>—</span>
                </p>
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

      {/* ── Trainings ── */}
      <div className="hub-section-label" id="training">Your trainings</div>
      <section style={{ marginBottom: 24 }}>
        {trainings == null ? (
          <p style={{ color: '#8a8076' }}>Loading…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16 }}>
            <TrainingList title="Upcoming" items={trainings.upcoming} empty="No upcoming training scheduled." />
            <TrainingList title="Past" items={trainings.past} empty="No past trainings yet." />
          </div>
        )}
      </section>

      {/* ── Training materials ── */}
      <div className="hub-section-label">Training materials</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        {materials == null ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Loading…</p>
        ) : materials.length === 0 ? (
          <p style={{ margin: 0 }}>Your training and mentoring materials will appear here after your sessions.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {materials.map((c) => (
              <li key={c.id} style={{ marginBottom: 8 }}>
                <strong>{c.title}</strong>
                {c.modules?.length > 0 && (
                  <ul style={{ marginTop: 4 }}>
                    {c.modules.map((m) => (
                      <li key={m.id} style={{ fontSize: 13 }}>
                        {m.video_url ? <a href={m.video_url} target="_blank" rel="noreferrer">{m.title}</a>
                          : m.content_url ? <a href={m.content_url} target="_blank" rel="noreferrer">{m.title}</a>
                          : m.title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Intake (from your connected forms — spec Part D) ── */}
      <div className="hub-section-label">Intake</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        {intake == null ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Loading…</p>
        ) : intake.length === 0 ? (
          <p style={{ margin: 0 }}>No intake forms connected yet. Your form responses feed your strategy and training prep.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {intake.map((f) => (
              <li key={f.form_name} style={{ fontSize: 13.5 }}>
                <strong>{f.form_name}</strong> — {f.response_count} response{f.response_count === 1 ? '' : 's'}
                {f.last_synced_at && <span style={{ color: '#8a8076' }}> · synced {new Date(f.last_synced_at).toLocaleDateString()}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Toolbox + roadmap ── */}
      <div className="hub-section-label">Active AI toolbox</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        <p style={{ margin: 0 }}>
          A growing set of practical AI tools for everyday work. <a href="/tools/">Open the toolbox →</a>
        </p>
      </section>

      <div className="hub-section-label">On the roadmap</div>
      <section className="hub-band" style={{ background: '#f4f1ec' }}>
        <p style={{ margin: 0 }}>
          <strong>BetterBoss</strong> — clone a senior leader's expertise to coach your team.
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

function TrainingList({ title, items, empty }) {
  return (
    <div className="hub-card">
      <div className="hub-card-kicker">{title}</div>
      {items.length === 0 ? (
        <p style={{ color: '#8a8076', fontSize: 13, margin: 0 }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((e) => (
            <li key={e.id} style={{ fontSize: 13 }}>
              <strong>{(e.type || 'Training').replace(/_/g, ' ')}</strong>
              <span style={{ color: '#8a8076' }}>{e.status ? ` · ${e.status}` : ''}</span>
              <div style={{ color: '#6b6359' }}>
                {e.start_date || '—'}{e.end_date && e.end_date !== e.start_date ? ` → ${e.end_date}` : ''}
                {e.sessions?.length > 0 ? ` · ${e.sessions.length} session${e.sessions.length === 1 ? '' : 's'}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
