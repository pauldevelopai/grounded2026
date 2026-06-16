// BusinessStrategy — /dashboard/strategy. The client's AI strategy: their goals
// and a practical automation roadmap (the consultant's published strategy items),
// plus Staff AI Needs (read from their connected competency forms). Real data only,
// honest empty states. Wrapped in BeAIReadyLayout; scoped server-side to the
// caller's own tenant (members see PUBLISHED strategy items only).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

export default function BusinessStrategy() {
  const [strategy, setStrategy] = useState(null);
  const [intake, setIntake] = useState(null);

  useEffect(() => {
    apiFetch('/beaiready/training/strategy').then(setStrategy).catch(() => setStrategy([]));
    apiFetch('/beaiready/intake').then(setIntake).catch(() => setIntake([]));
  }, []);

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · strategy</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>Your AI strategy</h1>
      <p style={{ color: '#6b6359', marginBottom: 24, maxWidth: '64ch' }}>
        Your goals and a practical automation roadmap — what to take on first, sized by effort and payoff —
        plus where your team stands on AI. <Link to="/dashboard">← Back to your dashboard</Link>
      </p>

      {/* ── Goals + automation roadmap (per-tenant; published items) ── */}
      <div className="hub-section-label">Goals &amp; automation roadmap</div>
      <section style={{ marginBottom: 24 }}>
        {strategy == null ? (
          <p style={{ color: '#8a8076' }}>Loading…</p>
        ) : strategy.length === 0 ? (
          <p className="hub-band" style={{ margin: 0 }}>
            Your AI strategy — your goals and a practical automation roadmap — will appear here after your
            audit and training.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <StrategyBlock title="Goals" items={strategy.filter((s) => s.kind === 'goal')} />
            <StrategyBlock title="Automation roadmap" items={strategy.filter((s) => s.kind === 'automation')} auto />
          </div>
        )}
      </section>

      {/* ── Staff AI Needs (from connected competency forms; feeds strategy) ── */}
      <div className="hub-section-label">Staff AI Needs</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        {intake == null ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Loading…</p>
        ) : intake.length === 0 ? (
          <p style={{ margin: 0 }}>
            No competency forms connected yet. Your team’s form responses feed a read on where they stand,
            so your strategy and training target the real gaps.
          </p>
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
    </div>
  );
}

function StrategyBlock({ title, items, auto }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="hub-card">
      <div className="hub-card-kicker">{title}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {items.map((s) => (
          <li key={s.id} style={{ fontSize: 13.5 }}>
            <strong>{s.title}</strong>
            {auto && (s.effort || s.payoff) && (
              <span style={{ color: '#8a8076', fontSize: 12 }}>
                {s.effort ? `  · effort: ${s.effort}` : ''}{s.payoff ? `  · payoff: ${s.payoff}` : ''}
              </span>
            )}
            {s.detail && <div style={{ color: '#6b6359', marginTop: 2 }}>{s.detail}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
