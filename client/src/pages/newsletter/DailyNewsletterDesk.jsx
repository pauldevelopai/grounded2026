// DailyNewsletterDesk — the review desk for The Daily System (governance/cyber/
// legal newsletter). Self-contained: its own state + API calls, rendered at the
// top of the Newsletter page. Paul reviews, sharpens the "what it means" lines,
// refreshes the Develop AI block, copies into Substack, and marks as sent.
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../../hooks/useApi.js';

const CAT_COLOR = {
  lawsuit: '#EC4899', fine: '#EC4899', regulation: '#6366F1', enforcement: '#6366F1',
  policy: '#6366F1', breach: '#F59E0B', cyberattack: '#F59E0B', scam: '#F59E0B',
};

const STATUS_BANNER = {
  draft:  { icon: '✅', text: 'Draft ready — review, sharpen, and paste into Substack.', bg: '#064e3b', fg: '#d1fae5' },
  sent:   { icon: '📤', text: 'Sent — saved to the voice corpus.', bg: '#1e3a5f', fg: '#dbeafe' },
  quiet:  { icon: '🔹', text: 'Quiet day — no qualifying stories in the last 24h.', bg: '#3f3f46', fg: '#e4e4e7' },
  failed: { icon: '⚠️', text: 'Pipeline failed — see the error below.', bg: '#7f1d1d', fg: '#fee2e2' },
  none:   { icon: '⚠️', text: 'No issue generated yet for today. Run synthesis, or check the server.', bg: '#7f1d1d', fg: '#fee2e2' },
};

function todayISO() { return new Date().toISOString().split('T')[0]; }

