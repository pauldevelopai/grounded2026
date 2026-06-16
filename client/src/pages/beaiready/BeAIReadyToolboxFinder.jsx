// BeAIReadyToolboxFinder — /toolbox/finder. A rebuild of the AIKit "Tool Finder"
// in BE AI READY style: a short, business-framed wizard that asks what you want
// AI to do and what your constraints are (budget, team skill, data sensitivity),
// then ranks the live catalogue (GET /api/public/toolkit) to a fitted shortlist.
// No backend: it reuses the same 46-tool feed the toolbox loads, so it can never
// drift from the catalogue. Real data only; honest empty states.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const ACCENT = '#c75b39';

// Each constraint maps a friendly answer → a max CDI threshold (lower is better).
// null = no cap. The default (index 0) is "no strong preference".
const BUDGET = [
  { label: "No strong preference", cap: null },
  { label: "Keep it free or cheap", cap: 3 },
  { label: "Some budget is fine", cap: 6 },
];
const SKILL = [
  { label: "No strong preference", cap: null },
  { label: "Keep setup simple", cap: 3 },
  { label: "We can handle a moderate setup", cap: 6 },
];
const DATA = [
  { label: "No strong preference", cap: null },
  { label: "We handle sensitive data — keep exposure low", cap: 3 },
  { label: "Some data exposure is OK", cap: 6 },
];

function cdiColor(v) { return v <= 3 ? '#16a34a' : v <= 6 ? '#b45309' : '#c2410c'; }
function Badge({ label, value }) {
  if (value == null) return null;
  return (
    <div style={{ textAlign: 'center', minWidth: 52 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: cdiColor(value), lineHeight: 1.2 }}>{value}<span style={{ fontSize: 10, color: '#a89e92', fontWeight: 600 }}>/10</span></div>
    </div>
  );
}

