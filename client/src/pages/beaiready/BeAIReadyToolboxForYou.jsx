// BeAIReadyToolboxForYou — /toolbox/for-you. A rebuild of AIKit's personalised
// recommendations, without an LLM: it reads the preferences you saved from the
// Finder (category interests + budget/skill/data caps, in localStorage) and
// ranks the live catalogue to them. No saved prefs → it points you to the Finder.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const ACCENT = '#c75b39';
const PREFS_KEY = 'bair_tool_prefs';
const cdiColor = (v) => (v == null ? '#c9c1b6' : v <= 3 ? '#16a34a' : v <= 6 ? '#b45309' : '#c2410c');
const cdiSum = (t) => (t.cdi_cost ?? 5) + (t.cdi_difficulty ?? 5) + (t.cdi_invasiveness ?? 5);

function readPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY)); return p && typeof p === 'object' ? p : null; }
  catch { return null; }
}

export default function BeAIReadyToolboxForYou() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [prefs] = useState(readPrefs);

  useEffect(() => { publicFetch('/public/toolkit').then((r) => setItems(r.items || [])).catch(() => setItems([])); }, []);

  const results = useMemo(() => {
    if (!items || !prefs) return [];
    const within = (v, cap) => cap == null || v == null || v <= cap;
    return items
      .filter((t) => !prefs.categories?.length || prefs.categories.includes(t.primary_category))
      .filter((t) => within(t.cdi_cost, prefs.cost) && within(t.cdi_difficulty, prefs.diff) && within(t.cdi_invasiveness, prefs.exp))
      .sort((a, b) => cdiSum(a) - cdiSum(b))
      .slice(0, 12);
  }, [items, prefs]);

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The AI toolbox · for you</div>
        <h1>Picked for how your business works.</h1>
        <p className="hub-lede">
          Recommendations based on the preferences you set in the Finder — your areas of interest and your
          limits on cost, effort and data exposure. <Link to="/toolbox/finder">Adjust them in the Finder →</Link>
        </p>
      </section>

      {!prefs ? (
        <div className="hub-band">
          You haven't set your preferences yet. <Link to="/toolbox/finder" style={{ color: ACCENT, fontWeight: 600 }}>Run the Finder</Link> and tap "Save as my preferences" to get a personalised shortlist here.
        </div>
      ) : items == null ? (
        <div style={{ color: '#8a8076' }}>Loading…</div>
      ) : results.length === 0 ? (
        <div className="hub-band">Your saved preferences don't match anything right now. <Link to="/toolbox/finder" style={{ color: ACCENT, fontWeight: 600 }}>Loosen them in the Finder</Link>.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#8a8076', marginBottom: 14 }}>
            {prefs.categories?.length ? <>Focused on <strong>{prefs.categories.join(', ')}</strong>. </> : 'Across all areas. '}Best fit first.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 12 }}>
            {results.map((t) => (
              <div key={t.slug} onClick={() => navigate(`/toolbox/${t.slug}`)}
                style={{ background: '#fff', border: '1px solid #eee5da', borderLeft: `3px solid ${ACCENT}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
                {t.primary_category && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT, background: '#f7ece7', padding: '2px 8px', borderRadius: 999 }}>{t.primary_category}</span>}
                <div style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px' }}>{t.name}</div>
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
        </>
      )}
    </div>
  );
}
