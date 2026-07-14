// BusinessSecurity — the AI System Register & Risk workspace (/dashboard/security),
// a Governance-pillar feature. Log every AI system the business uses (purpose, owner,
// data, paid/free, lifecycle), classify each against the EU AI Act four-tier model —
// GROUNDED in the live governance corpus and CITED — and get a data-safety ruling.
// Scoped to the tenant.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

// Data-safety ruling (is this tool safe to put our data in?) — distinct from risk tier.
const ACC = {
  approved: { bg: '#dcfce7', fg: '#166534', label: 'Approved' },
  restricted: { bg: '#fef3c7', fg: '#92400e', label: 'Restricted' },
  avoid: { bg: '#fee2e2', fg: '#991b1b', label: 'Avoid' },
  unreviewed: { bg: '#e2e8f0', fg: '#475569', label: 'Not yet reviewed' },
};

// EU AI Act risk tier (how much harm if it fails?) — distinct from data-safety.
const RISK = {
  unacceptable: { bg: '#fee2e2', fg: '#991b1b', label: 'Unacceptable' },
  high: { bg: '#fed7aa', fg: '#9a3412', label: 'High risk' },
  limited: { bg: '#fef9c3', fg: '#854d0e', label: 'Limited risk' },
  minimal: { bg: '#dcfce7', fg: '#166534', label: 'Minimal risk' },
  unclassified: { bg: '#e2e8f0', fg: '#475569', label: 'Unclassified' },
};
const RISK_ORDER = ['unacceptable', 'high', 'limited', 'minimal', 'unclassified'];

const blankForm = { tool_name: '', purpose: '', used_by: '', owner_person: '', data_shared: '', paid_free: '', lifecycle_status: '' };

