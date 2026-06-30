// BusinessGovernance — the authed Governance workspace (/dashboard/governance). The
// AI-use policy that "lives in your dashboard" — now DERIVED from the business's own
// governance data (AI System Register + risk tiers, adopted Controls, accountable
// owner + cadence) and GROUNDED in the governance corpus, cited. Review, edit, own,
// save. Not a brief: the policy is the readable summary of what the business runs.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import EvidencePanel from './EvidencePanel.jsx';

export default function BusinessGovernance() {
  const [saved, setSaved] = useState(undefined); // undefined=loading, null=none, obj=saved
  const [draft, setDraft] = useState(null);       // null | obj | {empty:true,message}
  const [summary, setSummary] = useState(null);   // {systems, controls, owner}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    apiFetch('/beaiready/policy').then(setSaved).catch(() => setSaved(null));
    Promise.all([
      apiFetch('/beaiready/security/inventory').catch(() => []),
      apiFetch('/beaiready/governance/controls').catch(() => []),
      apiFetch('/beaiready/governance/profile').catch(() => null),
    ]).then(([sys, ctl, prof]) => setSummary({ systems: sys.length, controls: ctl.length, owner: prof?.accountable_owner || null }));
  }, []);

  const generate = async () => {
    setBusy(true); setErr(''); setDraft(null);
    try {
      const d = await apiFetch('/beaiready/policy/generate', { method: 'POST', body: JSON.stringify({}), timeout: 90000 });
      setDraft(d);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const save = async (content, title, brief) => {
    setBusy(true); setErr('');
    try {
      const s = await apiFetch('/beaiready/policy', { method: 'PUT', body: JSON.stringify({ title, content, brief }) });
      setSaved(s); setDraft(null); setEditing(false);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const nothingToDerive = summary && summary.systems === 0 && summary.controls === 0;

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Governance · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Your AI policy</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 18 }}>
        A written AI-use policy your business owns — <strong>generated from your own governance data</strong>:
        the AI systems you've logged, their risk tiers, the controls you've adopted and your accountable
        owner. Grounded in current law &amp; frameworks, and cited.
      </p>
      <p style={{ marginBottom: 20 }}>
        <Link to="/dashboard">← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/security">AI System Register</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/controls">Controls library</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/review">Roles &amp; review</Link>
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* ── Saved policy ── */}
      {saved === undefined && <p style={{ color: '#8a8076' }}>Loading…</p>}
      {saved && !editing && !draft && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{saved.title}</h2>
            <span style={{ fontSize: 12, color: '#8a8076' }}>Updated {new Date(saved.updated_at).toLocaleDateString()}</span>
          </div>
          <pre style={preStyle}>{saved.content}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setEditing(true)} style={btn}>Edit</button>
            <button onClick={() => setSaved(null)} style={btnGhost}>Re-generate from current data</button>
          </div>
          <EvidencePanel entityType="ai_policy" entityId={saved.id} />
        </section>
      )}

      {/* ── Edit saved ── */}
      {saved && editing && (
        <PolicyEditor initial={saved.content} title={saved.title} busy={busy}
          onCancel={() => setEditing(false)} onSave={(c, t) => save(c, t)} />
      )}

      {/* ── Generate flow (no saved policy, or re-generating) ── */}
      {saved === null && !draft && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <h2 style={{ marginTop: 0 }}>Generate your AI policy</h2>
          {nothingToDerive ? (
            <div style={{ color: '#6b6359' }}>
              <p>Your policy is generated from your governance data — but there's nothing to build it from yet.</p>
              <p>Start by logging your AI systems and adopting a few controls:</p>
              <p style={{ marginTop: 8 }}>
                <Link to="/dashboard/security" style={linkBtn}>Build your AI register →</Link> &nbsp;
                <Link to="/dashboard/governance/controls" style={linkBtn}>Adopt controls →</Link>
              </p>
            </div>
          ) : (
            <>
              <p style={{ color: '#6b6359', marginTop: 0 }}>We'll generate it from your current governance data:</p>
              <ul className="hub-card-points">
                <li>{summary?.systems ?? '…'} AI system{summary?.systems === 1 ? '' : 's'} in your register</li>
                <li>{summary?.controls ?? '…'} adopted control{summary?.controls === 1 ? '' : 's'}</li>
                <li>Accountable owner: {summary?.owner || <span style={{ color: '#9a3412' }}>not yet set</span>}</li>
                <li>Current law &amp; frameworks from the governance corpus (cited)</li>
              </ul>
              <button onClick={generate} disabled={busy} style={btn}>{busy ? 'Generating…' : 'Generate policy'}</button>
            </>
          )}
        </section>
      )}

      {/* ── Review a fresh draft ── */}
      {draft && draft.empty && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <h2 style={{ marginTop: 0 }}>Build your governance data first</h2>
          <p style={{ color: '#6b6359' }}>{draft.message}</p>
          <p style={{ marginTop: 8 }}>
            <Link to="/dashboard/security" style={linkBtn}>Build your AI register →</Link> &nbsp;
            <Link to="/dashboard/governance/controls" style={linkBtn}>Adopt controls →</Link>
          </p>
          <button onClick={() => setDraft(null)} style={btnGhost}>Back</button>
        </section>
      )}
      {draft && !draft.empty && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <h2 style={{ marginTop: 0 }}>{draft.title}</h2>
          {draft.derived_from && (
            <p style={{ fontSize: 12.5, color: '#8a8076', marginTop: 0 }}>
              Derived from {draft.derived_from.systems} system{draft.derived_from.systems === 1 ? '' : 's'} ·
              {' '}{draft.derived_from.controls} control{draft.derived_from.controls === 1 ? '' : 's'}
              {draft.derived_from.owner ? ` · owner ${draft.derived_from.owner}` : ''}
              {draft.derived_from.sources ? ` · ${draft.derived_from.sources} cited source${draft.derived_from.sources === 1 ? '' : 's'}` : ''}
            </p>
          )}
          {draft.summary && <p style={{ color: '#6b6359' }}>{draft.summary}</p>}
          {draft.citations?.length > 0 && (
            <p style={{ fontSize: 12, marginTop: 0 }}><span style={{ color: '#8a8076' }}>Grounded in: </span>
              {draft.citations.map((c, i) => <span key={i}>{i > 0 && ', '}{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}</span>)}</p>
          )}
          {draft.grounded === false && <p style={{ fontSize: 12, color: '#9a3412' }}>Not yet backed by cited sources — load governance documents to ground it. Verify before relying on it.</p>}
          {draft.checklist?.length > 0 && (
            <>
              <div className="hub-card-kicker">To put this in place</div>
              <ul className="hub-card-points">{draft.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          <PolicyEditor initial={draft.content} title={draft.title} busy={busy}
            onCancel={() => setDraft(null)} onSave={(c, t) => save(c, t, draft.derived_from)} saveLabel="Save as our policy" />
        </section>
      )}
    </div>
  );
}

function PolicyEditor({ initial, title, busy, onCancel, onSave, saveLabel = 'Save changes' }) {
  const [content, setContent] = useState(initial);
  const [t, setT] = useState(title);
  return (
    <div style={{ marginTop: 12 }}>
      <input style={{ ...inp, marginBottom: 8, fontWeight: 600 }} value={t} onChange={(e) => setT(e.target.value)} />
      <textarea style={{ ...inp, minHeight: 320, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} value={content} onChange={(e) => setContent(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onSave(content, t)} disabled={busy || !content.trim()} style={btn}>{busy ? 'Saving…' : saveLabel}</button>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const preStyle = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, color: '#2b2620', marginTop: 12 };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', background: 'transparent', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const linkBtn = { fontWeight: 600, color: '#c75b39' };
