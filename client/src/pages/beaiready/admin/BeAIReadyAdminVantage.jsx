// BeAIReadyAdminVantage — embeds Vantage (the standalone AI-assisted security-
// camera incident system) inline inside the BE AI READY admin, so it lives at
// beaiready.developai.co.za/admin/vantage without leaving the admin shell.
//
// Vantage runs as its own app on its own host; here we render it in an iframe
// pointed at its deployed URL (admin-editable, non-secret). Honest empty state
// until a URL is set — no blank frame. Vantage keeps its own login inside the
// frame. There is also an "open in new tab" fallback.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

export default function BeAIReadyAdminVantage() {
  const [url, setUrl] = useState(null);   // null = loading
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => apiFetch('/beaiready/admin/vantage')
    .then((d) => { setUrl(d.url || ''); setDraft(d.url || ''); setEditing(!d.url); })
    .catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setErr(''); setMsg(''); setSaving(true);
    try {
      const d = await apiFetch('/beaiready/admin/vantage', { method: 'PUT', body: JSON.stringify({ url: draft }) });
      setUrl(d.url || ''); setDraft(d.url || '');
      setMsg(d.url ? 'Vantage URL saved.' : 'Vantage URL cleared.');
      setEditing(!d.url);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (url === null) return <p style={{ color: '#8a8076' }}>Loading…</p>;

  // ── Config / empty state: shown until a URL is set, or on "Change URL" ──
  if (editing || !url) {
    return (
      <div style={{ maxWidth: 820 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Vantage</h1>
        <p style={{ color: '#6b6359', marginBottom: 18, maxWidth: '64ch' }}>
          Vantage is the standalone AI-assisted security-camera incident system (plate recognition,
          cross-camera correlation, threat detection). It runs as its own application; set its deployed
          address below to embed it on this page.
        </p>

        {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
        {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

        <div style={kicker}>Deployed URL</div>
        <div style={card}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              type="url" inputMode="url"
              placeholder="https://vantage.developai.co.za"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ ...inp, flex: 1, minWidth: 260 }}
            />
            <button onClick={save} disabled={saving || draft.trim() === (url || '')} style={{ ...btn, opacity: saving || draft.trim() === (url || '') ? 0.55 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {url && (
              <button onClick={() => { setEditing(false); setDraft(url); setErr(''); setMsg(''); }} style={btnGhost}>Cancel</button>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: '#a89e92', margin: '10px 0 0' }}>
            Must be a full <code>http://</code> or <code>https://</code> URL. Vantage is embedded here and
            keeps its own login. Leave blank and save to remove it. A <code>VANTAGE_URL</code> env var on the
            server overrides this value.
          </p>
        </div>
      </div>
    );
  }

  // ── Embedded view: Vantage rendered inline in the admin shell ──────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '84vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Vantage</h1>
        <span style={{ fontSize: 12.5, color: '#8a8076', wordBreak: 'break-all' }}>{url}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={btnGhost}>Open in new tab ↗</a>
          <button onClick={() => setEditing(true)} style={btnGhost}>Change URL</button>
        </div>
      </div>
      <iframe
        src={url}
        title="Vantage"
        style={{ flex: 1, width: '100%', border: '1px solid #eee5da', borderRadius: 12, background: '#fff' }}
        allow="camera; microphone; fullscreen; clipboard-write"
      />
    </div>
  );
}

const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', margin: '4px 0 10px' };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '7px 12px', background: '#fff', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' };
