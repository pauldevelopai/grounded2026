// FunctionsDirectory — one place to see everything GROUNDED can do (Phase 1 · step 6).
//
// Flattens the five sections' functions into a single directory of NodeCards,
// filterable by section and by how they run (online / local). It reads the same
// ui/sections.js registry the section pages and the Hub use, so nothing drifts,
// and links out to the two live dynamic surfaces — the Tools & Agents workspace
// (/tools-hub) and the Nodes front door (/nodes/) — rather than re-listing them
// (no fabricated catalogue: real statuses + real destinations only).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SECTIONS } from './sections.js';
import NodeCard from './NodeCard.jsx';

const RUN_FILTERS = [
  { key: 'all',    label: 'All' },
  { key: 'online', label: 'Run online' },
  { key: 'local',  label: 'Run local' },
];

function runMatches(fn, mode) {
  if (mode === 'all') return true;
  if (mode === 'online') return fn.runs === 'online' || fn.runs === 'both';
  if (mode === 'local') return fn.runs === 'local' || fn.runs === 'both';
  return true;
}

export default function FunctionsDirectory() {
  const [sectionKey, setSectionKey] = useState('all');
  const [run, setRun] = useState('all');

  const visibleSections = SECTIONS
    .filter((s) => sectionKey === 'all' || s.key === sectionKey)
    .map((s) => ({ ...s, fns: s.functions.filter((fn) => runMatches(fn, run)) }))
    .filter((s) => s.fns.length > 0);

  const total = visibleSections.reduce((n, s) => n + s.fns.length, 0);

  return (
    <div className="fn-dir">
      <div className="sections-overview-head">
        <div className="eyebrow">Grounded · functions directory</div>
        <h1>Everything you can run</h1>
        <p>
          Every function across the five sections in one place — agents, tools and Nodes.
          Each is labelled honestly (Live / In&nbsp;progress / In&nbsp;development) and shows how it
          runs. The live ones open in place or run online; in-development ones say so.
        </p>
      </div>

      <div className="dir-filters">
        <div className="dir-filter-row">
          <span className="dir-filter-label">Section</span>
          <button className={`dir-chip ${sectionKey === 'all' ? 'active' : ''}`} onClick={() => setSectionKey('all')}>All</button>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`dir-chip ${sectionKey === s.key ? 'active' : ''}`}
              style={{ '--accent': `var(${s.accentVar})` }}
              onClick={() => setSectionKey(s.key)}
            >
              <span className="dir-chip-dot" />{s.label}
            </button>
          ))}
        </div>
        <div className="dir-filter-row">
          <span className="dir-filter-label">Runs</span>
          {RUN_FILTERS.map((r) => (
            <button key={r.key} className={`dir-chip ${run === r.key ? 'active' : ''}`} onClick={() => setRun(r.key)}>
              {r.label}
            </button>
          ))}
          <span className="dir-count">{total} function{total === 1 ? '' : 's'}</span>
        </div>
      </div>

      {visibleSections.map((s) => (
        <div key={s.key} className="section-block">
          <div className="section-head" style={{ '--accent': `var(${s.accentVar})` }}>
            <h1 style={{ fontSize: 20 }}>{s.label}</h1>
          </div>
          <div className="fn-grid">
            {s.fns.map((fn) => <NodeCard key={fn.key} fn={fn} accentVar={s.accentVar} />)}
          </div>
        </div>
      ))}

      {total === 0 && (
        <p style={{ color: 'var(--text-secondary)', padding: 'var(--space-6) 0' }}>
          No functions match this filter.
        </p>
      )}

      {/* The two live, dynamic surfaces — pointed to, not re-listed, so the
          directory never shows a stale or invented catalogue. */}
      <div className="dir-live">
        <Link to="/tools-hub" className="dir-live-card">
          <h3>Tools &amp; Agents workspace →</h3>
          <p>The live, runnable operations tools and journalism agents — use one directly or drop it into a Builder workflow.</p>
        </Link>
        <a href="/nodes/" className="dir-live-card">
          <h3>Nodes front door ↗</h3>
          <p>The Nodes your newsroom can run online or download to run on your own machine, one command.</p>
        </a>
      </div>
    </div>
  );
}
