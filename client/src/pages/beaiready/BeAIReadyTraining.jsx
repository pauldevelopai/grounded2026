// BeAIReadyTraining — /training on the BE AI READY site. The single training page:
// the public offer for visitors, AND a signed-in client's living training record
// (agenda, materials, past/upcoming trainings) shown at the top. This replaced the
// separate /dashboard/training page. Real data only; honest empty states.
import { useEffect, useState } from 'react';
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
    </div>
  );
}

// The signed-in client's living training record — agenda, materials, past/upcoming
// trainings, the sector course library, and the KnowHow roadmap. Scoped
// server-side to the caller's own tenant (published items only for members).
function TrainingRecord() {
  const [trainings, setTrainings] = useState(null);
  const [agendas, setAgendas] = useState(null);
  const [myMaterials, setMyMaterials] = useState(null);
  const [insights, setInsights] = useState(null);
  const [teamAnalysis, setTeamAnalysis] = useState(undefined); // undefined = loading, null = no survey yet
  const [curriculum, setCurriculum] = useState(undefined);     // undefined = loading, null = not indexed yet
  const [match, setMatch] = useState(undefined);               // undefined = loading, null = no survey yet

  useEffect(() => {
    apiFetch('/beaiready/trainings').then(setTrainings).catch(() => setTrainings({ upcoming: [], past: [] }));
    apiFetch('/beaiready/training/agendas').then(setAgendas).catch(() => setAgendas([]));
    apiFetch('/beaiready/training/materials').then(setMyMaterials).catch(() => setMyMaterials([]));
    apiFetch('/beaiready/training/form-insights').then(setInsights).catch(() => setInsights([]));
    // The team analysis, curriculum + expectations match are AI-generated on first view (then cached).
    apiFetch('/beaiready/training/team-analysis').then(setTeamAnalysis).catch(() => setTeamAnalysis(null));
    apiFetch('/beaiready/training/curriculum').then(setCurriculum).catch(() => setCurriculum(null));
    apiFetch('/beaiready/training/expectations-match').then(setMatch).catch(() => setMatch(null));
  }, []);

  // Every published material shows somewhere: under its agenda when that agenda is
  // visible (published), otherwise here in "Your materials" — so nothing is silently
  // hidden if an admin published a material but left its agenda in draft.
  const visibleAgendaIds = new Set((agendas || []).map((a) => a.id));
  const looseMaterials = (myMaterials || []).filter((m) => !m.agenda_id || !visibleAgendaIds.has(m.agenda_id));

  // Dashboard summary — a quick at-a-glance count of the training experience.
  const sessionCount = (agendas || []).length;
  const docCount = (agendas || []).reduce((s, a) => s + (a.files?.length || 0) + (a.reports?.length || 0) + (a.doc_kind ? 1 : 0), 0)
    + (myMaterials || []).reduce((s, m) => s + (m.files?.length || 0), 0);
  const surveyTotal = (insights || []).reduce((s, f) => s + (f.responses || 0), 0);
  const summaryReady = agendas != null && myMaterials != null && insights != null;

  return (
    <>
      {summaryReady && (sessionCount > 0 || docCount > 0 || surveyTotal > 0) && (
        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
          <Stat n={sessionCount} label={sessionCount === 1 ? 'training session' : 'training sessions'} />
          <Stat n={docCount} label={docCount === 1 ? 'document' : 'documents'} />
          {surveyTotal > 0 && <Stat n={surveyTotal} label="survey responses" />}
        </section>
      )}

      <div className="hub-section-label" style={{ marginTop: 8 }}>Your training sessions</div>
      <section style={{ marginBottom: 24 }}>
        {agendas == null ? (
          <p style={{ color: '#8a8076' }}>Loading…</p>
        ) : agendas.length === 0 ? (
          <p className="hub-band" style={{ margin: 0 }}>Your training sessions will appear here once your training is scheduled.</p>
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
                ) : (!a.doc_kind && !a.files?.length && !a.reports?.length) && <p style={{ color: '#8a8076', fontSize: 13, margin: 0 }}>Agenda details coming soon.</p>}
                {a.doc_kind && (
                  <p style={{ margin: a.items?.length > 0 ? '8px 0 0' : 0 }}>
                    <a href={`/api/beaiready/training/agendas/${a.id}/doc/download`} target="_blank" rel="noreferrer">
                      {a.doc_kind === 'pdf' ? 'Download the agenda (PDF) ↗' : 'Open the agenda document ↗'}
                    </a>
                  </p>
                )}
                {a.files?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={docLabel}>Agenda documents</div>
                    <FileLinks files={a.files} />
                  </div>
                )}
                {a.reports?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={docLabel}>Training report</div>
                    <FileLinks files={a.reports} />
                  </div>
                )}
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

      {/* What was actually taught — AI summary of the harvested session decks. Only
          shown once the materials are indexed (hidden entirely when there's nothing). */}
      {curriculum !== null && (
        <>
          <div className="hub-section-label">What your training covered</div>
          <section className="hub-band" style={{ marginBottom: 24 }}>
            {curriculum === undefined ? (
              <p style={{ margin: 0, color: '#8a8076' }}>Summarising your sessions…</p>
            ) : !curriculum.sessions?.length ? (
              <p style={{ margin: 0 }}>A summary of what each session covered will appear here once your materials are indexed.</p>
            ) : (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#8a8076' }}>{curriculum.sessions.length} sessions — click any to see the topics covered.</p>
                <div style={{ display: 'grid', gap: 2 }}>
                  {curriculum.sessions.map((s, i) => (
                    <details key={`${s.title}:${i}`} style={{ borderBottom: '1px solid #efe7dd', padding: '4px 0' }}>
                      <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#3a342e' }}>{s.title}</summary>
                      {s.points?.length > 0 && (
                        <ul style={{ margin: '6px 0 4px', paddingLeft: 18, display: 'grid', gap: 3 }}>
                          {s.points.map((p, j) => <li key={j} style={{ fontSize: 13.5, color: '#5b5249', lineHeight: 1.5 }}>{p}</li>)}
                        </ul>
                      )}
                    </details>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

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

      {/* Extra scheduled engagements from the CRM (separate from the sessions above).
          Only shown when there are any — otherwise the sessions above ARE the record,
          and an empty "No past trainings yet" would wrongly read as nothing happened. */}
      {trainings && ((trainings.upcoming || []).length > 0 || (trainings.past || []).length > 0) && (
        <>
          <div className="hub-section-label">Scheduled trainings</div>
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16 }}>
              <TrainingList title="Upcoming" items={trainings.upcoming || []} empty="No upcoming training scheduled." />
              <TrainingList title="Past" items={trainings.past || []} empty="No past trainings yet." />
            </div>
          </section>
        </>
      )}

      <div className="hub-section-label">Your team&apos;s AI readiness</div>
      <section className="hub-band" style={{ marginBottom: 24 }}>
        {teamAnalysis === undefined ? (
          <p style={{ margin: 0, color: '#8a8076' }}>Analysing your team&apos;s survey…</p>
        ) : teamAnalysis === null ? (
          <p style={{ margin: 0 }}>Once your team completes the AI-readiness survey, a full analysis of where they stand — and what they most need — appears here.</p>
        ) : (
          <TeamReadiness a={teamAnalysis} />
        )}
      </section>

      {/* Did the training deliver what the team wanted — expectations (intake) vs what
          was taught (curriculum), with feedback layered in once it's connected. */}
      {match !== null && (
        <>
          <div className="hub-section-label">Did the training match what your team wanted?</div>
          <section className="hub-band" style={{ marginBottom: 24 }}>
            {match === undefined ? (
              <p style={{ margin: 0, color: '#8a8076' }}>Matching what your team wanted to what was taught…</p>
            ) : (
              <MatchView m={match} />
            )}
          </section>
        </>
      )}

      {/* Post-training feedback (its own Google form) — shown only once one is connected. */}
      {(insights || []).some((f) => f.form_type === 'feedback') && (
        <>
          <div className="hub-section-label">Post-training feedback</div>
          <section className="hub-band" style={{ marginBottom: 24 }}>
            <div style={{ display: 'grid', gap: 18 }}>
              {(insights || []).filter((f) => f.form_type === 'feedback').map((f) => (
                <div key={`${f.form_type}:${f.form_name}`}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Post-training feedback
                    <span style={{ color: '#8a8076', fontWeight: 400 }}> — {f.responses} response{f.responses === 1 ? '' : 's'}</span>
                  </div>
                  {f.rating && (
                    <div style={{ fontSize: 13.5, marginTop: 4 }}>Average {ratingLabel(f.rating.label)}: <strong>{f.rating.avg}</strong>/10</div>
                  )}
                  {f.breakdowns.map((b) => (
                    <div key={b.question} style={{ marginTop: 8 }}>
                      <div style={docLabel}>{bdLabel(b.question)}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 8px', marginTop: 4 }}>
                        {b.top.map((t) => <span key={t.value} style={chip}>{t.value}<span style={{ color: '#8a8076', marginLeft: 4 }}>×{t.count}</span></span>)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

// Expectations vs delivery: each thing the team wanted, whether the training covered
// it (and, once feedback is connected, how they rated it), plus uncovered gaps.
const MATCH_STATUS = {
  delivered: ['#dcfce7', '#166534', 'Delivered'],
  partial: ['#fef3c7', '#92400e', 'Partly'],
  gap: ['#fde2dd', '#9a3412', 'Gap'],
};
function MatchView({ m }) {
  if (!m.summary && !(m.matches || []).length) {
    return <p style={{ margin: 0 }}>Once your team&apos;s survey and session materials are in, we&apos;ll match what they wanted against what the training covered.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {m.summary && (
        <div style={{ background: '#fff', borderLeft: '3px solid #c75b39', borderRadius: 8, padding: '12px 16px', fontSize: 14.5, lineHeight: 1.6, color: '#3a342e' }}>
          {m.summary}
        </div>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {(m.matches || []).map((x, i) => {
          const [bg, fg, label] = MATCH_STATUS[x.status] || MATCH_STATUS.partial;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'start', background: '#fff', border: '1px solid #eee5da', borderRadius: 8, padding: '9px 12px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, background: bg, color: fg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', marginTop: 1 }}>{label}</span>
              <div>
                <div style={{ fontSize: 13.5, color: '#3a342e' }}><strong>{x.expectation}</strong>{x.wanted_by ? <span style={{ color: '#8a8076' }}> · {x.wanted_by} wanted this</span> : null}</div>
                {x.covered_in && <div style={{ fontSize: 12.5, color: '#6b6359', marginTop: 2 }}>Covered in: {x.covered_in}</div>}
                {x.feedback && <div style={{ fontSize: 12.5, color: '#6b6359', marginTop: 2, fontStyle: 'italic' }}>Feedback: {x.feedback}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {m.gaps?.length > 0 && (
        <div>
          <div style={docLabel}>Wanted, but not covered</div>
          <ul style={{ margin: '5px 0 0', paddingLeft: 18, display: 'grid', gap: 3 }}>
            {m.gaps.map((g, i) => <li key={i} style={{ fontSize: 13.5, color: '#5b5249' }}>{g}</li>)}
          </ul>
        </div>
      )}
      {!m.has_feedback && (
        <div style={{ fontSize: 12.5, color: '#8a8076', borderTop: '1px solid #efe7dd', paddingTop: 8 }}>
          Connect a post-training feedback survey (Admin → Training → Training feedback) to add how your team rated each of these.
        </div>
      )}
    </div>
  );
}

// The rich team AI-readiness view: an AI narrative, a familiarity distribution, and
// AI-grouped role / learning / automation themes with counts. All aggregate — no names.
function TeamReadiness({ a }) {
  const f = a.familiarity;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {a.narrative && (
        <div style={{ background: '#fff', borderLeft: '3px solid #c75b39', borderRadius: 8, padding: '12px 16px', fontSize: 14.5, lineHeight: 1.6, color: '#3a342e' }}>
          {a.narrative}
        </div>
      )}
      {f && (
        <div>
          <div style={docLabel}>AI familiarity · {f.counted} people · avg {f.avg}/10</div>
          <DistBar buckets={[['Beginner', f.beginner, '#e6b09c'], ['Intermediate', f.intermediate, '#d3805f'], ['Advanced', f.advanced, '#b8492a']]} total={f.counted} />
        </div>
      )}
      {a.role_groups?.length > 0 && <Group label="Who's on the team" items={a.role_groups} />}
      {a.learning_priorities?.length > 0 && <Group label="What your team most wants to learn" items={a.learning_priorities} />}
      {a.automation_opportunities?.length > 0 && <Group label="Where AI could save the most time" items={a.automation_opportunities} />}
      {a.tools?.length > 0 && (
        <div>
          <div style={docLabel}>Tools your team already uses</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 8px', marginTop: 4 }}>
            {a.tools.map((t) => <span key={t.label} style={chip}>{t.label}<span style={{ color: '#8a8076', marginLeft: 4 }}>×{t.count}</span></span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// A labelled list of {label,count} rendered as proportional bars.
function Group({ label, items }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div>
      <div style={docLabel}>{label}</div>
      <div style={{ display: 'grid', gap: 5, marginTop: 5 }}>
        {items.map((i) => (
          <div key={i.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', background: '#f4ece7', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.round((i.count / max) * 100)}%`, background: '#f1d8cb' }} />
              <span style={{ position: 'relative', fontSize: 13, padding: '4px 10px', display: 'block', color: '#3a342e' }}>{i.label}</span>
            </div>
            <span style={{ fontSize: 12.5, color: '#8a8076', minWidth: 60, textAlign: 'right' }}>{i.count} {i.count === 1 ? 'person' : 'people'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The three-bucket familiarity distribution as one proportional bar + a legend.
function DistBar({ buckets, total }) {
  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid #eee5da' }}>
        {buckets.filter(([, count]) => count > 0).map(([name, count, color]) => (
          <div key={name} title={`${name}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
            {count}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 11.5, color: '#6b6359' }}>
        {buckets.map(([name, count, color]) => (
          <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} /> {name} ({count})
          </span>
        ))}
      </div>
    </div>
  );
}

// Short, friendly heading for an aggregated survey column (the raw headers are long questions).
function bdLabel(q) {
  const l = (q || '').toLowerCase();
  if (l.includes('tool')) return 'Most-used tools';
  if (l.includes('learn')) return 'What your team wants to learn';
  if (l.includes('automat')) return 'Tasks your team would automate';
  return q.length > 48 ? `${q.slice(0, 46)}…` : q;
}
// Friendly short name for the 0–10 rating question (the raw header is a full sentence).
function ratingLabel(q) {
  const l = (q || '').toLowerCase();
  if (l.includes('familiar')) return 'AI familiarity';
  if (l.includes('confiden')) return 'AI confidence';
  if (l.includes('comfort')) return 'comfort with AI';
  if (l.includes('negative or positive') || l.includes('sentiment')) return 'sentiment about AI';
  return q.length > 36 ? `${q.slice(0, 34).toLowerCase()}…` : q.toLowerCase();
}
const chip = { fontSize: 12.5, background: '#f7ece7', color: '#7a4636', padding: '2px 9px', borderRadius: 999 };

// A single dashboard stat tile (big number + label).
function Stat({ n, label }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: '12px 18px', minWidth: 108 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#c75b39', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12, color: '#6b6359', marginTop: 3 }}>{label}</div>
    </div>
  );
}

const docLabel = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076' };

// Download links for an agenda's / material's attached files (tenant-scoped server-side).
// The `download` attribute forces a direct download (same-origin); "Download all"
// triggers each with a small stagger so the browser doesn't block the batch.
function FileLinks({ files }) {
  if (!files || files.length === 0) return null;
  const url = (f) => `/api/beaiready/training/files/${f.id}/download`;
  const downloadAll = () => {
    files.forEach((f, i) => setTimeout(() => {
      const a = document.createElement('a'); a.href = url(f); a.download = f.name || '';
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 400));
  };
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {files.map((f) => (
          <a key={f.id} href={url(f)} download={f.name} style={{ fontSize: 12.5 }}>📎 {f.name} ↓</a>
        ))}
      </div>
      {files.length > 1 && (
        <button onClick={downloadAll} style={{ marginTop: 4, fontSize: 12, color: '#c75b39', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
          ⬇ Download all ({files.length})
        </button>
      )}
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
