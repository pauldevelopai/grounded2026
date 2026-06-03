import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

// Pulse — public answer page (Phase 4). The newsroom-facing surface: no login,
// no admin chrome, mobile-first. It reads the cycle by its unguessable token and
// writes one Response, then shows the AI tip + a link back to their Node.
// Standalone styling (explicit colours, not admin CSS vars) so it stands on its
// own and matches the Node submit page's calm light theme.

const C = {
  bg: '#faf9f6', fg: '#1c1c1a', muted: '#6b6b66', line: '#e5e3da', card: '#fff',
  accent: '#1d4e8a', accentSoft: '#eef4fb', good: '#2c6b35', goodBg: '#e3f0e5',
  alert: '#8a2c2c', alertBg: '#f0d8d8',
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
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 20px 80px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 24 }}>
          Grounded · by Develop AI
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PulseAnswer() {
  const { token } = useParams();
  const [cycle, setCycle] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [answers, setAnswers] = useState({});   // index → option key
  const [openFeedback, setOpenFeedback] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);       // { tip, nodeUrl }
  const [err, setErr] = useState('');

  useEffect(() => {
    getJson(`/api/pulse/public/cycle/${encodeURIComponent(token)}`)
      .then(setCycle)
      .catch((e) => setLoadErr(e.message || 'This link is not valid.'));
  }, [token]);

  const questions = cycle?.questions || [];
  const allAnswered = questions.length > 0 && questions.every((_, i) => answers[i] != null);

  async function submit() {
    setErr('');
    if (!allAnswered) { setErr('Please answer all the questions first.'); return; }
    setBusy(true);
    try {
      // Send the chosen option LABELS (human-readable — that's what the editor + AI read).
      const chosen = questions.map((q, i) => {
        const opt = (q.options || []).find((o) => o.key === answers[i]);
        return opt ? opt.label : '';
      });
      const data = await getJson('/api/pulse/public/submit', {
        method: 'POST',
        body: JSON.stringify({ token, answers: chosen, openFeedback, name, role }),
      });
      setDone({ tip: data.tip || '', nodeUrl: data.nodeUrl || '' });
    } catch (e) {
      setErr(e.message || 'Could not submit — please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── States ──
  if (loadErr) return (
    <Shell>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>This link isn’t valid</h1>
      <p style={{ color: C.muted }}>{loadErr} Ask whoever sent it for a fresh link.</p>
    </Shell>
  );
  if (!cycle) return (<Shell><p style={{ color: C.muted }}>Loading…</p></Shell>);

  if (done) return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Thank you 🙏</h1>
      <p style={{ color: C.muted, marginBottom: 20 }}>Your answers went straight to the team — they shape what changes in your tool next.</p>
      {done.tip && (
        <div style={{ background: C.goodBg, border: `1px solid ${C.good}`, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.good, marginBottom: 6 }}>A tip for you</div>
          <div style={{ fontSize: 15, lineHeight: 1.55 }}>{done.tip}</div>
        </div>
      )}
      {done.nodeUrl && (
        <a href={done.nodeUrl} style={{ display: 'inline-block', background: C.accent, color: '#fff', fontWeight: 600, fontSize: 15, padding: '12px 22px', borderRadius: 8, textDecoration: 'none' }}>
          Open your tool →
        </a>
      )}
    </Shell>
  );

  if (cycle.alreadySubmitted) return (
    <Shell>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Already answered</h1>
      <p style={{ color: C.muted }}>Thanks — this check-in has already been submitted. Nothing more to do.</p>
    </Shell>
  );

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Quick check-in</h1>
      <p style={{ color: C.muted, marginBottom: 24 }}>
        {cycle.newsroom ? <>Hi {cycle.newsroom} — three</> : 'Three'} quick questions about your Grounded tool.
        Takes under a minute, and it directly shapes what we improve next.
      </p>

      {questions.map((q, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{i + 1}. {q.text}</div>
          {(q.options || []).map((o) => {
            const selected = answers[i] === o.key;
            return (
              <label key={o.key} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 8,
                border: `1.5px solid ${selected ? C.accent : C.line}`, background: selected ? C.accentSoft : C.card,
                borderRadius: 8, cursor: 'pointer', fontSize: 15,
              }}>
                <input
                  type="radio" name={`q${i}`} checked={selected}
                  onChange={() => setAnswers((a) => ({ ...a, [i]: o.key }))}
                  style={{ accentColor: C.accent }}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      ))}

      {/* Open feedback */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Anything else? <span style={{ color: C.muted, fontWeight: 400, fontSize: 14 }}>(optional)</span></div>
        <textarea
          value={openFeedback} onChange={(e) => setOpenFeedback(e.target.value)}
          placeholder="What’s working, what’s frustrating, what you wish it did…"
          style={{ width: '100%', minHeight: 90, border: `1px solid ${C.line}`, borderRadius: 8, padding: '11px 13px', fontFamily: sans, fontSize: 15, lineHeight: 1.5, resize: 'vertical', color: C.fg }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)"
            style={{ flex: 1, minWidth: 140, border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px', fontFamily: sans, fontSize: 14, color: C.fg }} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Your role (optional)"
            style={{ flex: 1, minWidth: 140, border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px', fontFamily: sans, fontSize: 14, color: C.fg }} />
        </div>
      </div>

      {err && <div style={{ background: C.alertBg, color: C.alert, border: `1px solid ${C.alert}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>{err}</div>}

      <button
        onClick={submit} disabled={busy || !allAnswered}
        style={{
          width: '100%', fontSize: 16, fontWeight: 600, color: '#fff',
          background: (busy || !allAnswered) ? C.muted : C.accent,
          border: 'none', borderRadius: 8, padding: '14px 22px', cursor: (busy || !allAnswered) ? 'default' : 'pointer',
        }}
      >
        {busy ? 'Sending…' : 'Send my answers'}
      </button>
    </Shell>
  );
}
