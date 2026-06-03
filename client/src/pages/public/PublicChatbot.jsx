// Floating "Ask For Help" chatbot for Grounded.
// Collapsed: small circular button bottom-right. Expanded: chat panel.
// Server-side it spans the whole of Grounded — newsroom AI implementation,
// the Nodes, the tools, and the AI-law / ethics / monetisation / data-security
// resource datasets.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const STORAGE_KEY = 'grounded_chat_history_v1';
const SUGGESTIONS = [
  'Which Node should I start with?',
  'How do I verify a suspicious election post?',
  'How can my newsroom make money from AI?',
  'When does the EU AI Act take effect?',
];

export default function PublicChatbot() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  // Restore history from sessionStorage so a refresh doesn't wipe the chat
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
  }, [history]);

  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, loading]);

  async function send(text) {
    const msg = (text || '').trim();
    if (!msg || loading) return;

    const userTurn = { role: 'user', content: msg };
    const nextHistory = [...history, userTurn];
    setHistory(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await publicFetch('/public/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          history: history.map(h => ({ role: h.role, content: h.content })),
        }),
      });
      setHistory([...nextHistory, {
        role: 'assistant',
        content: res.reply,
        citations: res.citations || [],
        context_used: res.context_used,
      }]);
    } catch (err) {
      setError(err.message);
      // Revert the user turn so the user can retry
      setHistory(history);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setHistory([]);
    setError(null);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  if (!open) {
    // Round terracotta icon button — identical to the shared chrome.js chat bubble.
    // Stacks directly above the feedback bubble (which owns the corner at bottom:20).
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Ask For Help"
        style={{
          position: 'fixed', right: 20, bottom: 84, zIndex: 999,
          width: 52, height: 52, borderRadius: '50%',
          background: '#c4761b', color: 'white',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#a8543a')}
        onMouseLeave={e => (e.currentTarget.style.background = '#c4761b')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 1004,
      width: 380, maxWidth: 'calc(100vw - 40px)',
      height: 560, maxHeight: 'calc(100vh - 40px)',
      background: 'var(--card-bg)', color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', background: '#0B1220', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Ask For Help</span>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>Powered by Claude · across Grounded</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {history.length > 0 && (
            <button onClick={reset} title="Reset chat" style={iconBtn}>↻</button>
          )}
          <button onClick={() => setOpen(false)} title="Close" style={iconBtn}>✕</button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#FAFAF9' }}>
        {history.length === 0 && (
          <Intro onPick={send} />
        )}
        {history.map((msg, i) => <Bubble key={i} msg={msg} />)}
        {loading && <LoadingBubble />}
        {error && (
          <div style={{ padding: '10px 12px', margin: '8px 0', background: '#FEE2E2', color: '#991B1B', fontSize: 12, borderRadius: 8 }}>
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={e => { e.preventDefault(); send(input); }}
        style={{ padding: 10, borderTop: '1px solid var(--border-color)', display: 'flex', gap: 6 }}
      >
        <input
          type="text"
          placeholder="Ask about implementing AI in your newsroom…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          maxLength={500}
          style={{
            flex: 1, padding: '8px 12px', fontSize: 13,
            border: '1px solid var(--border-color)', borderRadius: 6,
            background: 'white', color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '0 14px', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            border: 'none', borderRadius: 6, background: 'var(--accent)', color: 'white',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >{loading ? '…' : 'Ask'}</button>
      </form>
    </div>
  );
}

// ── Bubbles ─────────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      margin: '6px 0',
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '9px 12px', borderRadius: 12,
        background: isUser ? 'var(--accent)' : 'white',
        color: isUser ? 'white' : 'var(--text-primary)',
        border: isUser ? 'none' : '1px solid var(--border-color)',
        fontSize: 13, lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {isUser ? msg.content : renderAssistantText(msg.content)}
        {msg.citations?.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E7EB', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {msg.citations.map(c => <CitationChip key={`${c.kind}:${c.id}`} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// Strip bracketed citation markers like [tool:123] from rendered text — they're
// redundant once the citation chip row is shown below the bubble.
function renderAssistantText(text) {
  return (text || '')
    .replace(/\[(lawsuit|regulation|tool|ethics|monetisation|datasecurity):[\w-]{1,64}\]/gi, '')
    .replace(/\s+([.,;:])/g, '$1').trim();
}

// Per-kind citation chip: lawsuits/regulations link to their tracker page;
// resource items (tool/ethics/monetisation/data-security) link out to the source.
const CITE_STYLE = {
  lawsuit:      { icon: '⚖ ', bg: '#EEF2FF', fg: '#4F46E5' },
  regulation:   { icon: '📜 ', bg: '#D1FAE5', fg: '#065F46' },
  tool:         { icon: '🛠 ', bg: '#FEF3C7', fg: '#92400E' },
  ethics:       { icon: '🧭 ', bg: '#F3E8FF', fg: '#6B21A8' },
  monetisation: { icon: '💰 ', bg: '#CCFBF1', fg: '#0F766E' },
  datasecurity: { icon: '🔒 ', bg: '#E2E8F0', fg: '#334155' },
};
function CitationChip({ c }) {
  const s = CITE_STYLE[c.kind] || CITE_STYLE.tool;
  const chipStyle = {
    fontSize: 10, padding: '2px 8px', borderRadius: 10,
    background: s.bg, color: s.fg, textDecoration: 'none', fontWeight: 600,
  };
  if (c.kind === 'lawsuit' || c.kind === 'regulation') {
    return (
      <Link to={c.kind === 'lawsuit' ? `/legal/lawsuits/${c.id}` : `/legal/regulations/${c.id}`} style={chipStyle}>
        {s.icon}{c.name}
      </Link>
    );
  }
  if (!c.url) return <span style={chipStyle}>{s.icon}{c.name}</span>;
  return <a href={c.url} target="_blank" rel="noopener noreferrer" style={chipStyle}>{s.icon}{c.name}</a>;
}

function LoadingBubble() {
  return (
    <div style={{ display: 'flex', margin: '6px 0' }}>
      <div style={{
        padding: '9px 12px', borderRadius: 12,
        background: 'white', border: '1px solid var(--border-color)',
        fontSize: 13, color: 'var(--text-secondary)',
      }}>
        Thinking…
      </div>
    </div>
  );
}

function Intro({ onPick }) {
  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.5 }}>
        I help newsrooms put AI to work — across Grounded's Nodes and tools, plus our resources on AI law, ethics, monetisation and data security. Ask me anything about implementing AI in your newsroom.
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Try</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => onPick(s)} style={{
            textAlign: 'left', padding: '8px 10px', fontSize: 12,
            border: '1px solid var(--border-color)', borderRadius: 8,
            background: 'white', color: 'var(--text-primary)', cursor: 'pointer',
          }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const iconBtn = {
  background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer',
  fontSize: 14, padding: '4px 8px', borderRadius: 4,
};
