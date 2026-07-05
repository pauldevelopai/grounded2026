// BusinessProductivity — the authed Productivity workspace (/dashboard/productivity).
// The five measures (no surveillance — aggregate, entered by the business) and the
// live AI toolbox link. Scoped to the tenant. (KnowHow lives on the Training tab.)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const MEASURES = [
  ['deliverables', 'Deliverables completed'],
  ['revenue', 'Revenue generated'],
  ['time_spent', 'Time spent (hours)'],
  ['ai_hours_saved', 'AI hours saved'],
  ['client_outcomes', 'Client & customer outcomes'],
];

function thisPeriod() {
  // YYYY-MM without Date pitfalls in the sandbox is fine in the browser.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BusinessProductivity() {
  const [metrics, setMetrics] = useState(null);
  const [editing, setEditing] = useState(null); // metric key being entered
  const [val, setVal] = useState('');
  const [period, setPeriod] = useState(thisPeriod());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [goals, setGoals] = useState(null);

  const load = () => apiFetch('/beaiready/metrics').then(setMetrics).catch(() => setMetrics([]));
  useEffect(() => {
    load();
    apiFetch('/beaiready/goals').then(setGoals).catch(() => setGoals([]));
  }, []);

  const cur = (key) => (metrics || []).find((m) => m.metric === key);

  const submit = async (key) => {
    if (val === '') { setEditing(null); return; }
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/metrics/mine', { method: 'POST', body: JSON.stringify({ metric: key, value: Number(val), period }) });
      setEditing(null); setVal('');
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Productivity · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Measure what AI is saving your team</h1>
      <p style={{ color: '#6b6359', maxWidth: '64ch', marginBottom: 14 }}>
        Five measures that matter — tracked at the business level with your own baselines, never used to
        police individuals. Enter a value when you have one; an em-dash just means it's not set yet.
      </p>
      <p style={{ marginBottom: 18 }}><Link to="/dashboard">← Back to dashboard</Link></p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24 }}>
        {MEASURES.map(([key, label]) => {
          const m = cur(key);
          return (
            <div key={key} className="hub-card">
              <div className="hub-stat-value" style={{ color: '#c75b39' }}>
                {metrics == null ? '…' : m && m.value != null ? Number(m.value).toLocaleString() : '—'}
              </div>
              <div className="hub-stat-label">{label}</div>
              {m?.period && <div style={{ fontSize: 11, color: '#a89e92', marginTop: 2 }}>as of {m.period}</div>}
              {editing === key ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input autoFocus type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder="value" style={{ ...inp, width: 90 }} />
                  <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-06" style={{ ...inp, width: 80 }} />
                  <button onClick={() => submit(key)} disabled={busy} style={btnSmall}>Save</button>
                </div>
              ) : (
                <button onClick={() => { setEditing(key); setVal(''); }} style={{ ...btnGhostSmall, marginTop: 8 }}>
                  {m ? 'Update' : 'Enter value'}
                </button>
              )}
            </div>
          );
        })}
      </section>

      {/* Goals — agreed with your consultant at the start, tracked against the measures above. */}
      <div className="hub-section-label">Goals &amp; results</div>
      <p style={{ color: '#8a8076', fontSize: 13, margin: '-2px 0 12px', maxWidth: '64ch' }}>
        The targets you agreed at the start, and how you're tracking against them.
      </p>
      {goals == null ? <p style={{ color: '#8a8076' }}>Loading…</p> : goals.length === 0 ? (
        <p style={{ color: '#8a8076', fontSize: 13.5, marginBottom: 24 }}>No goals set yet — your Be AI Ready consultant agrees these with you at the start.</p>
      ) : (
        <section style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
          {goals.map((g) => <GoalCard key={g.id} g={g} />)}
        </section>
      )}

      <section className="hub-band">
        <h2>Your active AI toolbox</h2>
        <p style={{ margin: 0 }}>
          The best AI tools for each function, scored for data safety. <Link to="/toolbox">Open the toolbox →</Link>
        </p>
      </section>

      <section className="hub-band" style={{ marginTop: 16 }}>
        <h2>Prompt library</h2>
        <p style={{ margin: 0 }}>
          The prompts we recommend for the AI model your team uses — scored per model — and your own saved
          versions. Copy, rate, and build your library.
          {' '}<Link to="/dashboard/prompts">Open the prompt library →</Link> · <Link to="/dashboard/my-prompts">My prompts</Link>
        </p>
      </section>
    </div>
  );
}

const measureLabel = (k) => (MEASURES.find((m) => m[0] === k) || [])[1] || null;

function GoalCard({ g }) {
  const pct = g.progress != null ? Math.round(g.progress * 100) : null;
  const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString());
  const achieved = g.status === 'achieved';
  return (
    <div className="hub-card" style={achieved ? { borderColor: '#bbf7d0' } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{g.title}{achieved && <span style={{ color: '#166534', fontWeight: 600 }}> · achieved ✓</span>}</strong>
        {g.target_date && <span style={{ fontSize: 12, color: '#a89e92' }}>by {new Date(g.target_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>}
      </div>
      {g.detail && <p style={{ fontSize: 13, color: '#6b6359', margin: '4px 0 0' }}>{g.detail}</p>}
      {g.baseline != null && g.target != null && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8a8076', marginBottom: 4 }}>
            <span>from {fmt(g.baseline)}{g.unit ? ` ${g.unit}` : ''}</span>
            <span style={{ color: '#c75b39', fontWeight: 700 }}>now {fmt(g.current)}{pct != null ? ` · ${pct}%` : ''}</span>
            <span>target {fmt(g.target)}</span>
          </div>
          <div style={{ height: 8, background: '#f1ece5', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${pct || 0}%`, height: '100%', background: achieved ? '#16a34a' : '#c75b39' }} />
          </div>
          {g.current == null && g.metric && <p style={{ fontSize: 11.5, color: '#a89e92', margin: '4px 0 0' }}>Enter the “{measureLabel(g.metric) || g.metric}” measure above to track this.</p>}
        </div>
      )}
    </div>
  );
}

const inp = { padding: '7px 10px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' };
const btnSmall = { padding: '7px 12px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhostSmall = { padding: '6px 12px', background: 'transparent', color: '#6b6359', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
