// Reusable section landing page for the concept-note-led IA.
// Renders one section's header + a grid of its functions as cards. Reads from
// ui/sections.js so the nav, Hub and these pages can never drift.
//
// Phase 1 step 1: this is the SKELETON. Cards don't navigate yet (routes get
// wired in later steps). Live/in-progress/in-development is shown honestly per
// function; nothing here is fabricated.

import { findSection } from './sections.js';
import InDevelopment from './InDevelopment.jsx';
import NodeCard from './NodeCard.jsx';

export default function SectionLanding({ sectionKey }) {
  const section = findSection(sectionKey);
  if (!section) return null;

  // A strategic layer (no functions) → honest empty state.
  if (!section.functions) {
    return (
      <div className="section-landing">
        <div className="section-head" style={{ '--accent': `var(${section.accentVar})` }}>
          <h1>{section.label}</h1>
          <p>{section.blurb}</p>
        </div>
        <InDevelopment
          title={section.label}
          what={section.blurb}
          note="Strategic layer — built once the data that feeds it is real (no placeholder content)."
        />
      </div>
    );
  }

  return (
    <div className="section-landing">
      <div className="section-head" style={{ '--accent': `var(${section.accentVar})` }}>
        <h1>{section.label}</h1>
        <p>{section.blurb}</p>
      </div>
      <div className="fn-grid">
        {section.functions.map((fn) => (
          <NodeCard key={fn.key} fn={fn} accentVar={section.accentVar} />
        ))}
      </div>
    </div>
  );
}
