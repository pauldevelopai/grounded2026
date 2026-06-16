// BeAIReadyToolboxCategory — /toolbox/category/:name. A rebuild of AIKit's
// cluster guidance, reframed for business: a short plain intro to what a category
// is for, then the tools in it (best-fit first). Intros are factual descriptions
// of the category — not claims about any specific tool.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const ACCENT = '#c75b39';
const cdiColor = (v) => (v == null ? '#c9c1b6' : v <= 3 ? '#16a34a' : v <= 6 ? '#b45309' : '#c2410c');
const cdiSum = (t) => (t.cdi_cost ?? 5) + (t.cdi_difficulty ?? 5) + (t.cdi_invasiveness ?? 5);

// Business intros, keyed by the business category. Factual category descriptions.
export const CATEGORY_INTROS = {
  'Writing & Content': 'Draft, edit, summarise and repurpose text — emails, proposals, reports, blog posts and social copy. These tools get you from blank page to a solid first draft in a fraction of the time.',
  'Research & Fact-Checking': 'Check facts, vet partners and suppliers, and dig through public records and documents before you commit. Useful for due diligence, background checks and getting the details right.',
  'Meetings, Transcription & Translation': 'Turn calls, meetings and recordings into accurate text and notes, and bridge language gaps with clients and suppliers — so nothing said gets lost.',
  'Audio, Video & Marketing': 'Produce and edit images, audio, video and social content without a full production team — the visual and marketing side of the business.',
  'Automation & AI Agents': 'Connect your apps and let AI handle repetitive, multi-step work: moving data between systems, triaging requests, and running routine processes with little supervision.',
  'Security & Privacy': 'Protect your accounts, files and communications, and reduce the data you expose when you work with AI and the web. Lower-risk by design.',
  'Build Your Own Tools': 'Go beyond off-the-shelf apps and build custom tools, assistants and small apps tailored to how your business actually works — often with little or no code.',
};

export default function BeAIReadyToolboxCategory() {
  const navigate = useNavigate();
  const { name } = useParams();
  const decoded = decodeURIComponent(name || '');
  const [items, setItems] = useState(null);

  useEffect(() => { publicFetch('/public/toolkit').then((r) => setItems(r.items || [])).catch(() => setItems([])); }, []);

  const tools = useMemo(() => (items || []).filter((t) => t.primary_category === decoded).sort((a, b) => cdiSum(a) - cdiSum(b)), [items, decoded]);
  const intro = CATEGORY_INTROS[decoded] || 'Tools in this category, scored for cost, difficulty and data exposure.';

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The AI toolbox · {decoded}</div>
        <h1>{decoded}</h1>
        <p className="hub-lede">{intro} <Link to="/toolbox">← All categories</Link></p>
      </section>

      {items == null ? <div style={{ color: '#8a8076' }}>Loading…</div> : tools.length === 0 ? (
        <div className="hub-band">No tools in this category yet. <Link to="/toolbox" style={{ color: ACCENT, fontWeight: 600 }}>Browse the toolbox</Link>.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 12 }}>
          {tools.map((t) => (
            <div key={t.slug} onClick={() => navigate(`/toolbox/${t.slug}`)}
              style={{ background: '#fff', border: '1px solid #eee5da', borderLeft: `3px solid ${ACCENT}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
              {t.description && <div style={{ fontSize: 13, color: '#5b5249', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</div>}
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                {[['Cost', t.cdi_cost], ['Effort', t.cdi_difficulty], ['Data', t.cdi_invasiveness]].map(([l, v]) => (
                  <div key={l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase' }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: cdiColor(v) }}>{v ?? '–'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
