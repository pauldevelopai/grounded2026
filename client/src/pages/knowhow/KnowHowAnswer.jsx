// KnowHow — public answer page. The employee-facing capture surface: no login,
// mobile-first, gated only by the unguessable token in the link (mirrors Pulse's
// answer page). It reads the capture questions for the token and writes one
// response per answer, capturing consent first if the person hasn't consented.
// Standalone styling (calm, warm) so it stands on its own.
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const C = {
  bg: '#faf8f5', fg: '#1c1b1a', muted: '#6b6359', line: '#e4dcd2', card: '#fff',
  accent: '#c75b39', accentSoft: '#faf3ef', good: '#166534', goodBg: '#e9f5ec',
  alert: '#8a2c2c', alertBg: '#f5e4e4',
};
const sans = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

async function getJson(url, opts) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.fg, fontFamily: sans, lineHeight: 1.5 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 24 }}>
          KnowHow · by Develop&nbsp;AI
        </div>
        {children}
      </div>
    </div>
  );
}

export default function KnowHowAnswer() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [answers, setAnswers] = useState({});   // prompt id → text
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getJson(`/api/knowhow/public/prompt/${encodeURIComponent(token)}`)
      .then((d) => { setData(d); setName(d.person || ''); })
      .catch((e) => setLoadErr(e.message || 'This link is not valid.'));
  }, [token]);

  const questions = data?.questions || [];
  const anyAnswered = questions.some((q) => (answers[q.id] || '').trim());

  async function submit() {
    setErr('');
    if (!anyAnswered) { setErr('Please answer at least one question.'); return; }
    if (data.consentNeeded && !consent) { setErr('Please tick the consent box so your knowledge can be saved.'); return; }
    setBusy(true);
    try {
      await getJson('/api/knowhow/public/answer', {
        method: 'POST',
        body: JSON.stringify({
          token, name, consent,
          answers: questions.map((q) => ({ prompt_id: q.id, body: answers[q.id] || '' })).filter((a) => a.body.trim()),
        }),
      });
      setDone(true);
    } catch (e) { setErr(e.message || 'Could not submit — please try again.'); }
    finally { setBusy(false); }
  }

  if (loadErr) return (
    <Shell>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>This link isn’t valid</h1>
      <p style={{ color: C.muted }}>{loadErr} Ask whoever sent it for a fresh link.</p>
    </Shell>
  );
  if (!data) return (<Shell><p style={{ color: C.muted }}>Loading…</p></Shell>);
  if (done) return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Thank you 🙏</h1>
      <p style={{ color: C.muted }}>Your experience is now captured and credited to you. It helps your colleagues — especially newer ones — learn how things are really done.</p>
    </Shell>
  );
  if (data.alreadyAnswered) return (
    <Shell>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Already answered</h1>
      <p style={{ color: C.muted }}>Thanks — these questions have already been answered. Nothing more to do.</p>
    </Shell>
  );

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{data.person ? `Hi ${data.person}` : 'A few questions'} 👋</h1>
      <p style={{ color: C.muted, marginBottom: 24 }}>
        {data.tenant ? `${data.tenant} is` : 'We’re'} capturing the know-how that makes your work yours — the
        judgement that isn’t written down anywhere. Answer in your own words; there are no wrong answers.
      </p>

      {questions.map((q, i) => (
        <div key={q.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{i + 1}. {q.text}</div>
          <textarea
            value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            placeholder="Tell it like you’d explain it to a new colleague…"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 110, border: `1px solid ${C.line}`, borderRadius: 8, padding: '11px 13px', fontFamily: sans, fontSize: 15, lineHeight: 1.55, resize: 'vertical', color: C.fg }}
          />
        </div>
      ))}

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '16px 20px', marginBottom: 14 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
          style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px', fontFamily: sans, fontSize: 14, color: C.fg }} />
        {data.consentNeeded && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, fontSize: 13.5, color: C.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, accentColor: C.accent }} />
            <span>I’m happy for my answers to be saved as part of {data.tenant || 'my company'}’s knowledge base, credited to me, and used to help train and support my colleagues.</span>
          </label>
        )}
      </div>

      {err && <div style={{ background: C.alertBg, color: C.alert, border: `1px solid ${C.alert}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>{err}</div>}

      <button
        onClick={submit} disabled={busy || !anyAnswered}
        style={{ width: '100%', fontSize: 16, fontWeight: 600, color: '#fff', background: (busy || !anyAnswered) ? C.muted : C.accent, border: 'none', borderRadius: 8, padding: '14px 22px', cursor: (busy || !anyAnswered) ? 'default' : 'pointer' }}
      >
        {busy ? 'Saving…' : 'Save my answers'}
      </button>
    </Shell>
  );
}
