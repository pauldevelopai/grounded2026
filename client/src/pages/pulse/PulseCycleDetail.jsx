import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import { muted, StatusBadge, fmtDate, sendJson, CopyBlock } from './pulseUi.jsx';

const fieldStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 13, marginBottom: 8, fontFamily: 'inherit' };
const OPTS = ['A', 'B', 'C', 'D'];

// One editable question card (Draft/vetting view).
function QuestionEditor({ q, onSaved }) {
  const f = q.fields || {};
  const [text, setText] = useState(f['Question text'] || '');
  const [tag, setTag] = useState(f.Tag?.name || f.Tag || '');
  const [rationale, setRationale] = useState(f.Rationale || '');
  const [opts, setOpts] = useState(OPTS.map((L) => ({ label: f[`Option ${L}`] || '', value: f[`Option ${L} value`] ?? '' })));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    const body = { text, tag, rationale };
    OPTS.forEach((L, i) => {
      body[`option${L}`] = opts[i].label;
      body[`option${L}Value`] = opts[i].value === '' ? null : Number(opts[i].value);
    });
    try {
      await sendJson(`/pulse/questions/${q.id}`, 'PATCH', body);
      setSaved(true); setTimeout(() => setSaved(false), 1500);
      onSaved?.();
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Q{f.Order}</strong>
        <span style={{ ...muted, fontSize: 11 }}>{f['Edited by Paul'] ? 'edited' : 'original'}{f.Vetted ? ' · vetted ✓' : ''}</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} style={fieldStyle} />
      {opts.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <span style={{ ...muted, width: 16, paddingTop: 8 }}>{OPTS[i]}</span>
          <input value={o.label} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder={`Option ${OPTS[i]}`} style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} />
          <input value={o.value} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="value" type="number" style={{ ...fieldStyle, marginBottom: 0, width: 70 }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag" style={{ ...fieldStyle, marginBottom: 0, width: 160 }} />
        <input value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Rationale" style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} />
        <button className="btn btn-small btn-primary" onClick={save} disabled={busy}>{busy ? '…' : saved ? 'Saved ✓' : 'Save'}</button>
      </div>
    </div>
  );
}

