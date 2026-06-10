// NodeCard — the one unified tile for any GROUNDED function (Phase 1 · step 6).
//
// Renders an in-app agent, a tool, or a hosted Node the same way: name, honest
// status (Live / In progress / In development), how it runs (online / local /
// both), and the right call-to-action:
//   • `to`   → an internal route  → "Open →"      (whole card is a Link)
//   • `href` → an external page   → "Run online ↗" (whole card is an <a>)
//   • neither → a non-interactive card (no dead links; in-development or a
//     workflow component you use inside Builder)
//
// Used by both the section pages (SectionLanding) and the Functions directory
// so the two can never drift.

import { Link } from 'react-router-dom';
import { STATUS_LABEL, RUNS_LABEL } from './sections.js';

export function StatusPill({ status }) {
  const cls = status === 'live' ? 'pill-live' : status === 'partial' ? 'pill-partial' : 'pill-soon';
  const dot = status === 'live' ? 'var(--status-live)' : status === 'partial' ? 'var(--status-partial)' : 'var(--status-soon)';
  return (
    <span className={`pill ${cls}`}>
      <span className="pill-dot" style={{ background: dot }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function NodeCard({ fn, accentVar }) {
  const cls = `fn-card ${fn.status === 'soon' ? 'is-soon' : ''}`;
  const style = { '--accent': `var(${accentVar})` };

  const body = (
    <>
      <div className="fn-card-head">
        <h3>{fn.name}</h3>
        <StatusPill status={fn.status} />
      </div>
      <p>{fn.blurb}</p>
      <div className="fn-card-foot">
        {fn.runs && <span className="pill pill-runs">{RUNS_LABEL[fn.runs]}</span>}
      </div>
      {fn.to && <div className="fn-card-open">Open →</div>}
      {!fn.to && fn.href && <div className="fn-card-open">Run online ↗</div>}
    </>
  );

  if (fn.to) {
    return <Link to={fn.to} className={cls} style={style}>{body}</Link>;
  }
  if (fn.href) {
    return <a href={fn.href} className={cls} style={style}>{body}</a>;
  }
  return <div className={cls} style={style}>{body}</div>;
}
