// Newsroom Profile editor — the single profile every tool + agent reads to
// ground its output. Admin-managed.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const FIELDS = [
  ['about', 'About the newsroom', 'A short description of who you are.'],
  ['beats', 'Beats covered', 'The topics / areas you report on.'],
  ['audience', 'Audience', 'Who your audience is.'],
  ['strengths', 'Strengths', 'What you’re known for / do best.'],
  ['style_notes', 'House style', 'Tone, formatting, dos and don’ts.'],
  ['trusted_sources', 'Trusted sources', 'Your go-to sources.'],
];

export default function NewsroomProfile() {
  const [p, setP] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { apiFetch('/newsroom-profile').then((r) => setP(r || {})).catch(() => {}); }, []);

  async function save() {
    setBusy(true); setSaved(false);
    try { const r = await apiFetch('/newsroom-profile', { method: 'PUT', body: JSON.stringify(p) }); setP(r); setSaved(true); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Newsroom Profile" subtitle="One profile that grounds every tool and agent — Fundraiser, Audience, Verifier, Copywriter and the rest all read it." />
      <div className="card" style={{ padding: 20, maxWidth: 760 }}>
        {FIELDS.map(([k, label, hint]) => (
          <label key={k} style={{ display: 'block', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{hint}</div>
            <textarea rows={k === 'about' ? 3 : 2} value={p[k] || ''} onChange={(e) => setP((v) => ({ ...v, [k]: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13 }} />
          </label>
        ))}
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
        {saved && <span style={{ marginLeft: 10, color: '#16a34a', fontSize: 13 }}>Saved ✓</span>}
      </div>
    </div>
  );
}
