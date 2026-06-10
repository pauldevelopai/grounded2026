// SectionRoute — renders one section's landing page from the :key URL param.
// Unknown keys fall back to the sections overview so the nav can never 404.

import { useParams, Navigate } from 'react-router-dom';
import { findSection } from './sections.js';
import SectionLanding from './SectionLanding.jsx';

export default function SectionRoute() {
  const { key } = useParams();
  if (!findSection(key)) return <Navigate to="/sections" replace />;
  return <SectionLanding sectionKey={key} />;
}
