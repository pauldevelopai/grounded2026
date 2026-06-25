// BusinessWorkspace — /dashboard/workspace. The pooled company AI workspace: the
// whole team asks their company's AI here, and every question + answer is kept in one
// shared place so the business builds on it instead of losing it in personal chats.
// Each answer is grounded in the company's OWN knowledge (documents, training, and the
// team's earlier answers) — server-scoped to this tenant; never another company's.
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../hooks/useApi.js';

const SOURCE_LABEL = { document: 'your documents', knowledge: 'company knowledge', pattern: 'sector pattern', team_history: 'earlier team Q&A' };

export default function BusinessWorkspace() {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);     // { answer, sources, id }
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    apiFetch(`/beaiready/workspace/interactions${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
      .then(setList).catch((e) => setErr(e.message));
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const ask = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true); setErr(''); setAnswer(null);
    try {
      const r = await apiFetch('/beaiready/workspace/ask', { method: 'POST', body: JSON.stringify({ question: question.trim() }) });
      setAnswer(r); setQuestion(''); load();
    } catch (e) { setErr(e.message); }
    setAsking(false);
  };
  const act = async (fn) => { setErr(''); try { await fn(); load(); } catch (e) { setErr(e.message); } };
  const pin = (id) => act(() => apiFetch(`/beaiready/workspace/interactions/${id}/pin`, { method: 'POST' }));
  const promote = (id) => act(() => apiFetch(`/beaiready/workspace/interactions/${id}/promote`, { method: 'POST' }));
  const del = (id) => act(() => apiFetch(`/beaiready/workspace/interactions/${id}`, { method: 'DELETE' }));

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Be AI Ready · Tools</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>Team AI workspace</h1>
      <p style={{ color: '#6b6359', marginBottom: 20, maxWidth: '66ch' }}>
        Ask your company's AI. Every answer is grounded in <b>your own</b> knowledge — your documents, your
        training, and the team's earlier answers — and kept here so the whole business builds on it. Nothing
        leaves your company.
      </p>

      {err && <div style={banner}>{err}</div>}

      <form onSubmit={ask} style={{ ...card, display: 'grid', gap: 10 }}>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask anything about how your business works, your tools, your policies…"
          style={{ ...inp, minHeight: 70, fontSize: 15 }} />
        <div><button type="submit" disabled={asking || !question.trim()} style={btn}>{asking ? 'Thinking…' : 'Ask the company AI'}</button></div>
      </form>

      {answer && (
        <div style={{ ...card, borderColor: '#eaddd3', background: '#fbf7f4', marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', marginBottom: 6 }}>Answer</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.55, color: '#2a2520' }}>{answer.answer}</div>
          <SourceChips sources={answer.sources} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '28px 0 10px', gap: 10, flexWrap: 'wrap' }}>
        <div className="hub-section-label" style={{ margin: 0 }}>The team's shared AI history</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the history…" style={{ ...inp, maxWidth: 260 }} />
      </div>

      {list == null ? <p style={muted}>Loading…</p> : list.length === 0 ? (
        <p style={muted}>No questions yet — the first answers from your team will collect here.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((it) => (
            <div key={it.id} style={{ ...card, ...(it.is_pinned ? { borderColor: '#e6b8a6' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{it.is_pinned && <span title="Pinned" style={{ color: '#c75b39' }}>★ </span>}{it.question}</div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => pin(it.id)} style={tag} title="Pin as useful">{it.is_pinned ? 'Unpin' : 'Pin'}</button>
                  {!it.promoted && <button onClick={() => promote(it.id)} style={tag} title="Save into company knowledge">Save to knowledge</button>}
                  {it.promoted && <span style={{ ...tag, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}>✓ in knowledge</span>}
                  <button onClick={() => del(it.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
                </div>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.5, color: '#5b5249', margin: '6px 0 0' }}>{it.answer}</div>
              <SourceChips sources={it.sources} />
              <div style={{ fontSize: 11.5, color: '#a89e92', marginTop: 6 }}>
                {it.asked_by ? `Asked by ${it.asked_by}` : 'Asked'} · {new Date(it.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceChips({ sources }) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      <span style={{ fontSize: 11, color: '#8a8076' }}>Grounded in:</span>
      {list.slice(0, 8).map((s, i) => (
        <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#f1f0ec', color: '#6b6359' }}
          title={s.title}>{SOURCE_LABEL[s.type] || s.type}{s.title ? ` · ${s.title.slice(0, 28)}` : ''}</span>
      ))}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const inp = { padding: '10px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const btn = { padding: '10px 18px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tag = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const muted = { color: '#8a8076', fontSize: 13.5 };
