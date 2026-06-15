// BeAIReadyAdminPrompts — the curation queue (admin/trainer). Reviews user
// feedback (ratings, comments, suggested edits) and promotes a suggested edit into
// a new curated prompt (source=user_promoted, pending — proven only after the
// validation script runs it) or dismisses it. Admin-gated by route + backend.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

export default function BeAIReadyAdminPrompts() {
  const [queue, setQueue] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => apiFetch('/admin/feedback?status=new').then(setQueue).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setErr(''); setMsg('');
    try {
      const r = await apiFetch(`/admin/feedback/${id}/${action}`, { method: 'POST' });
      setMsg(action === 'promote' ? `Promoted to a new pending prompt: “${r.promoted?.title || ''}”` : 'Dismissed.');
      load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Prompt curation</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '64ch' }}>
        Feedback from users across all clients. Promote a strong suggested edit into the curated library
        (it lands as <strong>pending</strong> — it only becomes “proven” after the validation run), or dismiss.
      </p>
      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      {queue == null ? <p style={{ color: '#8a8076' }}>Loading…</p> : queue.length === 0 ? (
        <p style={{ color: '#8a8076' }}>Nothing in the queue — no new feedback.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {queue.map((f) => (
            <div key={f.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div>
                  <strong>{f.prompt_title}</strong>
                  <span style={{ fontSize: 12, color: '#8a8076', marginLeft: 8 }}>
                    {f.user_name || 'a user'}{f.model_key ? ` · on ${f.model_key}` : ''}{f.rating ? ` · ${f.rating}★` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => act(f.id, 'promote')} disabled={!f.suggested_edit} style={{ ...btn, opacity: f.suggested_edit ? 1 : 0.4 }} title={f.suggested_edit ? '' : 'No suggested edit to promote'}>Promote</button>
                  <button onClick={() => act(f.id, 'dismiss')} style={btnGhost}>Dismiss</button>
                </div>
              </div>
              {f.comment && <p style={{ fontSize: 13, color: '#5b5249', margin: '6px 0 0' }}>“{f.comment}”</p>}
              {f.suggested_edit && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Suggested edit</div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace', background: '#faf8f5', border: '1px solid #f0ebe3', borderRadius: 8, padding: 10, margin: 0 }}>{f.suggested_edit}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16 };
const btn = { padding: '7px 14px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '7px 14px', background: '#faf8f5', color: '#6b6359', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
