// BeAIReadyAdminModels — Models page of the BE AI READY admin. Configure which
// model/provider powers each function, and add API keys / a local endpoint.
// Keys are write-only (saved server-side, never shown back). Wiring status is
// honest: Visibility already reads this config; the others are marked "saved,
// applied as functions are migrated".
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const WIRED = new Set(['visibility_models']); // functions that actually read the config today

export default function BeAIReadyAdminModels() {
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState({});
  const [keyDraft, setKeyDraft] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => apiFetch('/beaiready/admin/settings').then((d) => { setData(d); setCfg(d.config); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const saveKey = async (provider) => {
    const value = keyDraft[provider];
    if (!value) return;
    setErr(''); setMsg('');
    try {
      await apiFetch('/beaiready/admin/provider-key', { method: 'PUT', body: JSON.stringify({ provider, value }) });
      setKeyDraft({ ...keyDraft, [provider]: '' }); setMsg(`${provider} saved.`); await load();
    } catch (e) { setErr(e.message); }
  };

  const saveConfig = async () => {
    setErr(''); setMsg('');
    try { await apiFetch('/beaiready/admin/settings', { method: 'PUT', body: JSON.stringify({ config: cfg }) }); setMsg('Model config saved.'); }
    catch (e) { setErr(e.message); }
  };

  if (!data) return <p style={{ color: '#8a8076' }}>Loading…</p>;
  const configuredIds = data.providers.filter((p) => p.configured).map((p) => p.id);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Models</h1>
      <p style={{ color: '#6b6359', marginBottom: 18, maxWidth: '64ch' }}>
        Pick which AI powers each function, and add the API keys or a local endpoint. Keys are stored
        securely server-side and never shown again.
      </p>
      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      {/* Providers */}
      <div style={kicker}>Providers</div>
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {data.providers.map((p) => (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontWeight: 700 }}>{p.label}</span>
                <span style={{ fontSize: 12, color: '#8a8076', marginLeft: 8 }}>{p.models.join(', ')}</span>
              </div>
              <span style={{ ...pill, background: p.configured ? '#dcfce7' : '#f1f0ec', color: p.configured ? '#166534' : '#a89e92' }}>
                {p.configured ? `Configured${p.source === 'env' ? ' · .env' : ' · saved'}` : 'Not configured'}
              </span>
            </div>
            {p.source !== 'env' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input type="password" placeholder={p.id === 'ollama' ? 'Ollama URL (http://localhost:11434)' : `${p.label} API key`}
                  value={keyDraft[p.id] || ''} onChange={(e) => setKeyDraft({ ...keyDraft, [p.id]: e.target.value })} style={{ ...inp, flex: 1 }} />
                <button onClick={() => saveKey(p.id)} style={btn}>Save</button>
              </div>
            )}
            {p.source === 'env' && <p style={{ fontSize: 12, color: '#a89e92', margin: '8px 0 0' }}>Key comes from the server .env — change it there.</p>}
          </div>
        ))}
      </div>

      {/* Per-function model choice */}
      <div style={kicker}>Function → model</div>
      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        {data.functions.map((f) => (
          <div key={f.key} style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {f.label}
              {!WIRED.has(f.key) && <span style={{ ...pill, background: '#fef3c7', color: '#92400e', marginLeft: 8 }}>config saved · wiring in progress</span>}
            </div>
            {f.multi ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {data.providers.map((p) => {
                  const on = (cfg[f.key] || []).includes(p.id);
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, opacity: p.configured ? 1 : 0.5 }}>
                      <input type="checkbox" checked={on} disabled={!p.configured}
                        onChange={(e) => { const cur = new Set(cfg[f.key] || []); e.target.checked ? cur.add(p.id) : cur.delete(p.id); setCfg({ ...cfg, [f.key]: [...cur] }); }} />
                      {p.label}{!p.configured && ' (add key)'}
                    </label>
                  );
                })}
              </div>
            ) : (
              <select value={cfg[f.key] || ''} onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })} style={{ ...inp, maxWidth: 280 }}>
                {data.providers.map((p) => <option key={p.id} value={p.id} disabled={!p.configured}>{p.label}{!p.configured ? ' (add key)' : ''}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      <button onClick={saveConfig} style={btn}>Save model config</button>

      <p style={{ fontSize: 12.5, color: '#a89e92', marginTop: 18 }}>
        Configured now: {configuredIds.join(', ') || 'none'}. Add OpenAI + Gemini keys above to make the
        Visibility scan query ChatGPT and Gemini alongside Claude.
      </p>
    </div>
  );
}

const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', margin: '4px 0 10px' };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const pill = { fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
