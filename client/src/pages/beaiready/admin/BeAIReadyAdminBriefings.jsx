// BeAIReadyAdminBriefings — manage the two "Today" briefings that lead the BE AI
// READY home page: AI News (synthesised from the newsletters Gmail ingests) and AI
// Law (the governance digest, also shown on the tracker). For each you can edit the
// text by hand and save it, or regenerate it from source. Everything shown is the
// real cached briefing — an empty state is honest, never a placeholder.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

// AI News on top, AI Law underneath — the same order they appear on the home page.
const BRIEFINGS = [
  {
    which: 'ai-news', kicker: 'AI News',
    blurb: 'A short daily read on the biggest AI developments, written from the newsletters ingested into your Morning Briefing. Regenerate pulls today’s newsletters from Gmail first, then rewrites it.',
    path: '/public/ai-news-today',
  },
  {
    which: 'governance', kicker: 'AI Law',
    blurb: 'The “Today in AI governance” digest — AI law, regulation and enforcement, via a live web search. The same briefing that leads the tracker. Regenerate uses AI credit.',
    path: '/public/governance-today',
  },
];

export default function BeAIReadyAdminBriefings() {
  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Briefings</h1>
      <p style={{ color: '#6b6359', marginBottom: 18, maxWidth: '66ch' }}>
        The two daily briefings at the top of the Be AI Ready home page. Edit either by hand and save, or
        regenerate it from source. They also refresh automatically each morning.
      </p>
      <div style={{ display: 'grid', gap: 16 }}>
        {BRIEFINGS.map((b) => <BriefingCard key={b.which} {...b} />)}
      </div>
    </div>
  );
}

function BriefingCard({ which, kicker, blurb, path }) {
  const [data, setData] = useState(undefined); // undefined = loading, null = none yet
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');         // '' | 'save' | 'refresh'
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () =>
    apiFetch(path).then((v) => { setData(v); setDraft(v?.summary || ''); }).catch(() => setData(null));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    if (!draft.trim()) { setErr('Nothing to save.'); return; }
    setBusy('save'); setErr(''); setMsg('');
    try {
      const v = await apiFetch(`/briefings/${which}`, { method: 'PUT', body: JSON.stringify({ summary: draft.trim() }) });
      setData(v); setDraft(v?.summary || ''); setMsg('Saved.');
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const refresh = async () => {
    setBusy('refresh'); setErr(''); setMsg('');
    try {
      const v = await apiFetch(`/briefings/${which}/refresh`, { method: 'POST' });
      setData(v); setDraft(v?.summary || '');
      setMsg(v?.summary ? 'Regenerated from source.' : (v?.message || 'No source items — briefing is empty.'));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const fmt = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null);
  const dirty = data !== undefined && draft.trim() !== (data?.summary || '').trim();

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={kickerStyle}>{kicker}</span>
        <span style={{ fontSize: 11.5, color: '#a89e92' }}>
          {data === undefined ? 'loading…'
            : data?.generated_at ? <>updated {fmt(data.generated_at)}{data.edited_at ? ' · edited' : ''}</>
            : 'not generated yet'}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: '#6b6359', margin: '4px 0 12px', maxWidth: '64ch' }}>{blurb}</p>

      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={data === undefined ? 'Loading…' : 'No briefing yet — click “Regenerate” to create one from source, or write one here and save.'}
        rows={6}
        style={textarea}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy !== '' || !dirty} style={{ ...btnSolid, opacity: busy !== '' || !dirty ? 0.5 : 1 }}>
          {busy === 'save' ? 'Saving…' : 'Save edits'}
        </button>
        <button onClick={refresh} disabled={busy !== ''} style={{ ...btnGhost, opacity: busy !== '' ? 0.5 : 1 }}>
          {busy === 'refresh' ? 'Regenerating…' : 'Regenerate from source'}
        </button>
        {dirty && <span style={{ fontSize: 11.5, color: '#b45309' }}>unsaved edits</span>}
      </div>

      {data?.headlines?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8076', marginBottom: 6 }}>Sources</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {data.headlines.map((h, i) => (
              <li key={i} style={{ fontSize: 12.5 }}>
                {h.url
                  ? <a href={h.url} target="_blank" rel="noreferrer" style={{ color: '#c75b39' }}>{h.title || h.url}</a>
                  : <span style={{ color: '#6b6359' }}>{h.title}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const kickerStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' };
const banner = (bg, fg) => ({ background: bg, color: fg, padding: '8px 12px', borderRadius: 8, margin: '0 0 10px', fontSize: 12.5 });
const textarea = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #e4dcd2', borderRadius: 10, fontSize: 14, lineHeight: 1.55, fontFamily: 'inherit', resize: 'vertical', color: '#1c1b1a' };
const btnSolid = { padding: '8px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '8px 16px', background: 'transparent', color: '#1c1b1a', border: '1px solid #d8cfc4', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
