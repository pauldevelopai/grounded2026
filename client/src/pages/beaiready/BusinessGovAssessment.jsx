// BusinessGovAssessment — the authed Governance Assessment (/dashboard/governance/assessment).
// Self-assess across the four AIGP governance domains → a scorecard with per-domain scores
// and gaps. Questions are pre-answered from the business's own governance data (policy,
// register, controls, review routine) where we can tell, so it feels connected, not
// redundant. Extends the bair.audits engine behind the scenes (see docs/BUILD_…md).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

const BAND = { background: '#fff', border: '1px solid #e4dcd2' };

export default function BusinessGovAssessment() {
  const { user } = useAuth();
  const [view, setView] = useState('loading');   // loading | assess | scorecard | blocked
  const [domains, setDomains] = useState([]);      // question flow
  const [answers, setAnswers] = useState({});      // { question_id: answer_index }
  const [scorecard, setScorecard] = useState(null);
  const [blockedMsg, setBlockedMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setView('loading'); setErr('');
    try {
      const a = await apiFetch('/beaiready/governance/assessment');
      setDomains(a.domains);
      // seed answers from evidence-based suggestions (null = leave for the user)
      const seed = {};
      a.domains.forEach((d) => d.questions.forEach((q) => { if (q.suggested_index != null) seed[q.id] = q.suggested_index; }));
      setAnswers(seed);
      if (a.current_findings && a.current_findings.length) {
        const sc = await apiFetch('/beaiready/governance/assessment/scorecard');
        setScorecard(sc); setView('scorecard');
      } else {
        setView('assess');
      }
    } catch (e) {
      if (e.status === 409) { setBlockedMsg(e.message); setView('blocked'); }
      else { setErr(e.message); setView('assess'); }
    }
  }

  const totalQuestions = domains.reduce((n, d) => n + d.questions.length, 0);
  const answeredCount = Object.keys(answers).length;

  async function submit() {
    setBusy(true); setErr('');
    try {
      const payload = Object.entries(answers).map(([question_id, answer_index]) => ({ question_id, answer_index }));
      const sc = await apiFetch('/beaiready/governance/assessment/answers', { method: 'POST', body: JSON.stringify({ answers: payload }) });
      setScorecard(sc); setView('scorecard');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function attest() {
    setBusy(true); setErr('');
    try {
      const r = await apiFetch('/beaiready/governance/assessment/attest', { method: 'POST', body: JSON.stringify({}) });
      setScorecard((s) => ({ ...s, attested_at: r.attested_at }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Governance · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Governance Assessment</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 8 }}>
        A self-assessment of whether your business is up to scratch on AI governance — scored across
        four domains, with a clear picture of your gaps. Where your dashboard already holds the answer
        (your policy, register, controls, review routine), we've filled it in for you.
      </p>
      <p style={{ fontSize: 12.5, color: '#8a8076', maxWidth: '66ch', marginBottom: 16 }}>
        This is a governance self-assessment aligned to a recognised four-domain structure — it is
        <strong> not an accredited certification</strong>.
      </p>
      <p style={{ marginBottom: 20 }}>
        <Link to="/dashboard">← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance">Your AI policy</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/controls">Controls</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/review">Roles &amp; review</Link>
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {view === 'loading' && <p style={{ color: '#8a8076' }}>Loading…</p>}

      {view === 'blocked' && (
        <section className="hub-band" style={BAND}>
          <h2 style={{ marginTop: 0 }}>Not ready yet</h2>
          <p style={{ color: '#6b6359' }}>{blockedMsg}</p>
        </section>
      )}

      {view === 'assess' && (
        <section className="hub-band" style={BAND}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ marginTop: 0 }}>Answer honestly — {answeredCount}/{totalQuestions} answered</h2>
          </div>
          {domains.map((d) => (
            <div key={d.domain} style={{ marginTop: 18 }}>
              <div className="hub-card-kicker">Domain {d.domain} · {d.title}</div>
              {d.questions.map((q) => (
                <fieldset key={q.id} style={{ border: 'none', margin: '10px 0 0', padding: 0 }}>
                  <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                    {q.question_text}
                    {q.suggested_index != null && <span style={{ fontWeight: 400, fontSize: 11.5, color: '#8a8076' }}> · pre-filled from your data</span>}
                  </legend>
                  {q.options.map((opt, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5, cursor: 'pointer' }}>
                      <input type="radio" name={q.id} checked={answers[q.id] === i}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))} />
                      {opt}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={submit} disabled={busy || answeredCount === 0} style={btn}>{busy ? 'Scoring…' : 'See my scorecard'}</button>
            {scorecard && <button onClick={() => setView('scorecard')} style={btnGhost}>Cancel</button>}
          </div>
        </section>
      )}

      {view === 'scorecard' && scorecard && (
        <section className="hub-band" style={BAND}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Your governance scorecard</h2>
            <span style={{ fontSize: 28, fontWeight: 800, color: levelColour(scorecard.governance_score) }}>{scorecard.governance_score}<span style={{ fontSize: 14, color: '#8a8076' }}>/100</span></span>
          </div>
          <p style={{ color: '#6b6359', marginTop: 4 }}>Overall governance readiness: <strong>{levelLabel(scorecard.governance_score)}</strong>.</p>

          {scorecard.domains.map((d) => (
            <div key={d.domain} style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600 }}>
                <span>Domain {d.domain} · {d.title}</span>
                <span style={{ color: levelColour(d.score) }}>{d.score}/100</span>
              </div>
              <div style={{ height: 8, background: '#f0eae2', borderRadius: 5, marginTop: 4, overflow: 'hidden' }}>
                <div style={{ width: `${d.score}%`, height: '100%', background: levelColour(d.score) }} />
              </div>
              {d.gaps.length > 0 ? (
                <ul className="hub-card-points" style={{ marginTop: 8 }}>
                  {d.gaps.map((g, i) => <li key={i} style={{ color: '#9a3412' }}>{g.note || g.finding_type}</li>)}
                </ul>
              ) : (
                <p style={{ fontSize: 12.5, color: '#166534', margin: '6px 0 0' }}>No gaps in this domain — strong.</p>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setView('assess')} style={btn}>Re-assess</button>
            {user?.role === 'admin' && !scorecard.attested_at && (
              <button onClick={attest} disabled={busy} style={btnGhost}>Attest this result</button>
            )}
            {scorecard.attested_at && (
              <span style={{ fontSize: 12.5, color: '#166534' }}>✓ Attested {new Date(scorecard.attested_at).toLocaleDateString()}</span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function levelLabel(s) {
  if (s >= 80) return 'strong';
  if (s >= 50) return 'developing';
  return 'needs work';
}
function levelColour(s) {
  if (s >= 80) return '#166534';
  if (s >= 50) return '#b45309';
  return '#b91c1c';
}

const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', background: 'transparent', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
