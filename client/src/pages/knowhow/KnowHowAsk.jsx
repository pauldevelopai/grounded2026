// KnowHow — junior-facing ASK page. Login-free, token-gated (the team ask-link an
// admin shares). A junior asks in their own words and gets coached from the
// captured knowledge of the senior people here — grounded, with the sources it
// drew on. Strictly from the corpus: if it's not captured, it says so. Mobile-first.
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const C = {
  bg: '#faf8f5', fg: '#1c1b1a', muted: '#6b6359', line: '#e4dcd2', card: '#fff',
  accent: '#c75b39', accentSoft: '#faf3ef', alert: '#8a2c2c', alertBg: '#f5e4e4',
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
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 96px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 24 }}>
          KnowHow · by Develop&nbsp;AI
        </div>
        {children}
      </div>
    </div>
  );
}

export default function KnowHowAsk() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [q, setQ] = useState('');
  const [thread, setThread] = useState([]);   // [{ q, a }]
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    getJson(`/api/knowhow/public/ask/${encodeURIComponent(token)}`)
      .then(setMeta).catch((e) => setLoadErr(e.message || 'This link is not valid.'));
  }, [token]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread, busy]);

  async function ask() {
    const question = q.trim();
    if (!question) return;
    setErr(''); setBusy(true); setQ('');
    setThread((t) => [...t, { q: question, a: null }]);
    try {
      const r = await getJson('/api/knowhow/public/ask', { method: 'POST', body: JSON.stringify({ token, question, mode: 'coach' }) });
      setThread((t) => t.map((row, i) => (i === t.length - 1 ? { ...row, a: r } : row)));
    } catch (e) {
      setErr(e.message || 'Could not answer — try again.');
      setThread((t) => t.slice(0, -1));   // drop the unanswered row
    } finally { setBusy(false); }
  }

  if (loadErr) return (
    <Shell>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>This link isn’t valid</h1>
      <p style={{ color: C.muted }}>{loadErr} Ask whoever shared it for a fresh link.</p>
    </Shell>
  );
  if (!meta) return (<Shell><p style={{ color: C.muted }}>Loading…</p></Shell>);

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Ask {meta.tenant || 'your team'}’s KnowHow</h1>
      <p style={{ color: C.muted, marginBottom: 20 }}>
        Stuck on something? Ask in your own words. The answers come from how your experienced colleagues here
        actually do it — not the internet. {meta.hasCorpus ? '' : 'Nothing’s been captured yet, so there’s nothing to draw on right now.'}
      </p>

      {thread.map((row, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{row.q}</div>
          {row.a == null ? (
            <div style={{ color: C.muted, fontSize: 14 }}>Thinking…</div>
          ) : row.a.empty ? (
            <div style={{ color: C.muted, fontSize: 14 }}>{row.a.message}</div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{row.a.answer}</div>
              {row.a.citations?.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: C.muted, marginBottom: 4 }}>From your team</div>
                  {row.a.citations.map((c) => (
                    <div key={c.n} style={{ fontSize: 12.5, color: C.muted, marginBottom: 2 }}>
                      <strong style={{ color: C.accent }}>[{c.n}] {c.source}</strong> — {c.snippet}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />

      {err && <div style={{ background: C.alertBg, color: C.alert, border: `1px solid ${C.alert}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>{err}</div>}

      <div style={{ position: 'sticky', bottom: 0, background: C.bg, paddingTop: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            placeholder="e.g. How do I know if a tender is worth bidding on?"
            rows={2}
            style={{ flex: 1, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 13px', fontFamily: sans, fontSize: 15, lineHeight: 1.5, resize: 'none', color: C.fg }}
          />
          <button onClick={ask} disabled={busy || !q.trim()}
            style={{ alignSelf: 'stretch', padding: '0 22px', fontSize: 15, fontWeight: 600, color: '#fff', background: (busy || !q.trim()) ? C.muted : C.accent, border: 'none', borderRadius: 10, cursor: (busy || !q.trim()) ? 'default' : 'pointer' }}>
            {busy ? '…' : 'Ask'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
