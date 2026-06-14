// BusinessTraining — /dashboard/training. A client's living training record:
// upcoming + past trainings (from the CRM, scoped to their organisation), the
// materials from each, and their staff AI-competency intake. Real data only,
// honest empty states. Wrapped in BeAIReadyLayout; scoped server-side to the
// caller's own tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const TRAINING_WHATSAPP =
  'https://wa.me/27722337458?text=' +
  encodeURIComponent("Hi, I'd like to book a Be AI Ready training day.");

export default function BusinessTraining() {
  const [trainings, setTrainings] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [intake, setIntake] = useState(null);

  useEffect(() => {
    apiFetch('/beaiready/trainings').then(setTrainings).catch(() => setTrainings({ upcoming: [], past: [] }));
    apiFetch('/beaiready/materials').then(setMaterials).catch(() => setMaterials([]));
    apiFetch('/beaiready/intake').then(setIntake).catch(() => setIntake([]));
  }, []);

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · training</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>Your training</h1>
      <p style={{ color: '#6b6359', marginBottom: 24, maxWidth: '64ch' }}>
        Your trainings and mentoring — past and upcoming — with their materials, and where your team
        stands on AI competency. <Link to="/dashboard">← Back to your dashboard</Link>
      </p>

      {/* ── Trainings ── */}
      <div className="hub-section-label">Trainings</div>
      <section style={{ marginBottom: 24 }}>
        {trainings == null ? (
          <p style={{ color: '#8a8076' }}>Loading…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16 }}>
            <TrainingList title="Upcoming" items={trainings.upcoming || []} empty="No upcoming training scheduled." />
            <TrainingList title="Past" items={trainings.past || []} empty="No past trainings yet." />
          </div>
        )}
      </section>

      {/* ── Materials ── */}
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

      {/* ── Staff AI-competency (from connected forms) ── */}
      <div className="hub-section-label">Staff AI-competency</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        {intake == null ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Loading…</p>
        ) : intake.length === 0 ? (
          <p style={{ margin: 0 }}>
            No competency forms connected yet. Your team’s form responses feed a read on where they stand,
            so training targets the real gaps.
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

      <div className="hub-hero-cta" style={{ margin: '8px 0 24px' }}>
        <a href={TRAINING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">Book a training day</a>
        <Link to="/training" className="hub-btn hub-btn-ghost">See the training offer</Link>
      </div>
    </div>
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
