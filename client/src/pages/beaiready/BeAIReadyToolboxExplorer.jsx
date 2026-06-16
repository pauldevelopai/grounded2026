// BeAIReadyToolboxExplorer — /toolbox/explore. A rebuild of the AIKit "CDI
// Explorer" in BE AI READY style: an interactive scatter of every tool across
// two of the three CDI dimensions (Cost / Difficulty / Data exposure), coloured
// by the third, with a "sweet spot" (low-low) corner highlighted. Click any
// point to open the tool. Reuses GET /api/public/toolkit — no backend. The whole
// point: see the trade-offs at a glance and find the low-cost, low-effort,
// low-exposure tools. Real data only.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const ACCENT = '#c75b39';
const DIMS = [
  { key: 'cdi_cost', label: 'Cost' },
  { key: 'cdi_difficulty', label: 'Difficulty' },
  { key: 'cdi_invasiveness', label: 'Data exposure' },
];
const cdiColor = (v) => (v == null ? '#c9c1b6' : v <= 3 ? '#16a34a' : v <= 6 ? '#b45309' : '#c2410c');

// SVG geometry: a 0–10 plot with margins for axes/labels.
const PAD = { l: 46, r: 16, t: 16, b: 44 };
const PLOT = 320; // square plot area in px
const W = PAD.l + PLOT + PAD.r;
const H = PAD.t + PLOT + PAD.b;
const sx = (v) => PAD.l + (v / 10) * PLOT;            // value → x px
const sy = (v) => PAD.t + (1 - v / 10) * PLOT;        // value → y px (inverted)
// Deterministic tiny jitter so co-located tools don't perfectly stack.
const jit = (slug, salt) => { let h = salt; for (const c of slug) h = (h * 31 + c.charCodeAt(0)) % 97; return ((h / 97) - 0.5) * 0.5; };