// Radio-group of pill buttons.
function Choice({ title, hint, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{title}</div>
      {hint && <div style={{ fontSize: 13, color: '#8a8076', marginBottom: 10 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => onChange(i)}
            style={{
              padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
              border: `1px solid ${value === i ? ACCENT : '#e4dcd2'}`,
              background: value === i ? ACCENT : '#fff', color: value === i ? '#fff' : '#3a342e',
            }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const cdiSum = (t) => (t.cdi_cost ?? 5) + (t.cdi_difficulty ?? 5) + (t.cdi_invasiveness ?? 5);

export default function BeAIReadyToolboxFinder() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);

  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState([]); // chosen category names
  const [budget, setBudget] = useState(0);
  const [skill, setSkill] = useState(0);
  const [data, setData] = useState(0);
  const [saved, setSaved] = useState(false);

  const savePrefs = () => {
    try {
      localStorage.setItem('bair_tool_prefs', JSON.stringify({ categories: picked, cost: BUDGET[budget].cap, diff: SKILL[skill].cap, exp: DATA[data].cap }));
      setSaved(true);
    } catch { /* localStorage unavailable — ignore */ }
  };

  useEffect(() => {
    publicFetch('/public/toolkit')
      .then((res) => { setItems(res.items || []); setCategories(res.categories || []); })
      .catch((e) => { setError(e.message); setItems([]); });
  }, []);

  const toggle = (name) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  // Rank: in-category (or all if none picked) AND within every chosen cap, then
  // by lowest combined CDI. Tools missing a score still appear (treated neutral).
  const results = useMemo(() => {
    if (!items) return [];
    const caps = { cost: BUDGET[budget].cap, diff: SKILL[skill].cap, exp: DATA[data].cap };
    const within = (v, cap) => cap == null || v == null || v <= cap;
    return items
      .filter((t) => picked.length === 0 || picked.includes(t.primary_category))
      .filter((t) => within(t.cdi_cost, caps.cost) && within(t.cdi_difficulty, caps.diff) && within(t.cdi_invasiveness, caps.exp))
      .sort((a, b) => cdiSum(a) - cdiSum(b));
  }, [items, picked, budget, skill, data]);

  const Header = () => (
    <section className="hub-hero">
      <div className="hub-eyebrow">The AI toolbox · find your tool</div>
      <h1>Tell us what you need. We'll shortlist the tools.</h1>
      <p className="hub-lede">
        A two-minute guide to the right AI tools for your business — narrowed to your budget, your team's
        comfort with tech, and how sensitive your data is. <Link to="/toolbox">Or browse all tools →</Link>
      </p>
    </section>
  );

  const Steps = () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 20px', fontSize: 12.5, color: '#8a8076' }}>
      {['What you need', 'Your constraints', 'Your shortlist'].map((s, i) => (
        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999,
            fontWeight: 700, fontSize: 12, color: step >= i + 1 ? '#fff' : '#8a8076',
            background: step >= i + 1 ? ACCENT : '#eee5da',
          }}>{i + 1}</span>
          <span style={{ fontWeight: step === i + 1 ? 700 : 500, color: step === i + 1 ? '#3a342e' : '#8a8076' }}>{s}</span>
          {i < 2 && <span style={{ color: '#d8cdc2' }}>→</span>}
        </span>
      ))}
    </div>
  );

  if (error) return <div className="hub hub-beaiready"><Header /><div style={{ color: '#991B1B' }}>{error}</div></div>;
  if (items == null) return <div className="hub hub-beaiready"><Header /><div style={{ color: '#8a8076' }}>Loading the toolbox…</div></div>;

  return (
    <div className="hub hub-beaiready">
      <Header />
      <Steps />

      {step === 1 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>What do you want AI to help with?</div>
          <div style={{ fontSize: 13.5, color: '#8a8076', marginBottom: 14 }}>
            Pick one or more. Skip this and we'll consider everything.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 10 }}>
            {categories.map((c) => {
              const on = picked.includes(c.name);
              return (
                <button key={c.name} onClick={() => toggle(c.name)}
                  style={{
                    textAlign: 'left', padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${on ? ACCENT : '#eee5da'}`, borderLeft: `3px solid ${on ? ACCENT : '#eee5da'}`,
                    background: on ? '#fbf2ee' : '#fff',
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: '#3a342e' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#8a8076', marginTop: 3 }}>{c.count} tool{c.count === 1 ? '' : 's'}{on ? ' · selected' : ''}</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(2)} className="hub-btn hub-btn-solid">Next: your constraints →</button>
            {picked.length > 0 && <button onClick={() => setPicked([])} className="hub-btn hub-btn-ghost">Clear ({picked.length})</button>}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <Choice title="What's your budget for tools?" options={BUDGET} value={budget} onChange={setBudget} />
          <Choice title="How comfortable is your team with new tech?" options={SKILL} value={skill} onChange={setSkill} />
          <Choice title="How sensitive is the data you'd put into it?" hint="Lower data exposure means less of your information leaves your control." options={DATA} value={data} onChange={setData} />
          <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} className="hub-btn hub-btn-ghost">← Back</button>
            <button onClick={() => setStep(3)} className="hub-btn hub-btn-solid">See my shortlist →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {results.length === 0 ? 'No exact matches' : `Your shortlist · ${results.length} tool${results.length === 1 ? '' : 's'}`}
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              {results.length > 0 && (
                <button onClick={savePrefs} style={{ border: 'none', background: 'none', color: saved ? '#166534' : ACCENT, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  {saved ? '✓ Saved to For You' : 'Save as my preferences'}
                </button>
              )}
              <button onClick={() => { setStep(1); setPicked([]); setBudget(0); setSkill(0); setData(0); setSaved(false); }}
                style={{ border: 'none', background: 'none', color: '#8a8076', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Start over</button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#8a8076', marginBottom: 16 }}>
            {picked.length > 0 ? <>For <strong>{picked.join(', ')}</strong>. </> : 'Across all categories. '}
            Ranked best-fit first (lowest combined cost, difficulty and data exposure).
          </div>

          {results.length === 0 ? (
            <div className="hub-band">
              Nothing fits all your constraints. <button onClick={() => setStep(2)} style={{ border: 'none', background: 'none', color: ACCENT, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Loosen them</button> or <Link to="/toolbox">browse the full toolbox</Link>.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 12 }}>
              {results.map((t, i) => (
                <div key={t.slug} onClick={() => navigate(`/toolbox/${t.slug}`)}
                  style={{ background: '#fff', border: '1px solid #eee5da', borderLeft: `3px solid ${ACCENT}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    {t.primary_category && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT, background: '#f7ece7', padding: '2px 8px', borderRadius: 999 }}>{t.primary_category}</span>}
                    {i === 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a' }}>★ best fit</span>}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px' }}>{t.name}</div>
                  {t.description && <div style={{ fontSize: 13, color: '#5b5249', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</div>}
                  <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                    <Badge label="Cost" value={t.cdi_cost} />
                    <Badge label="Effort" value={t.cdi_difficulty} />
                    <Badge label="Data" value={t.cdi_invasiveness} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