export default function BusinessSecurity() {
  const [tools, setTools] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [classifying, setClassifying] = useState(null);
  const [filter, setFilter] = useState('all');
  const [suggestions, setSuggestions] = useState(null); // null=not run, []=ran/none, [..]=found
  const [discovering, setDiscovering] = useState(false);
  const [err, setErr] = useState('');

  const load = () => apiFetch('/beaiready/security/inventory').then(setTools).catch((e) => { setErr(e.message); setTools([]); });
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async (e) => {
    e.preventDefault();
    if (!form.tool_name.trim()) return;
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/security/inventory', { method: 'POST', body: JSON.stringify(form) });
      setForm(blankForm);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const discover = async () => {
    setDiscovering(true); setErr('');
    try {
      const r = await apiFetch('/beaiready/security/discover', { timeout: 60000 });
      if (!r.responses) { setSuggestions([]); setErr('No staff survey responses yet — connect a staff survey under Training first.'); }
      else setSuggestions(r.suggestions || []);
    } catch (e) { setErr(e.message); }
    setDiscovering(false);
  };

  const addSuggestion = async (s) => {
    setBusy(true); setErr('');
    try {
      await apiFetch('/beaiready/security/inventory', { method: 'POST', body: JSON.stringify(s) });
      setSuggestions((cur) => (cur || []).filter((x) => x.tool_name !== s.tool_name));
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const classify = async (id) => {
    setClassifying(id); setErr('');
    try { await apiFetch(`/beaiready/security/inventory/${id}/classify`, { method: 'POST', timeout: 60000 }); await load(); }
    catch (e) { setErr(e.message); }
    setClassifying(null);
  };

  const assess = async (id) => {
    setAssessing(id); setErr('');
    try { await apiFetch(`/beaiready/security/inventory/${id}/assess`, { method: 'POST', timeout: 60000 }); await load(); }
    catch (e) { setErr(e.message); }
    setAssessing(null);
  };

  const remove = async (id) => {
    try { await apiFetch(`/beaiready/security/inventory/${id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setErr(e.message); }
  };

  const all = tools || [];
  const riskCounts = all.reduce((a, t) => { const k = t.risk_tier || 'unclassified'; a[k] = (a[k] || 0) + 1; return a; }, {});
  const shown = filter === 'all' ? all : all.filter((t) => (t.risk_tier || 'unclassified') === filter);

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Cyber Security · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>AI System Register &amp; Risk</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 14 }}>
        A living register of every AI system your business uses — what it's for, who owns it, what data it
        touches — with an EU AI Act risk tier for each, classified against live governance sources and cited.
        Plus a data-safety ruling per tool.
      </p>
      <p style={{ marginBottom: 18 }}>
        <Link to="/dashboard">← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/controls">Controls library</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance">Your AI policy</Link> &nbsp;·&nbsp;
        <Link to="/tracker">Legal &amp; regulation tracker</Link>
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* Risk-tier filter + counts */}
      {all.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <button onClick={() => setFilter('all')} style={chip(filter === 'all')}>All ({all.length})</button>
          {RISK_ORDER.filter((k) => riskCounts[k]).map((k) => (
            <button key={k} onClick={() => setFilter(k)} style={{ ...chip(filter === k), background: filter === k ? RISK[k].fg : RISK[k].bg, color: filter === k ? '#fff' : RISK[k].fg }}>
              {RISK[k].label} ({riskCounts[k]})
            </button>
          ))}
        </div>
      )}

      {/* Discover from the staff survey */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={discover} disabled={discovering} style={btnGhostSmall}>{discovering ? 'Scanning survey…' : '✨ Discover from staff survey'}</button>
        <span style={{ fontSize: 12, color: '#8a8076' }}>Pull the AI tools your team named in the staff survey into the register.</span>
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="hub-card" style={{ marginBottom: 18, background: '#fffaf5', border: '1px solid #f0e2d4' }}>
          <div className="hub-card-kicker">From your staff survey — add the ones that are real</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: i ? '1px solid #f0e2d4' : 'none' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{s.tool_name}</strong>
                  <div style={{ fontSize: 12.5, color: '#8a8076' }}>{[s.purpose, s.used_by && `used by ${s.used_by}`, s.data_shared && `data: ${s.data_shared}`].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => addSuggestion(s)} disabled={busy} style={btnSmall}>Add to register</button>
                  <button onClick={() => setSuggestions((cur) => cur.filter((x) => x.tool_name !== s.tool_name))} style={btnGhostSmall}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {suggestions && suggestions.length === 0 && !discovering && (
        <p style={{ fontSize: 12.5, color: '#8a8076', marginBottom: 14 }}>No new AI tools found in the survey responses.</p>
      )}

      {/* Add a system */}
      <form onSubmit={add} className="hub-card" style={{ marginBottom: 18 }}>
        <div className="hub-card-kicker">Add an AI system to the register</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 640 }}>
          <input style={inp} placeholder="System name (e.g. ChatGPT, a hiring tool)" value={form.tool_name} onChange={(e) => set('tool_name', e.target.value)} />
          <input style={inp} placeholder="Purpose — what it's used for" value={form.purpose} onChange={(e) => set('purpose', e.target.value)} />
          <input style={inp} placeholder="Used by (team / person)" value={form.used_by} onChange={(e) => set('used_by', e.target.value)} />
          <input style={inp} placeholder="Owner — who's answerable for it" value={form.owner_person} onChange={(e) => set('owner_person', e.target.value)} />
          <select style={inp} value={form.paid_free} onChange={(e) => set('paid_free', e.target.value)}>
            <option value="">Paid or free?</option><option value="paid">Paid</option><option value="free">Free</option><option value="unknown">Unknown</option>
          </select>
          <select style={inp} value={form.lifecycle_status} onChange={(e) => set('lifecycle_status', e.target.value)}>
            <option value="">Status…</option><option value="active">Active</option><option value="trial">Trial</option><option value="awaiting">Awaiting approval</option><option value="retired">Retired</option>
          </select>
        </div>
        <textarea style={{ ...inp, minHeight: 54, marginTop: 8, maxWidth: 640 }} placeholder="What data goes into it? (e.g. client tender docs, candidate CVs, customer emails)" value={form.data_shared} onChange={(e) => set('data_shared', e.target.value)} />
        <div style={{ marginTop: 10 }}><button type="submit" disabled={busy} style={btn}>{busy ? 'Adding…' : 'Add to register'}</button></div>
      </form>

      {tools === null && <p style={{ color: '#8a8076' }}>Loading…</p>}
      {tools && tools.length === 0 && <p style={{ color: '#8a8076' }}>No AI systems logged yet — add the AI your team uses above.</p>}
      {tools && tools.length > 0 && shown.length === 0 && <p style={{ color: '#8a8076' }}>No systems in this risk tier.</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map((t) => {
          const acc = ACC[t.acceptability] || ACC.unreviewed;
          const risk = RISK[t.risk_tier] || RISK.unclassified;
          const citations = Array.isArray(t.risk_citations) ? t.risk_citations : [];
          return (
            <div key={t.id} className="hub-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 16, margin: 0 }}>{t.tool_name}
                    {t.matched_name && <span style={{ fontWeight: 400, color: '#8a8076', fontSize: 13 }}> · recognised</span>}
                  </h3>
                  {t.purpose && <p style={{ fontSize: 13, color: '#2b2620', margin: '3px 0 0' }}>{t.purpose}</p>}
                  <p style={{ fontSize: 12.5, color: '#8a8076', margin: '3px 0 0' }}>
                    {[t.used_by && `Used by ${t.used_by}`, t.owner_person && `Owner: ${t.owner_person}`,
                      t.paid_free && t.paid_free !== 'unknown' && t.paid_free, t.lifecycle_status]
                      .filter(Boolean).join(' · ') || '—'}
                    {t.data_shared ? ` · puts in: ${t.data_shared}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ ...badge, background: risk.bg, color: risk.fg }}>{risk.label}</span>
                  <span style={{ ...badge, background: acc.bg, color: acc.fg }}>{acc.label}</span>
                </div>
              </div>

              {/* Risk classification result */}
              {t.risk_tier === 'unacceptable' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '8px 12px', borderRadius: 8, marginTop: 10, fontSize: 13, fontWeight: 600 }}>
                  ⛔ This use may be prohibited under the EU AI Act — stop and review before continuing.
                </div>
              )}
              {t.risk_rationale && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: '#6b6359' }}>
                  <b>Risk reasoning:</b> {t.risk_rationale}
                  {citations.length > 0 ? (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: '#8a8076' }}>Sources: </span>
                      {citations.map((c, i) => (
                        <span key={i}>{i > 0 && ', '}{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}</span>
                      ))}
                    </div>
                  ) : (
                    t.risk_grounded === false && <div style={{ marginTop: 4, color: '#9a3412' }}>Based on general principles — not yet backed by a cited source; verify.</div>
                  )}
                  <div style={{ marginTop: 4, color: '#a8a29e', fontStyle: 'italic' }}>Generated guidance, not legal advice — verify with counsel.</div>
                </div>
              )}

              {/* Data-safety ruling (existing) */}
              {t.matched_limitations && <p style={{ fontSize: 12.5, color: '#6b6359', margin: '8px 0 0' }}><b>Known risks:</b> {t.matched_limitations}</p>}
              {t.ruling && <p style={{ fontSize: 13, color: '#2b2620', margin: '8px 0 0', fontWeight: 600 }}>{t.ruling}</p>}
              {t.fix && <p style={{ fontSize: 12.5, color: '#9a3412', margin: '4px 0 0' }}><b>Fix:</b> {t.fix}</p>}

              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => classify(t.id)} disabled={classifying === t.id} style={btnSmall}>{classifying === t.id ? 'Classifying…' : t.risk_rationale ? 'Re-classify risk' : 'Classify risk'}</button>
                <button onClick={() => assess(t.id)} disabled={assessing === t.id} style={btnGhostSmall}>{assessing === t.id ? 'Assessing…' : t.ruling ? 'Re-assess data safety' : 'Assess data safety'}</button>
                <button onClick={() => remove(t.id)} style={btnGhostSmall}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff' };
const badge = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
const chip = (active) => ({ fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', border: '1px solid #e4dcd2', background: active ? '#1c1b1a' : '#fff', color: active ? '#fff' : '#6b6359' });
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnSmall = { padding: '6px 12px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnGhostSmall = { padding: '6px 12px', background: 'transparent', color: '#6b6359', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
