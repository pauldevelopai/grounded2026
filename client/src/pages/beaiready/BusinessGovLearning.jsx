// BusinessGovLearning — the authed Governance Learning course (/dashboard/governance/learning).
// Four self-serve units teaching AI governance across the four AIGP domains. Section content
// comes from govLearningContent.js; per-person progress (not_started | in_progress | complete)
// is tracked server-side in bair.gov_learning_progress. See docs/BUILD_…md.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { bizHome } from './bizNav.js';
import { apiFetch } from '../../hooks/useApi.js';
import { GOV_LEARNING_UNITS } from './govLearningContent.js';

const BAND = { background: '#fff', border: '1px solid #e4dcd2' };
const contentByUnit = Object.fromEntries(GOV_LEARNING_UNITS.map((u) => [u.unit_no, u]));

export default function BusinessGovLearning() {
  const [units, setUnits] = useState(null);   // [{unit_no,domain,title,summary,status,completed_at}]
  const [open, setOpen] = useState(null);      // unit_no currently expanded
  const [err, setErr] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      const d = await apiFetch('/beaiready/governance/learning');
      setUnits(d.units);
      // Deep link from the assessment scorecard: ?unit=N auto-opens that unit.
      const u = Number(searchParams.get('unit'));
      const target = Number.isInteger(u) && d.units.find((x) => x.unit_no === u);
      if (target) {
        setOpen(u);
        if (target.status === 'not_started') setProgress(u, 'in_progress');
      }
    } catch (e) { setErr(e.message); }
  }

  async function setProgress(unitNo, status) {
    try {
      const r = await apiFetch(`/beaiready/governance/learning/${unitNo}/progress`, { method: 'POST', body: JSON.stringify({ status }) });
      setUnits((us) => us.map((u) => (u.unit_no === unitNo ? { ...u, status: r.status, completed_at: r.completed_at } : u)));
    } catch (e) { setErr(e.message); }
  }

  function openUnit(u) {
    setOpen(u.unit_no);
    if (u.status === 'not_started') setProgress(u.unit_no, 'in_progress'); // opening starts it
  }

  const completeCount = units ? units.filter((u) => u.status === 'complete').length : 0;

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Governance · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Governance Learning</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 8 }}>
        A four-part course teaching your staff the ins and outs of AI governance — the foundations,
        the rules that apply, building governance into what you do, and governing AI in daily use.
      </p>
      <p style={{ fontSize: 12.5, color: '#8a8076', maxWidth: '66ch', marginBottom: 16 }}>
        This is professional development in AI governance — it is <strong>not the AIGP credential</strong>.
      </p>
      <p style={{ marginBottom: 20 }}>
        <Link to={bizHome()}>← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/assessment">Governance Assessment</Link>
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {units === null && <p style={{ color: '#8a8076' }}>Loading…</p>}

      {units && (
        <>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>{completeCount} of {units.length} units complete</p>
          {units.map((u) => (
            <section key={u.unit_no} className="hub-band" style={{ ...BAND, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Unit {u.unit_no} · {u.title}</h2>
                <StatusBadge status={u.status} />
              </div>
              <p style={{ color: '#6b6359', margin: '6px 0 10px' }}>{u.summary}</p>
              {open === u.unit_no ? (
                <UnitBody unit={contentByUnit[u.unit_no]} status={u.status}
                  onComplete={() => setProgress(u.unit_no, 'complete')}
                  onClose={() => setOpen(null)} />
              ) : (
                <button onClick={() => openUnit(u)} style={btn}>{u.status === 'complete' ? 'Review unit' : u.status === 'in_progress' ? 'Continue' : 'Start unit'}</button>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function UnitBody({ unit, status, onComplete, onClose }) {
  if (!unit) return <p style={{ color: '#9a3412' }}>Content for this unit is unavailable.</p>;
  return (
    <div style={{ marginTop: 4 }}>
      {unit.sections.map((s, i) => (
        <div key={i} style={{ marginTop: 14 }}>
          <div className="hub-card-kicker">{s.heading}</div>
          {s.body.map((p, j) => <p key={j} style={{ color: '#2b2620', lineHeight: 1.6, margin: '6px 0 0' }}>{p}</p>)}
        </div>
      ))}
      {unit.check?.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="hub-card-kicker">Check your understanding</div>
          {unit.check.map((c, i) => <CheckQuestion key={i} c={c} />)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {status !== 'complete' && <button onClick={onComplete} style={btn}>Mark this unit complete</button>}
        {status === 'complete' && <span style={{ fontSize: 13, color: '#166534' }}>✓ Completed</span>}
        <button onClick={onClose} style={btnGhost}>Close</button>
        {/* Close the loop: once learned, re-check this domain in the assessment. */}
        {status === 'complete' && (
          <Link to="/dashboard/governance/assessment" style={{ fontSize: 12.5, fontWeight: 600, color: '#c75b39' }}>
            Learned this? Re-assess your governance →
          </Link>
        )}
      </div>
    </div>
  );
}

function CheckQuestion({ c }) {
  const [picked, setPicked] = useState(null);
  return (
    <fieldset style={{ border: 'none', margin: '10px 0 0', padding: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{c.q}</legend>
      {c.options.map((opt, i) => {
        const chosen = picked === i;
        const correct = i === c.answer;
        const colour = picked == null ? '#2b2620' : correct ? '#166534' : chosen ? '#b91c1c' : '#8a8076';
        return (
          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13.5, cursor: 'pointer', color: colour }}>
            <input type="radio" name={c.q} checked={chosen} onChange={() => setPicked(i)} />
            {opt}{picked != null && correct ? '  ✓' : ''}
          </label>
        );
      })}
      {picked != null && <p style={{ fontSize: 12.5, color: '#6b6359', margin: '4px 0 0' }}>{c.why}</p>}
    </fieldset>
  );
}

function StatusBadge({ status }) {
  const map = {
    complete: { t: 'Complete', c: '#166534', b: '#dcfce7' },
    in_progress: { t: 'In progress', c: '#b45309', b: '#fef3c7' },
    not_started: { t: 'Not started', c: '#8a8076', b: '#f0eae2' },
  };
  const s = map[status] || map.not_started;
  return <span style={{ fontSize: 11.5, fontWeight: 700, color: s.c, background: s.b, padding: '2px 8px', borderRadius: 999 }}>{s.t}</span>;
}

const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', background: 'transparent', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