export default function BeAIReadyToolboxExplorer() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [xKey, setXKey] = useState('cdi_difficulty');
  const [yKey, setYKey] = useState('cdi_cost');
  const [cat, setCat] = useState('all');
  const [hover, setHover] = useState(null);

  useEffect(() => {
    publicFetch('/public/toolkit')
      .then((res) => { setItems(res.items || []); setCategories(res.categories || []); })
      .catch((e) => { setError(e.message); setItems([]); });
  }, []);

  const colorKey = DIMS.find((d) => d.key !== xKey && d.key !== yKey)?.key || 'cdi_invasiveness';
  const xLabel = DIMS.find((d) => d.key === xKey)?.label;
  const yLabel = DIMS.find((d) => d.key === yKey)?.label;
  const colorLabel = DIMS.find((d) => d.key === colorKey)?.label;

  const points = useMemo(() => {
    if (!items) return [];
    return items
      .filter((t) => cat === 'all' || t.primary_category === cat)
      .filter((t) => t[xKey] != null && t[yKey] != null)
      .map((t) => ({ t, x: sx(t[xKey] + jit(t.slug, 7)), y: sy(t[yKey] + jit(t.slug, 13)), c: cdiColor(t[colorKey]) }));
  }, [items, cat, xKey, yKey, colorKey]);

  const Header = () => (
    <section className="hub-hero">
      <div className="hub-eyebrow">The AI toolbox · explore the trade-offs</div>
      <h1>Every tool, mapped by what it costs you.</h1>
      <p className="hub-lede">
        Cost, difficulty and data exposure — scored 0–10, lower is better. The bottom-left corner is the
        sweet spot: cheap, simple, and low-exposure. Click any tool to open it. <Link to="/toolbox">Browse the list →</Link>
      </p>
    </section>
  );

  if (error) return <div className="hub hub-beaiready"><Header /><div style={{ color: '#991B1B' }}>{error}</div></div>;
  if (items == null) return <div className="hub hub-beaiready"><Header /><div style={{ color: '#8a8076' }}>Loading the toolbox…</div></div>;

  const Sel = ({ label, value, onChange, options }) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: '#8a8076' }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ padding: '8px 11px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13.5, background: '#fff', fontFamily: 'inherit' }}>
        {options}
      </select>
    </label>
  );

  return (
    <div className="hub hub-beaiready">
      <Header />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <Sel label="Horizontal axis" value={xKey} onChange={setXKey}
          options={DIMS.map((d) => <option key={d.key} value={d.key} disabled={d.key === yKey}>{d.label}</option>)} />
        <Sel label="Vertical axis" value={yKey} onChange={setYKey}
          options={DIMS.map((d) => <option key={d.key} value={d.key} disabled={d.key === xKey}>{d.label}</option>)} />
        <Sel label="Category" value={cat} onChange={setCat}
          options={[<option key="all" value="all">All ({items.length})</option>, ...categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)]} />
        <div style={{ fontSize: 12, color: '#8a8076', paddingBottom: 8 }}>Point colour = <strong style={{ color: '#3a342e' }}>{colorLabel}</strong> · {points.length} tools</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 10, overflow: 'hidden' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: 520 }} role="img" aria-label={`Tools plotted by ${xLabel} and ${yLabel}`}>
            {/* sweet-spot (0–3, 0–3) */}
            <rect x={sx(0)} y={sy(3)} width={sx(3) - sx(0)} height={sy(0) - sy(3)} fill="#16a34a" opacity="0.07" />
            <text x={sx(0) + 5} y={sy(0) - 6} fontSize="9" fill="#16a34a" fontWeight="700">sweet spot</text>
            {/* gridlines + ticks */}
            {[0, 2, 4, 6, 8, 10].map((n) => (
              <g key={n}>
                <line x1={sx(n)} y1={PAD.t} x2={sx(n)} y2={PAD.t + PLOT} stroke="#f1ece5" />
                <line x1={PAD.l} y1={sy(n)} x2={PAD.l + PLOT} y2={sy(n)} stroke="#f1ece5" />
                <text x={sx(n)} y={PAD.t + PLOT + 16} fontSize="9" fill="#a89e92" textAnchor="middle">{n}</text>
                <text x={PAD.l - 8} y={sy(n) + 3} fontSize="9" fill="#a89e92" textAnchor="end">{n}</text>
              </g>
            ))}
            {/* axis labels */}
            <text x={PAD.l + PLOT / 2} y={H - 6} fontSize="11" fill="#6b6359" textAnchor="middle" fontWeight="700">{xLabel} →</text>
            <text x={12} y={PAD.t + PLOT / 2} fontSize="11" fill="#6b6359" textAnchor="middle" fontWeight="700" transform={`rotate(-90 12 ${PAD.t + PLOT / 2})`}>{yLabel} →</text>
            {/* points */}
            {points.map((p) => (
              <circle key={p.t.slug + p.t.primary_category} cx={p.x} cy={p.y} r={hover === p.t.slug ? 8 : 5.5}
                fill={p.c} stroke="#fff" strokeWidth="1.5" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(p.t.slug)} onMouseLeave={() => setHover(null)}
                onClick={() => navigate(`/toolbox/${p.t.slug}`)}>
                <title>{p.t.name} — {xLabel} {p.t[xKey]}, {yLabel} {p.t[yKey]}, {colorLabel} {p.t[colorKey]}</title>
              </circle>
            ))}
          </svg>
          {/* colour legend */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 11.5, color: '#6b6359', marginTop: 4 }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#16a34a', marginRight: 5 }} />0–3 low</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#b45309', marginRight: 5 }} />4–6 medium</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#c2410c', marginRight: 5 }} />7–10 high</span>
          </div>
        </div>

        {/* hovered tool / hint panel */}
        <div style={{ width: 220, minHeight: 120 }}>
          {hover ? (() => {
            const t = items.find((x) => x.slug === hover);
            if (!t) return null;
            return (
              <div style={{ background: '#fff', border: '1px solid #eee5da', borderLeft: `3px solid ${ACCENT}`, borderRadius: 10, padding: '14px 16px' }}>
                {t.primary_category && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT }}>{t.primary_category}</span>}
                <div style={{ fontSize: 15.5, fontWeight: 700, margin: '6px 0 8px' }}>{t.name}</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {DIMS.map((d) => (
                    <div key={d.key} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase' }}>{d.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: cdiColor(t[d.key]) }}>{t[d.key] ?? '–'}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate(`/toolbox/${t.slug}`)} className="hub-btn hub-btn-solid" style={{ marginTop: 12, width: '100%' }}>Open {t.name} →</button>
              </div>
            );
          })() : (
            <div style={{ background: '#faf6f3', border: '1px dashed #e4dcd2', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#8a8076', lineHeight: 1.6 }}>
              Hover a dot to see the tool and its scores. Click to open it.
              The closer to the <strong style={{ color: '#16a34a' }}>bottom-left</strong>, the easier and safer the win.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
