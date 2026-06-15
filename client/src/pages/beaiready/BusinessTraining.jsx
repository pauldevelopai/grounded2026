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
  const [agendas, setAgendas] = useState(null);
  const [myMaterials, setMyMaterials] = useState(null);
  const [outcomes, setOutcomes] = useState(null);

  useEffect(() => {
    apiFetch('/beaiready/trainings').then(setTrainings).catch(() => setTrainings({ upcoming: [], past: [] }));
    apiFetch('/beaiready/materials').then(setMaterials).catch(() => setMaterials([]));
    apiFetch('/beaiready/intake').then(setIntake).catch(() => setIntake([]));
    // Per-tenant training data (the consultant's work for this company). The server
    // returns only published agendas / published materials / final outcomes to a member.
    apiFetch('/beaiready/training/agendas').then(setAgendas).catch(() => setAgendas([]));
    apiFetch('/beaiready/training/materials').then(setMyMaterials).catch(() => setMyMaterials([]));
    apiFetch('/beaiready/training/outcomes').then(setOutcomes).catch(() => setOutcomes([]));
  }, []);

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · training</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>Your training</h1>
      <p style={{ color: '#6b6359', marginBottom: 24, maxWidth: '64ch' }}>
        Your trainings and mentoring — past and upcoming — with their materials, and where your team
        stands on AI competency. <Link to="/dashboard">← Back to your dashboard</Link>
      </p>

      {/* ── Your training agenda (per-tenant; published only) ── */}
      <div className="hub-section-label">Your training agenda</div>
      <section style={{ marginBottom: 24 }}>
        {agendas == null ? (
          <p style={{ color: '#8a8076' }}>Loading…</p>
        ) : agendas.length === 0 ? (
          <p className="hub-band" style={{ margin: 0 }}>Your agenda will appear here once your training is scheduled.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {agendas.map((a) => (
              <div key={a.id} className="hub-card">
                <div className="hub-card-kicker">{a.title}{a.scheduled_for ? ` · ${a.scheduled_for}` : ''}{a.location ? ` · ${a.location}` : ''}</div>
                {a.items?.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                    {a.items.map((i) => (
                      <li key={i.id} style={{ fontSize: 13.5 }}>
                        <strong>{i.time_label ? `${i.time_label} · ` : ''}{i.topic}</strong>
                        {i.detail && <span style={{ color: '#6b6359' }}> — {i.detail}</span>}
                      </li>
                    ))}
                  </ul>
                ) : <p style={{ color: '#8a8076', fontSize: 13, margin: 0 }}>Agenda details coming soon.</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Your materials (per-tenant; published only) ── */}
      <div className="hub-section-label">Your materials</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        {myMaterials == null ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Loading…</p>
        ) : myMaterials.length === 0 ? (
          <p style={{ margin: 0 }}>Your training materials will appear here — slides, guides and exercises from your sessions.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {myMaterials.map((m) => (
              <li key={m.id} style={{ fontSize: 13.5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#c75b39', background: '#f7ece7', padding: '1px 7px', borderRadius: 999, marginRight: 6 }}>{m.kind}</span>
                {m.url ? <a href={m.url} target="_blank" rel="noreferrer"><strong>{m.title}</strong></a> : <strong>{m.title}</strong>}
                {m.description && <div style={{ color: '#6b6359', marginTop: 2 }}>{m.description}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

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

      {/* ── Sector course library (shared, not per-tenant) ── */}
      <div className="hub-section-label">Course library · your sector</div>
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

      {/* ── Staff AI Needs (from connected competency forms; feeds strategy) ── */}
      <div className="hub-section-label">Staff AI Needs</div>
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

      {/* ── Your AI strategy (the outcome document, when final) ── */}
      <div className="hub-section-label">Your AI strategy</div>
      <section style={{ marginBottom: 24 }}>
        {outcomes == null ? (
          <p style={{ color: '#8a8076' }}>Loading…</p>
        ) : outcomes.length === 0 ? (
          <p className="hub-band" style={{ margin: 0 }}>Your AI-strategy outcome document will appear here once finalised after your audit and training.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {outcomes.map((o) => (
              <div key={o.id} className="hub-card">
                <div className="hub-card-kicker">{o.title}</div>
                {o.content && <div style={{ fontSize: 13.5, color: '#3a342e', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{o.content}</div>}
                {o.file_url && <p style={{ margin: '8px 0 0' }}><a href={o.file_url} target="_blank" rel="noreferrer">Download the document ↗</a></p>}
              </div>
            ))}
          </div>
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