export default function DailyNewsletterDesk() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [news, setNews] = useState('');
  const [develop, setDevelop] = useState('');
  const [saving, setSaving] = useState('');       // '', 'saving', 'saved'
  const [busy, setBusy] = useState('');            // 'regenerate' | 'copy' | 'send'
  const [copied, setCopied] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    loadedRef.current = false;
    try {
      const r = await apiFetch(`/newsletter/daily/${d}`);
      setData(r);
      setSubject(r.subject || '');
      setNews(r.newsMarkdown || '');
      setDevelop(r.developBlock || '');
    } catch (e) {
      setData({ date: d, exists: false, status: 'none', error: e.message });
    } finally {
      setLoading(false);
      // Allow autosave only after the fields are populated from the server.
      setTimeout(() => { loadedRef.current = true; }, 0);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // Debounced autosave whenever an editable field changes post-load.
  useEffect(() => {
    if (!loadedRef.current || !data?.exists) return;
    setSaving('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch(`/newsletter/daily/${date}`, {
          method: 'PATCH',
          body: JSON.stringify({ subject, newsMarkdown: news, developBlock: develop }),
        });
        setSaving('saved');
        setTimeout(() => setSaving(''), 1500);
      } catch { setSaving(''); }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [subject, news, develop]); // eslint-disable-line react-hooks/exhaustive-deps

  async function flushSave() {
    clearTimeout(saveTimer.current);
    if (!data?.exists) return;
    await apiFetch(`/newsletter/daily/${date}`, {
      method: 'PATCH',
      body: JSON.stringify({ subject, newsMarkdown: news, developBlock: develop }),
    }).catch(() => {});
  }

  async function copyForSubstack() {
    setBusy('copy');
    try {
      await flushSave();
      const fresh = await apiFetch(`/newsletter/daily/${date}`);
      const html = fresh.copyHtml || '';
      const plain = html.replace(/<[^>]+>/g, '');
      try {
        await navigator.clipboard.write([new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        })]);
      } catch {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } finally { setBusy(''); }
  }

  async function downloadImage() {
    const res = await fetch(`/api/newsletter/daily/${date}/image`, { credentials: 'include' });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${date}-header.png`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function regenerate() {
    if (!window.confirm('Regenerate today\'s draft from scratch? This overwrites the current draft (your edits included).')) return;
    setBusy('regenerate');
    try {
      await apiFetch(`/newsletter/daily/${date}/regenerate`, { method: 'POST', body: '{}', timeout: 180000 });
      await load(date);
    } catch (e) { window.alert(`Regeneration failed: ${e.message}`); }
    finally { setBusy(''); }
  }

  async function markSent() {
    if (!window.confirm('Mark as sent and save this issue to the voice corpus?')) return;
    setBusy('send');
    try {
      await apiFetch(`/newsletter/daily/${date}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({ subject, newsMarkdown: news, developBlock: develop }),
      });
      await load(date);
    } catch (e) { window.alert(`Failed: ${e.message}`); }
    finally { setBusy(''); }
  }

  const status = data?.status || 'none';
  const banner = STATUS_BANNER[status] || STATUS_BANNER.none;
  const card = { background: 'var(--surface, #1a1a1a)', border: '1px solid var(--border, #333)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 };
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border, #333)', background: 'var(--bg, #111)', color: 'var(--text, #eee)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
  const btn = (variant) => ({ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border, #333)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: variant === 'primary' ? '#6366F1' : 'var(--surface-2, #222)', color: variant === 'primary' ? '#fff' : 'var(--text, #eee)' });

  return (
    <div style={{ ...card, borderColor: '#6366F1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Today’s Newsletter</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The Daily System · cyber · governance · legal</span>
        </div>
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
          style={{ ...inputStyle, width: 'auto' }} />
      </div>

      {/* Status banner — never silent */}
      <div style={{ background: banner.bg, color: banner.fg, borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
        {banner.icon} {banner.text}
        {status === 'draft' && data?.updatedAt && (
          <span style={{ opacity: 0.8 }}> — updated {new Date(data.updatedAt).toLocaleString('en-GB')}</span>
        )}
        {data?.imageError && status === 'draft' && (
          <div style={{ marginTop: 4, opacity: 0.85 }}>Image note: {data.imageError}</div>
        )}
        {(status === 'failed' || status === 'none') && data?.error && (
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12, opacity: 0.9 }}>{data.error}</pre>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
      ) : !data?.exists ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Nothing here yet. Run <code>npm run newsletter:synthesis</code> on the server, then reload.
          <div style={{ marginTop: 10 }}>
            <button style={btn('primary')} disabled={busy === 'regenerate'} onClick={regenerate}>
              {busy === 'regenerate' ? 'Generating…' : 'Generate now'}
            </button>
          </div>
        </div>
      ) : status === 'quiet' ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          No qualifying stories. Nothing to send today.
          <div style={{ marginTop: 10 }}>
            <button style={btn()} disabled={busy === 'regenerate'} onClick={regenerate}>
              {busy === 'regenerate' ? 'Re-checking…' : 'Re-run synthesis'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16 }}>
          {/* ── Left: the editable issue ── */}
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Subject line <span style={{ color: subject.length > 60 ? '#f87171' : 'var(--text-secondary)' }}>({subject.length}/60)</span></label>
              <input style={inputStyle} value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={label}>The issue — sharpen the “what it means” lines</label>
              <textarea style={{ ...inputStyle, minHeight: 340, lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
                value={news} onChange={(e) => setNews(e.target.value)} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={label}>What’s happening at Develop AI (your block — carried forward; never AI-written)</label>
              <textarea style={{ ...inputStyle, minHeight: 90, lineHeight: 1.5 }}
                value={develop} onChange={(e) => setDevelop(e.target.value)}
                placeholder="A sentence on current work, or a short newsroom/company showcase paragraph…" />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={btn('primary')} disabled={busy === 'copy'} onClick={copyForSubstack}>
                {busy === 'copy' ? 'Preparing…' : copied ? '✓ Copied' : 'Copy for Substack'}
              </button>
              <button style={btn()} disabled={busy === 'send' || status === 'sent'} onClick={markSent}>
                {status === 'sent' ? 'Sent ✓' : busy === 'send' ? 'Saving…' : 'Mark as sent → save to corpus'}
              </button>
              <button style={btn()} disabled={busy === 'regenerate'} onClick={regenerate}>
                {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 48 }}>
                {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved ✓' : ''}
              </span>
            </div>
          </div>

          {/* ── Right: image + sources ── */}
          <div>
            <label style={label}>Header image</label>
            {data.hasImage ? (
              <div style={{ marginBottom: 8 }}>
                <img src={`/api/newsletter/daily/${date}/image`} alt="header" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border,#333)' }} />
                <button style={{ ...btn(), marginTop: 8, width: '100%' }} onClick={downloadImage}>Download image</button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, padding: '10px 0' }}>
                No image{data.imageError ? ` (${data.imageError})` : ''}. The issue ships without one.
              </div>
            )}

            <label style={{ ...label, marginTop: 8 }}>Sources ({data.sources?.length || 0}) — click to verify</label>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data.sources || []).map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', padding: '7px 9px', borderRadius: 6, background: 'var(--bg,#111)', border: '1px solid var(--border,#333)', fontSize: 12, color: 'var(--text,#ddd)', textDecoration: 'none' }}>
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: CAT_COLOR[s.category] || '#555', color: '#fff', marginRight: 6 }}>{s.category}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>sev {s.severity} · afr {s.africa_relevance}</span>
                  <div style={{ marginTop: 2 }}>{s.title || s.url}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
