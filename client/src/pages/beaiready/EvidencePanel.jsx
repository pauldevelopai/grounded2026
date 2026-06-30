// EvidencePanel — a small reusable evidence-trail control (manual Component 6).
// Attach files (reusing the uploads pipeline) or links to a governance entity
// (a policy / control / review / system) as proof the control is real. Collapsible
// so it stays out of the way until needed. Tenant-scoped by the API.
import { useEffect, useState } from 'react';
import { apiFetch, getActiveNewsroomId } from '../../hooks/useApi.js';

export default function EvidencePanel({ entityType, entityId }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => apiFetch(`/beaiready/governance/evidence?entity_type=${entityType}&entity_id=${entityId}`).then(setItems).catch(() => setItems([]));
  useEffect(() => { if (open && items === null) load(); }, [open]);

  const addLink = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/governance/evidence/link', { method: 'POST', body: JSON.stringify({ entity_type: entityType, entity_id: entityId, url, label }) });
      setUrl(''); setLabel(''); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('entity_type', entityType);   // fields BEFORE file (multer reads req.body in destination)
      fd.append('entity_id', entityId);
      if (label) fd.append('label', label);
      fd.append('file', file);
      const headers = {};
      const nr = getActiveNewsroomId();
      if (nr) headers['X-Newsroom-Id'] = nr;
      const res = await fetch('/api/beaiready/governance/evidence', { method: 'POST', credentials: 'include', headers, body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload failed'); }
      setLabel(''); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const del = async (id) => { try { await apiFetch(`/beaiready/governance/evidence/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setErr(e.message); } };

  const count = items?.length ?? 0;
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen((o) => !o)} style={toggle}>{open ? '▾' : '▸'} Evidence{count ? ` (${count})` : ''}</button>
      {open && (
        <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid #f0e2d4' }}>
          {err && <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 6 }}>{err}</div>}
          {items === null ? <p style={muted}>Loading…</p> : items.length === 0 ? <p style={muted}>No evidence yet — upload a file or paste a link (the signed policy, an approval record, a log).</p> : (
            <ul style={{ margin: '0 0 6px', paddingLeft: 16, fontSize: 12.5 }}>
              {items.map((it) => (
                <li key={it.id} style={{ marginBottom: 3 }}>
                  {it.kind === 'link'
                    ? <a href={it.url} target="_blank" rel="noreferrer">{it.label || it.url}</a>
                    : <a href={`/api/beaiready/governance/evidence/${it.id}/download`} target="_blank" rel="noreferrer">{it.label || it.original_name}</a>}
                  <span style={{ color: '#a8a29e' }}> · {it.kind}</span>
                  <button onClick={() => del(it.id)} style={delBtn} title="Remove">×</button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={miniInp} placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <input style={{ ...miniInp, minWidth: 180 }} placeholder="Paste a link…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button onClick={addLink} disabled={busy} style={miniBtn}>Add link</button>
            <label style={{ ...miniBtn, display: 'inline-block' }}>{busy ? 'Uploading…' : 'Upload file'}<input type="file" style={{ display: 'none' }} onChange={(e) => upload(e.target.files[0])} /></label>
          </div>
        </div>
      )}
    </div>
  );
}

const toggle = { background: 'none', border: 'none', color: '#8a6d3b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 };
const muted = { color: '#8a8076', fontSize: 12.5, margin: '4px 0' };
const miniInp = { padding: '5px 8px', border: '1px solid #e4dcd2', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' };
const miniBtn = { padding: '5px 10px', border: '1px solid #e4dcd2', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const delBtn = { background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 14, marginLeft: 6, lineHeight: 1 };
