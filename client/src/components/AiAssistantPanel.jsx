import { useState, useRef, useEffect } from 'react';
import { useAiAssistant } from '../context/AiAssistantContext.jsx';

// "Ask For Help" — the admin-side AI assistant. Visually identical to the
// public site's Ask For Help bubble (terracotta chat button bottom-right,
// stacked above the Feedback bubble) so the assistant looks the same on every
// surface. It keeps its richer /ai-assistant/chat backend (CRM / programmes /
// page context) via AiAssistantContext.

const SUGGESTIONS = [
  'What AI tools are available?',
  'How do I generate an AI policy?',
  'What should I focus on today?',
  'Help me plan a new AI training course',
];

function renderContent(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <div key={i} style={{ fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }}>{line.slice(3)}</div>;
    if (line.startsWith('**') && line.endsWith('**')) return <div key={i} style={{ fontWeight: 600, fontSize: 13, marginTop: 6 }}>{line.slice(2, -2)}</div>;
    if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 10, marginBottom: 2, fontSize: 13 }}><span style={{ color: '#c4761b' }}>•</span> {line.slice(2)}</div>;
    if (/^\d+\.\s/.test(line)) return <div key={i} style={{ paddingLeft: 10, marginBottom: 2, fontSize: 13 }}>{line}</div>;
    if (line.trim() === '') return <div key={i} style={{ height: 4 }} />;
    return <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{line}</div>;
  });
}

export default function AiAssistantPanel() {
  const { isOpen, togglePanel, messages, sendMessage, sending } = useAiAssistant();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  }

  // Collapsed: round terracotta chat-bubble button. Stacks directly above the
  // Feedback bubble (which owns the corner at bottom:20). Identical to the
  // public Ask For Help bubble + the shared chrome.js bubble.
  if (!isOpen) {
    return (
      <button
        onClick={togglePanel}
        aria-label="Open Ask For Help"
        title="Ask For Help"
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
          <span style={{ fontSize: 10, color: '#94A3B8' }}>Powered by Claude</span>
        </div>
        <button onClick={togglePanel} title="Close" style={{
          background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer',
          fontSize: 14, padding: '4px 8px', borderRadius: 4,
        }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#FAFAF9' }}>
        {messages.length === 0 && (
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.5 }}>
              I can help with your work across the CRM, programmes, curriculum, marketing, fundraising, and more. Try asking:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SUGGESTIONS.map(q => (
                <button key={q} onClick={() => sendMessage(q)} style={{
                  textAlign: 'left', padding: '8px 10px', fontSize: 12,
                  border: '1px solid var(--border-color)', borderRadius: 8,
                  background: 'white', color: 'var(--text-primary)', cursor: 'pointer',
                }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', margin: '6px 0' }}>
            <div style={{
              maxWidth: '85%', padding: '9px 12px', borderRadius: 12,
              background: msg.role === 'user' ? '#c4761b' : 'white',
              color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
              fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.role === 'user' ? msg.content : renderContent(msg.content)}
            </div>
          </div>
        ))}

        {sending && (
          <div style={{ display: 'flex', margin: '6px 0' }}>
            <div style={{
              padding: '9px 12px', borderRadius: 12, background: 'white',
              border: '1px solid var(--border-color)', fontSize: 13, color: 'var(--text-secondary)',
            }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: 10, borderTop: '1px solid var(--border-color)', display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask for help…"
          disabled={sending}
          style={{
            flex: 1, padding: '8px 12px', fontSize: 13,
            border: '1px solid var(--border-color)', borderRadius: 6,
            background: 'white', color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            padding: '0 14px', fontSize: 13, fontWeight: 600, cursor: sending ? 'default' : 'pointer',
            border: 'none', borderRadius: 6, background: '#c4761b', color: 'white',
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >{sending ? '…' : 'Send'}</button>
      </form>
    </div>
  );
}