function QuestionReadOnly({ q }) {
  const f = q.fields || {};
  return (
    <div className="card" style={{ padding: 16, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Q{f.Order}. {f['Question text']}</div>
      {OPTS.filter((L) => f[`Option ${L}`]).map((L) => (
        <div key={L} style={{ ...muted, marginLeft: 8 }}>{L}) {f[`Option ${L}`]} <span style={{ opacity: 0.6 }}>[{f[`Option ${L} value`]}]</span></div>
      ))}
      {f.Tag && <div style={{ ...muted, marginTop: 6 }}>Tag: {f.Tag?.name || f.Tag}</div>}
    </div>
  );
}

export default function PulseCycleDetail() {
  const { id } = useParams();
  const [cycle, setCycle] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sendCopy, setSendCopy] = useState(null);   // {publicUrl, whatsapp, email}
  const [report, setReport] = useState(null);       // {subject, whatsapp, email}
  const [tip, setTip] = useState('');
  const [commitLink, setCommitLink] = useState('');
  const [versionAfter, setVersionAfter] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  function load() {
    return apiFetch(`/pulse/cycles/${id}`).then((c) => { setCycle(c); setTip(c.fields?.['AI tip'] || ''); }).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [id]);

  async function act(fn) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error) return (<div><PageHeader title="Pulse cycle" /><div className="empty-state"><h3>{error}</h3></div></div>);
  if (!cycle) return (<div><PageHeader title="Pulse cycle" /><p style={muted}>Loading…</p></div>);

  const f = cycle.fields || {};
  const status = cycle.status;
  const plan = cycle.plan;

  return (
    <div>
      <PageHeader title={`Pulse · ${f.Newsroom || 'cycle'}`} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: -8, marginBottom: 20 }}>
        <StatusBadge status={status} />
        <span style={muted}>{f['Node Install']} · triggered {fmtDate(f['Triggered date'])}</span>
        <Link to="/admin/pulse" style={{ ...muted, marginLeft: 'auto', color: 'var(--accent)', textDecoration: 'none' }}>← all cycles</Link>
      </div>

      {/* DRAFT — vetting */}
      {status === 'Draft' && (
        <>
          <p style={muted}>Review and edit each question, then approve. Edits preserve the AI's original wording.</p>
          {cycle.questions.map((q) => <QuestionEditor key={q.id} q={q} onSaved={load} />)}
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>AI tip (shown to the newsroom on submit)</div>
            <textarea value={tip} onChange={(e) => setTip(e.target.value)} rows={3} style={fieldStyle} />
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={() => act(() => sendJson(`/pulse/cycles/${id}/vet`, 'POST', { tip }))}>
            Approve all and mark vetted
          </button>
        </>
      )}

      {/* VETTED — generate send copy */}
      {status === 'Vetted' && (
        <>
          {cycle.questions.map((q) => <QuestionReadOnly key={q.id} q={q} />)}
          {!sendCopy ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => act(async () => {
              const r = await sendJson(`/pulse/cycles/${id}/send`, 'POST', {});
              setSendCopy(r);
            })}>Generate send copy</button>
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <CopyBlock label="Public answer link" text={sendCopy.publicUrl} mono />
              <CopyBlock label="WhatsApp message" text={sendCopy.whatsapp} />
              <CopyBlock label="Email message" text={sendCopy.email} />
              <p style={muted}>Send manually, then this cycle waits for the newsroom.</p>
            </div>
          )}
        </>
      )}

      {/* SENT — awaiting newsroom */}
      {status === 'Sent' && (
        <div className="card" style={{ padding: 16 }}>
          <p>Sent — waiting for the newsroom to respond.</p>
          <CopyBlock label="Public answer link" text={f['Public URL']} mono />
          <button className="btn btn-small" disabled={busy} onClick={() => act(() => sendJson(`/pulse/cycles/${id}/mark-responded`, 'POST', {}))}>Mark as responded (override)</button>
        </div>
      )}

      {/* RESPONDED — draft plan */}
      {status === 'Responded' && (
        <>
          <ResponseCard response={cycle.response} />
          <button className="btn btn-primary" disabled={busy} onClick={() => act(() => sendJson(`/pulse/cycles/${id}/draft-plan`, 'POST', {}))}>{busy ? 'Drafting…' : 'Draft plan'}</button>
        </>
      )}

      {/* PLAN DRAFTED — approve / reject */}
      {status === 'Plan drafted' && plan && (
        <>
          <ResponseCard response={cycle.response} />
          <PlanCard plan={plan} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => act(() => sendJson(`/pulse/plans/${plan.id}/approve`, 'POST', {}))}>Approve plan</button>
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason" style={{ ...fieldStyle, marginBottom: 0, flex: 1, minWidth: 200 }} />
            <button className="btn" disabled={busy || !rejectReason} onClick={() => act(() => sendJson(`/pulse/plans/${plan.id}/reject`, 'POST', { reason: rejectReason }))}>Reject</button>
          </div>
        </>
      )}

      {/* PLAN APPROVED — briefing + mark shipped */}
      {status === 'Plan approved' && plan && (
        <>
          <PlanCard plan={plan} />
          <div className="card" style={{ padding: 16 }}>
            <CopyBlock label="Claude Code briefing prompt" text={plan.fields?.['Claude Code briefing prompt']} mono />
            <p style={muted}>Open the node repo in VS Code, run Claude Code with the prompt above, review the diff, commit + push. Then paste the commit link and mark shipped.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input value={commitLink} onChange={(e) => setCommitLink(e.target.value)} placeholder="Commit / PR link" style={{ ...fieldStyle, marginBottom: 0, flex: 1, minWidth: 220 }} />
              <input value={versionAfter} onChange={(e) => setVersionAfter(e.target.value)} placeholder="New version (optional)" style={{ ...fieldStyle, marginBottom: 0, width: 160 }} />
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => sendJson(`/pulse/cycles/${id}/mark-shipped`, 'POST', { commitLink, nodeVersionAfter: versionAfter }))}>Mark as shipped</button>
            </div>
          </div>
        </>
      )}

      {/* SHIPPED — generate report */}
      {status === 'Shipped' && (
        <>
          {plan && <PlanCard plan={plan} />}
          {!report ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => act(async () => {
              const r = await sendJson(`/pulse/cycles/${id}/send-report`, 'POST', {});
              setReport(r);
            })}>Generate report</button>
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <CopyBlock label="Email subject" text={report.subject} />
              <CopyBlock label="WhatsApp report" text={report.whatsapp} />
              <CopyBlock label="Email report" text={report.email} />
            </div>
          )}
        </>
      )}

      {/* REPORTED BACK — history */}
      {status === 'Reported back' && (
        <>
          <ResponseCard response={cycle.response} />
          {plan && <PlanCard plan={plan} />}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Shipped</div>
            <div style={muted}>Version after: {f['Node version after'] || '—'} · {plan?.fields?.['Commit/PR link'] ? <a href={plan.fields['Commit/PR link']} target="_blank" rel="noreferrer">commit</a> : 'no link'}</div>
          </div>
        </>
      )}
    </div>
  );
}

function ResponseCard({ response }) {
  if (!response) return null;
  const f = response.fields || {};
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Newsroom response {f['Respondent name'] ? `· ${f['Respondent name']}${f['Respondent role'] ? `, ${f['Respondent role']}` : ''}` : ''}</div>
      {['Answer 1', 'Answer 2', 'Answer 3'].map((a) => f[a] && <div key={a} style={muted}>{a}: {f[a]}</div>)}
      {f['Open feedback'] && <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-secondary, #efe9e1)', borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>{f['Open feedback']}</div>}
    </div>
  );
}

function PlanCard({ plan }) {
  const f = plan.fields || {};
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong>{f.Summary || 'Change plan'}</strong>
        <span style={muted}>{f.Status?.name || f.Status}</span>
      </div>
      {f.Rationale && <div style={{ fontSize: 13, marginBottom: 6 }}><b>Why:</b> {f.Rationale}</div>}
      {f.Scope && <div style={{ fontSize: 13, marginBottom: 6 }}><b>Scope:</b> {f.Scope}</div>}
      {Array.isArray(f['Risk flags']) && f['Risk flags'].length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {f['Risk flags'].map((r) => (
            <span key={r.name || r} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: (r.name || r) === 'Election-sensitive' ? '#FEE2E2' : '#efe9e1', color: (r.name || r) === 'Election-sensitive' ? '#B91C1C' : '#4338CA' }}>{r.name || r}</span>
          ))}
        </div>
      )}
      {f['Rejection reason'] && <div style={{ ...muted, marginTop: 6 }}>Rejected: {f['Rejection reason']}</div>}
    </div>
  );
}
