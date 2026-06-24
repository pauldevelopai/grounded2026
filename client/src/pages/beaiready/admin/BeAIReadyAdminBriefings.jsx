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
    blurb: 'A short daily read on the biggest AI developments. Drawn from your curated newsletters (the AI ones ingested from Gmail’s Forums tab); if none have come in, it falls back to a live web search. Set the source below.',
    path: '/public/ai-news-today',
  },
  {
    which: 'governance', kicker: 'AI Law',
    blurb: 'AI law, regulation and enforcement — written directly from your own Law & Regulation tracker, so the team has full oversight of what it can say. The same briefing that leads the tracker.',
    path: '/public/governance-today',
  },
];

const SOURCE_LABEL = {
  newsletters: 'your curated newsletters',
  websearch: 'a live web search',
  tracker: 'your Law & Regulation tracker',
};

export default function BeAIReadyAdminBriefings() {
  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Briefings</h1>
      <p style={{ color: '#6b6359', marginBottom: 18, maxWidth: '66ch' }}>
        The two daily briefings at the top of the Be AI Ready home page. Edit either by hand and save, or
        regenerate it from source. They also refresh automatically each morning.
      </p>
      <div style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
        {BRIEFINGS.map((b) => <BriefingCard key={b.which} {...b} />)}
      </div>
      <SourcesSettings />
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
      <p style={{ fontSize: 12.5, color: '#6b6359', margin: '4px 0 8px', maxWidth: '64ch' }}>{blurb}</p>
      {data?.source && (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#c75b39', marginBottom: 12 }}>
          ● This briefing was written from {SOURCE_LABEL[data.source] || data.source}
        </div>
      )}

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

// Source oversight — see and tune where each briefing draws from, no deploy needed.
function SourcesSettings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { apiFetch('/briefings/settings').then(setS).catch((e) => setErr(e.message)); }, []);
  const setNews = (patch) => setS((x) => ({ ...x, ai_news: { ...x.ai_news, ...patch } }));
  const setLaw = (patch) => setS((x) => ({ ...x, ai_law: { ...x.ai_law, ...patch } }));

  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try { const next = await apiFetch('/briefings/settings', { method: 'PUT', body: JSON.stringify(s) }); setS(next); setMsg('Saved — applies on the next regenerate / morning run.'); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!s) return null;
  return (
    <div style={{ ...card, background: '#faf8f5' }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Sources &amp; settings</h2>
      <p style={{ fontSize: 12.5, color: '#6b6359', margin: '0 0 14px', maxWidth: '66ch' }}>
        Where each briefing draws from, and the dials that shape it. Changes apply the next time a briefing is regenerated (here or at the morning run).
      </p>
      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      <div style={{ marginBottom: 16 }}>
        <div style={kickerStyle}>AI News — source</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
          {[['auto', 'Newsletters, web fallback'], ['newsletters', 'Newsletters only'], ['websearch', 'Web search only']].map(([v, label]) => (
            <button key={v} onClick={() => setNews({ source: v })}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e4dcd2', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: s.ai_news.source === v ? '#c75b39' : '#fff', color: s.ai_news.source === v ? '#fff' : '#6b6359' }}>{label}</button>
          ))}
          <label style={{ fontSize: 12.5, color: '#6b6359', marginLeft: 6 }}>days of newsletters
            <input type="number" min="1" max="14" value={s.ai_news.days} onChange={(e) => setNews({ days: e.target.value })} style={{ ...numInp, marginLeft: 6 }} />
          </label>
        </div>
        <label style={{ fontSize: 12, color: '#8a8076' }}>What the web search looks for (when used)</label>
        <textarea value={s.ai_news.web_focus} onChange={(e) => setNews({ web_focus: e.target.value })} rows={2}
          style={{ ...textarea, fontSize: 13, marginTop: 4 }} />
      </div>

      <div style={{ borderTop: '1px solid #efe7dd', paddingTop: 14, marginBottom: 14 }}>
        <div style={kickerStyle}>AI Law — source</div>
        <p style={{ fontSize: 12.5, color: '#6b6359', margin: '8px 0' }}>
          Written <strong>directly from your Law &amp; Regulation tracker</strong> — only what your team has tracked. Keep the tracker current and the briefing stays current.
          <label style={{ display: 'block', marginTop: 8 }}>Number of most-recent tracked items to brief from
            <input type="number" min="3" max="20" value={s.ai_law.item_count} onChange={(e) => setLaw({ item_count: e.target.value })} style={{ ...numInp, marginLeft: 6 }} />
          </label>
        </p>
      </div>

      <button style={btnSolid} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const kickerStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' };
const numInp = { width: 60, padding: '5px 8px', border: '1px solid #e4dcd2', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' };
const banner = (bg, fg) => ({ background: bg, color: fg, padding: '8px 12px', borderRadius: 8, margin: '0 0 10px', fontSize: 12.5 });
const textarea = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid #e4dcd2', borderRadius: 10, fontSize: 14, lineHeight: 1.55, fontFamily: 'inherit', resize: 'vertical', color: '#1c1b1a' };
const btnSolid = { padding: '8px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '8px 16px', background: 'transparent', color: '#1c1b1a', border: '1px solid #d8cfc4', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
