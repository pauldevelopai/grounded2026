// BeAIReadyTraining — /training on the BE AI READY site. The single training page:
// the public offer for visitors, AND a signed-in client's living training record
// (agenda, materials, past/upcoming trainings) shown at the top. This replaced the
// separate /dashboard/training page. Real data only; honest empty states.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function BeAIReadyTraining() {
  const { user } = useAuth();

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Your training</div>
        <h1>Your training &amp; materials</h1>
        <p className="hub-lede">
          Everything from your Be AI Ready training, in one place — your agenda, your materials, and your
          past and upcoming sessions. Your whole team can come back to it any time.
        </p>
      </section>

      {/* The signed-in client's own training record (per-tenant, published items only). */}
      {user ? <TrainingRecord /> : (
        <section className="hub-band"><p style={{ margin: 0 }}>Sign in to see your training agenda and materials.</p></section>
      )}

      <section className="hub-band" style={{ background: '#f4f1ec' }}>
        <p style={{ margin: 0 }}>
          Want another hands-on training day for your team?{' '}
          <Link to="/training/book">See the one-day training offer →</Link>
        </p>
      </section>
    </div>
  );
}

// The signed-in client's living training record — agenda, materials, past/upcoming
// trainings, the sector course library, and the KnowHow roadmap. Scoped
// server-side to the caller's own tenant (published items only for members).
function TrainingRecord() {
  const [trainings, setTrainings] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [agendas, setAgendas] = useState(null);
  const [myMaterials, setMyMaterials] = useState(null);

  useEffect(() => {
    apiFetch('/beaiready/trainings').then(setTrainings).catch(() => setTrainings({ upcoming: [], past: [] }));
    apiFetch('/beaiready/materials').then(setMaterials).catch(() => setMaterials([]));
    apiFetch('/beaiready/training/agendas').then(setAgendas).catch(() => setAgendas([]));
    apiFetch('/beaiready/training/materials').then(setMyMaterials).catch(() => setMyMaterials([]));
  }, []);

  // Every published material shows somewhere: under its agenda when that agenda is
  // visible (published), otherwise here in "Your materials" — so nothing is silently
  // hidden if an admin published a material but left its agenda in draft.
  const visibleAgendaIds = new Set((agendas || []).map((a) => a.id));
  const looseMaterials = (myMaterials || []).filter((m) => !m.agenda_id || !visibleAgendaIds.has(m.agenda_id));

  return (
    <>
      <div className="hub-section-label" style={{ marginTop: 8 }}>Your training agenda</div>
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
                ) : !a.doc_kind && <p style={{ color: '#8a8076', fontSize: 13, margin: 0 }}>Agenda details coming soon.</p>}
                {a.doc_kind && (
                  <p style={{ margin: a.items?.length > 0 ? '8px 0 0' : 0 }}>
                    <a href={`/api/beaiready/training/agendas/${a.id}/doc/download`} target="_blank" rel="noreferrer">
                      {a.doc_kind === 'pdf' ? 'Download the agenda (PDF) ↗' : 'Open the agenda document ↗'}
                    </a>
                  </p>
                )}
                <FileLinks files={a.files} />
                {/* Materials linked to this training. */}
                {(() => {
                  const mats = (myMaterials || []).filter((m) => m.agenda_id === a.id);
                  return mats.length === 0 ? null : (
                    <div style={{ marginTop: 10, borderTop: '1px solid #efe7dd', paddingTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076', marginBottom: 4 }}>Materials</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                        {mats.map((m) => (
                          <li key={m.id} style={{ fontSize: 13 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#c75b39', marginRight: 6 }}>{m.kind}</span>
                            {m.url ? <a href={m.url} target="_blank" rel="noreferrer">{m.title}</a> : m.title}
                            <FileLinks files={m.files} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="hub-section-label">Your materials</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        {myMaterials == null ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Loading…</p>
        ) : looseMaterials.length === 0 ? (
          <p style={{ margin: 0 }}>Your training materials will appear here — slides, guides and exercises from your sessions. {myMaterials.length > 0 && 'Materials tied to a specific training show under that training above.'}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {looseMaterials.map((m) => (
              <li key={m.id} style={{ fontSize: 13.5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#c75b39', background: '#f7ece7', padding: '1px 7px', borderRadius: 999, marginRight: 6 }}>{m.kind}</span>
                {m.url ? <a href={m.url} target="_blank" rel="noreferrer"><strong>{m.title}</strong></a> : <strong>{m.title}</strong>}
                {m.description && <div style={{ color: '#6b6359', marginTop: 2 }}>{m.description}</div>}
                <FileLinks files={m.files} />
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <div className="hub-section-label">On the roadmap</div>
      <section className="hub-band" style={{ background: '#f4f1ec', marginBottom: 24 }}>
        <p style={{ margin: 0 }}>
          <strong>KnowHow</strong> — capture a manager's hard-won expertise and turn it into an AI guide
          that coaches junior staff through their real work.
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#8a8076' }}>In development</span>
        </p>
      </section>
    </>
  );
}

// Download links for an agenda's / material's attached files (tenant-scoped server-side).
function FileLinks({ files }) {
  if (!files || files.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4 }}>
      {files.map((f) => (
        <a key={f.id} href={`/api/beaiready/training/files/${f.id}/download`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>📎 {f.name} ↗</a>
      ))}
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
