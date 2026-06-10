// SectionsOverview — the product home for the concept-note-led IA (Phase 1 ·
// step 2). The real replacement for the throwaway /_preview: every section and
// strategic layer, rendered with live/in-progress/in-development statuses from
// ui/sections.js. Cards with a live route are clickable; everything else is an
// honest non-interactive state. No fabricated data.
//
// Step 3 rebuilds the public `/` Hub around this same data; this page is the
// signed-in product's front door.

import { Link } from 'react-router-dom';
import { SECTIONS, LAYERS } from './sections.js';
import SectionLanding from './SectionLanding.jsx';

export default function SectionsOverview() {
  return (
    <div>
      <div className="sections-overview-head">
        <div className="eyebrow">Grounded · the newsroom product</div>
        <h1>Five sections, three strategic layers</h1>
        <p>
          Everything Grounded does for a newsroom, organised the way the concept note frames it.
          Each function is labelled honestly — Live, In&nbsp;progress, or In&nbsp;development — and
          the live ones open in place. Nothing here is placeholder data.
        </p>
        <Link to="/functions" className="hub-card-cta" style={{ display: 'inline-block', marginTop: 'var(--space-3)' }}>
          Browse the full functions directory →
        </Link>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.key} className="section-block">
          <SectionLanding sectionKey={s.key} />
        </div>
      ))}

      <div className="layers-strip">
        <h2>Strategic layers</h2>
        <p>
          The cross-cutting views that sit above the sections — where a newsroom understands its own
          work and chooses what to share. Built once the data that feeds them is real.
        </p>
        <div className="layer-grid">
          {LAYERS.map((l) => (
            <Link key={l.key} to={`/sections/${l.key}`} className="layer-card">
              <h3>{l.label}</h3>
              <p>{l.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
