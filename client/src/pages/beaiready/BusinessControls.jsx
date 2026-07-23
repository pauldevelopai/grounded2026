// BusinessControls — the Controls Library (/dashboard/governance/controls), a
// Governance-pillar feature. The safeguards the business runs: adopt framework-cited
// starters, get grounded suggestions for a system, link controls to register systems.
// Scoped to the tenant. (manual Component 3)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bizHome } from './bizNav.js';
import { apiFetch } from '../../hooks/useApi.js';
import EvidencePanel from './EvidencePanel.jsx';

const TIER = {
  unacceptable: { bg: '#fee2e2', fg: '#991b1b', label: 'Unacceptable' },
  high: { bg: '#fed7aa', fg: '#9a3412', label: 'High' },
  limited: { bg: '#fef9c3', fg: '#854d0e', label: 'Limited' },
  minimal: { bg: '#dcfce7', fg: '#166534', label: 'Minimal' },
  any: { bg: '#e2e8f0', fg: '#475569', label: 'Any tier' },
};
const blank = { title: '', description: '', applies_to_tier: 'any', owner_person: '', framework_ref: '', system_ids: [] };

export default function BusinessControls() {
  const [controls, setControls] = useState(null);
  const [systems, setSystems] = useState([]);
  const [starters, setStarters] = useState([]);
  const [form, setForm] = useState(blank);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestFor, setSuggestFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [err, setErr] = useState('');

  const load = () => apiFetch('/beaiready/governance/controls').then(setControls).catch((e) => { setErr(e.message); setControls([]); });
  useEffect(() => {
    load();
    apiFetch('/beaiready/security/inventory').then(setSystems).catch(() => setSystems([]));
    apiFetch('/beaiready/governance/controls/starters').then(setStarters).catch(() => setStarters([]));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleSystem = (id) => setForm((f) => ({ ...f, system_ids: f.system_ids.includes(id) ? f.system_ids.filter((x) => x !== id) : [...f.system_ids, id] }));

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/governance/controls', { method: 'POST', body: JSON.stringify(form) }); setForm(blank); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const adopt = async (key) => {
    setBusy(true); setErr('');
    try { await apiFetch('/beaiready/governance/controls/adopt', { method: 'POST', body: JSON.stringify({ key }) }); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const suggest = async () => {
    setSuggesting(true); setErr(''); setSuggestions(null);
    try {
      const r = await apiFetch('/beaiready/governance/controls/suggest', { method: 'POST', body: JSON.stringify(suggestFor ? { system_id: suggestFor } : {}), timeout: 60000 });
      setSuggestions(r.suggestions || []);
    } catch (e) { setErr(e.message); }
    setSuggesting(false);
  };

  const addSuggestion = async (s) => {
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/governance/controls', { method: 'POST', body: JSON.stringify({ title: s.title, description: s.description, applies_to_tier: s.applies_to_tier, framework_ref: s.framework_ref, system_ids: suggestFor ? [suggestFor] : [] }) });
      setSuggestions((cur) => (cur || []).filter((x) => x.title !== s.title));
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const remove = async (id) => { try { await apiFetch(`/beaiready/governance/controls/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setErr(e.message); } };

  const adoptedTitles = new Set((controls || []).map((c) => c.title));

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Governance · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Controls Library</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 14 }}>
        The concrete safeguards your business runs — linked to the AI systems they cover. Adopt the
        framework-backed starters, get suggestions grounded in current governance sources, and add your own.
      </p>
      <p style={{ marginBottom: 18 }}>
        <Link to={bizHome()}>← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/security">AI System Register &amp; Risk</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/review">Roles &amp; review</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance">Your AI policy</Link>
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* Suggest (grounded) */}
      <div className="hub-card" style={{ marginBottom: 16 }}>
        <div className="hub-card-kicker">Suggest controls — grounded in governance sources</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
          <select style={{ ...inp, maxWidth: 320 }} value={suggestFor} onChange={(e) => setSuggestFor(e.target.value)}>
            <option value="">For the business in general</option>
            {systems.map((s) => <option key={s.id} value={s.id}>For: {s.tool_name}</option>)}
          </select>
          <button onClick={suggest} disabled={suggesting} style={btn}>{suggesting ? 'Thinking…' : 'Suggest controls'}</button>
        </div>
        {suggestions && suggestions.length === 0 && <p style={{ fontSize: 12.5, color: '#8a8076', marginTop: 10 }}>No suggestions returned.</p>}
        {suggestions && suggestions.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ borderTop: '1px solid #f0e2d4', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{s.title}</strong>
                    <span style={{ ...badge, background: (TIER[s.applies_to_tier] || TIER.any).bg, color: (TIER[s.applies_to_tier] || TIER.any).fg, marginLeft: 6 }}>{(TIER[s.applies_to_tier] || TIER.any).label}</span>
                    <div style={{ fontSize: 12.5, color: '#6b6359', marginTop: 2 }}>{s.description}</div>
                    {s.framework_ref && <div style={{ fontSize: 11.5, color: '#8a8076', marginTop: 2 }}>{s.framework_ref}</div>}
                    {s.citations?.length > 0 && (
                      <div style={{ fontSize: 11.5, marginTop: 2 }}><span style={{ color: '#8a8076' }}>Sources: </span>
                        {s.citations.map((c, j) => <span key={j}>{j > 0 && ', '}{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}</span>)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => addSuggestion(s)} disabled={busy} style={btnSmall}>Add to library</button>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#a8a29e', fontStyle: 'italic', marginTop: 2 }}>Generated guidance, not legal advice — verify with counsel.</div>
          </div>
        )}
      </div>

      {/* Adopt starters */}
      {starters.filter((s) => !adoptedTitles.has(s.title)).length > 0 && (
        <div className="hub-card" style={{ marginBottom: 16 }}>
          <div className="hub-card-kicker">Recommended starter controls</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
            {starters.filter((s) => !adoptedTitles.has(s.title)).map((s) => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px solid #f0e2d4', paddingTop: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{s.title}</strong>
                  <span style={{ ...badge, background: (TIER[s.applies_to_tier] || TIER.any).bg, color: (TIER[s.applies_to_tier] || TIER.any).fg, marginLeft: 6 }}>{(TIER[s.applies_to_tier] || TIER.any).label}</span>
                  <div style={{ fontSize: 12.5, color: '#6b6359', marginTop: 2 }}>{s.description}</div>
                  <div style={{ fontSize: 11.5, color: '#8a8076', marginTop: 2 }}>{s.framework_ref}</div>
                </div>
                <button onClick={() => adopt(s.key)} disabled={busy} style={btnSmall}>Adopt</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add a control */}
      <form onSubmit={create} className="hub-card" style={{ marginBottom: 18 }}>
        <div className="hub-card-kicker">Add a control</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 640 }}>
          <input style={inp} placeholder="Control title" value={form.title} onChange={(e) => set('title', e.target.value)} />
          <select style={inp} value={form.applies_to_tier} onChange={(e) => set('applies_to_tier', e.target.value)}>
            {Object.entries(TIER).map(([k, v]) => <option key={k} value={k}>Applies to: {v.label}</option>)}
          </select>
          <input style={inp} placeholder="Owner — who's responsible" value={form.owner_person} onChange={(e) => set('owner_person', e.target.value)} />
          <input style={inp} placeholder="Framework reference (optional)" value={form.framework_ref} onChange={(e) => set('framework_ref', e.target.value)} />
        </div>
        <textarea style={{ ...inp, minHeight: 54, marginTop: 8, maxWidth: 640 }} placeholder="What the control is, in one plain sentence" value={form.description} onChange={(e) => set('description', e.target.value)} />
        {systems.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#8a8076', marginBottom: 4 }}>Covers which systems?</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {systems.map((s) => (
                <button type="button" key={s.id} onClick={() => toggleSystem(s.id)} style={{ ...chip, ...(form.system_ids.includes(s.id) ? { background: '#1c1b1a', color: '#fff', borderColor: '#1c1b1a' } : {}) }}>{s.tool_name}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 10 }}><button type="submit" disabled={busy} style={btn}>{busy ? 'Saving…' : 'Add control'}</button></div>
      </form>

      {/* Controls list */}
      {controls === null && <p style={{ color: '#8a8076' }}>Loading…</p>}
      {controls && controls.length === 0 && <p style={{ color: '#8a8076' }}>No controls yet — adopt a starter or add your own above.</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {(controls || []).map((c) => {
          const tier = TIER[c.applies_to_tier] || TIER.any;
          return (
            <div key={c.id} className="hub-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 16, margin: 0 }}>{c.title}
                    <span style={{ ...badge, background: tier.bg, color: tier.fg, marginLeft: 8 }}>{tier.label}</span>
                    {c.status && c.status !== 'active' && <span style={{ ...badge, background: '#e2e8f0', color: '#475569', marginLeft: 6 }}>{c.status}</span>}
                  </h3>
                  {c.description && <p style={{ fontSize: 13, color: '#2b2620', margin: '4px 0 0' }}>{c.description}</p>}
                  <p style={{ fontSize: 12, color: '#8a8076', margin: '4px 0 0' }}>
                    {[c.owner_person && `Owner: ${c.owner_person}`, c.framework_ref].filter(Boolean).join(' · ')}
                  </p>
                  {c.systems?.length > 0 && (
                    <p style={{ fontSize: 12.5, color: '#6b6359', margin: '4px 0 0' }}><b>Covers:</b> {c.systems.map((s) => s.name).join(', ')}</p>
                  )}
                </div>
                <button onClick={() => remove(c.id)} style={btnGhostSmall}>Remove</button>
              </div>
              <EvidencePanel entityType="ai_control" entityId={c.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
const badge = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
const chip = { fontSize: 12.5, fontWeight: 600, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid #e4dcd2', background: '#fff', color: '#6b6359' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnSmall = { padding: '6px 12px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const btnGhostSmall = { padding: '6px 12px', background: 'transparent', color: '#6b6359', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
