import { useState, useEffect } from 'react';
import { apiFetch } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';

// The third floating bubble: questions WE ask the user. Where FeedbackBubble is
// inbound (user tells us something), this is outbound — short multiple-choice
// questions, one at a time, that build a database about the newsrooms and people
// using Grounded. Only active for logged-in users (every answer ties to a real
// team_member). Sits above the feedback bubble (which owns the corner at bottom:20).

export default function QuestionBubble() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [justAnswered, setJustAnswered] = useState(false);

  async function loadNext() {
    setLoading(true);
    setJustAnswered(false);
    try {
      const data = await apiFetch('/user-questions/next');
      setQuestion(data?.question || null);
    } catch {
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  }

  // Fetch the first pending question once we know there's a logged-in user.
  useEffect(() => {
    if (user) loadNext();
  }, [user]);

  if (!user) return null;

  async function answer(choice) {
    if (!question || sending) return;
    setSending(true);
    try {
      await apiFetch(`/user-questions/${question.id}/answer`, {
        method: 'POST',
        body: JSON.stringify({ choice }),
      });
      setJustAnswered(true);
      // Chain to the next question after a brief thank-you.
      setTimeout(loadNext, 1200);
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  }

  const hasPending = !!question;

  return (
    <>
      {/* Slate button (distinct from the terracotta feedback bubble) so "we're
          asking you" reads differently from "send feedback". Third in the stack:
          Feedback owns bottom:20, Ask For Help (PublicChatbot) owns bottom:84,
          so this sits at bottom:148. */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 148, right: 20, width: 52, height: 52,
          borderRadius: '50%', background: '#3a6b7d', color: 'white', border: 'none',
          cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#2c5260')}
        onMouseLeave={e => (e.currentTarget.style.background = '#3a6b7d')}
        title="A quick question from the Grounded team"
        aria-label="Answer a question from the Grounded team"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        {/* Pulsing dot when there's an unanswered question waiting. */}
        {hasPending && !open && (
          <span style={{
            position: 'absolute', top: 2, right: 2, width: 12, height: 12,
            borderRadius: '50%', background: '#e0533a', border: '2px solid white',
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 208, right: 20, width: 330,
          background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 1003, padding: 20, border: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>Quick question</h4>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-secondary)' }}>x</button>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 0' }}>Loading…</div>
          ) : justAnswered ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--success)' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>Thanks!</div>
              <div style={{ fontSize: 13 }}>That helps us improve Grounded.</div>
            </div>
          ) : !question ? (
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
              Nothing right now — thanks for helping us improve Grounded.
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>{question.prompt}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {question.options.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    disabled={sending}
                    onClick={() => answer(opt)}
                    style={{
                      textAlign: 'left', padding: '9px 12px', borderRadius: 8, fontSize: 13,
                      border: '1px solid var(--border-color)', background: 'white',
                      cursor: sending ? 'default' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!sending) e.currentTarget.style.background = 'var(--bg-secondary, #f4f4f4)'; }}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
