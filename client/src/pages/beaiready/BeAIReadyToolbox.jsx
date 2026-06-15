// BeAIReadyToolbox — /toolbox on the BE AI READY site.
// The comprehensive GROUNDED/AIKit toolkit (GET /api/public/toolkit), replicated
// in BE AI READY style: search + category, and the AIKit toolbox's multi-dimensional
// filters — Max Cost / Max Difficulty / Max Data-exposure (each scored 0–10, lower
// is better) — plus a per-tool detail page (/toolbox/:slug). Loads the catalogue once
// and filters client-side (≈46 tools).
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const ACCENT = '#c75b39';
const THRESHOLDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const INP = { padding: '8px 11px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13.5, background: '#fff', fontFamily: 'inherit' };

function cdiColor(v) { return v <= 3 ? '#16a34a' : v <= 6 ? '#b45309' : '#c2410c'; }

function CdiBadge({ label, value }) {
  if (value === null || value === undefined) return null;
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cdiColor(value), lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#a89e92' }}>/ 10</div>
    </div>
  );
}

function ThreshSelect({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: '#8a8076' }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={INP}>
        <option value="">Any</option>
        {THRESHOLDS.map((n) => <option key={n} value={n}>≤ {n}/10</option>)}
      </select>
    </label>
  );
}

function ToolCard({ t, onSelect }) {
  return (
    <div onClick={onSelect}
      style={{ background: '#fff', border: '1px solid #eee5da', borderLeft: `3px solid ${ACCENT}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
      {t.primary_category && (
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT, background: '#f7ece7', padding: '2px 8px', borderRadius: 999 }}>{t.primary_category}</span>
      )}
      <div style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px' }}>{t.name}</div>
      {t.description && (
        <div style={{ fontSize: 13, color: '#5b5249', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {t.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        <CdiBadge label="Cost" value={t.cdi_cost} />
        <CdiBadge label="Difficulty" value={t.cdi_difficulty} />
        <CdiBadge label="Data exposure" value={t.cdi_invasiveness} />
      </div>
      {Array.isArray(t.tags) && t.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
          {t.tags.slice(0, 4).map((tag) => (
            <span key={tag} style={{ fontSize: 10.5, color: '#6b6359', background: '#f1f0ec', padding: '1px 7px', borderRadius: 999 }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolDetail({ slug, onBack }) {
  const [tool, setTool] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    publicFetch(`/public/toolkit/${slug}`).then(setTool).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div style={{ color: '#991B1B' }}>{error}</div>;
  if (!tool) return <div style={{ color: '#8a8076' }}>Loading…</div>;

  const Section = ({ label, children }) => (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: '#3a342e' }}>{children}</div>
    </div>
  );

  return (
    <div className="hub hub-beaiready">
      <a href="/toolbox" onClick={(e) => { e.preventDefault(); onBack(); }} style={{ color: '#8a8076', fontSize: 13, textDecoration: 'none' }}>← All tools</a>
      <div style={{ background: '#fff', border: '1px solid #eee5da', borderLeft: `3px solid ${ACCENT}`, borderRadius: 12, padding: '20px 24px', marginTop: 12 }}>
        {tool.primary_category && (
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT, background: '#f7ece7', padding: '2px 8px', borderRadius: 999 }}>{tool.primary_category}</span>
        )}
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '10px 0 8px', letterSpacing: '-0.01em' }}>{tool.name}</h1>
        {tool.url && (
          <a href={tool.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: ACCENT, textDecoration: 'none' }}>{tool.url} ↗</a>
        )}
        {(tool.cdi_cost != null || tool.cdi_difficulty != null || tool.cdi_invasiveness != null) && (
          <div style={{ marginTop: 18, padding: '14px 16px', background: '#faf6f3', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              CDI · Cost / Difficulty / Data exposure (lower is better)
            </div>
            <div style={{ display: 'flex', gap: 32 }}>
              <CdiBadge label="Cost" value={tool.cdi_cost} />
              <CdiBadge label="Difficulty" value={tool.cdi_difficulty} />
              <CdiBadge label="Data exposure" value={tool.cdi_invasiveness} />
            </div>
          </div>
        )}
        {tool.description && <Section label="Description">{tool.description}</Section>}
        {tool.purpose && <Section label="Purpose">{tool.purpose}</Section>}
        {tool.comments && <Section label="Practical notes">{tool.comments}</Section>}
        {(tool.time_saved || tool.time_reinvestment) && (
          <Section label="Time it buys back">
            {tool.time_saved && <div style={{ fontWeight: 600 }}>{tool.time_saved}</div>}
            {tool.time_reinvestment && <div style={{ marginTop: 4, color: '#5b5249' }}>Reinvest it: {tool.time_reinvestment}</div>}
          </Section>
        )}
        {(tool.sovereign_alternative_resolved || (tool.similar_tools_resolved && tool.similar_tools_resolved.length > 0)) && (
          <Section label="Alternatives">
            {tool.sovereign_alternative_resolved && (
              <div>Privacy-first alternative: <Link to={`/toolbox/${tool.sovereign_alternative_resolved.slug}`} style={{ color: ACCENT }}>{tool.sovereign_alternative_resolved.name}</Link></div>
            )}
            {tool.similar_tools_resolved?.length > 0 && (
              <div style={{ marginTop: tool.sovereign_alternative_resolved ? 4 : 0 }}>
                Similar tools: {tool.similar_tools_resolved.map((a, i) => (
                  <span key={a.slug}>{i > 0 ? ', ' : ''}<Link to={`/toolbox/${a.slug}`} style={{ color: ACCENT }}>{a.name}</Link></span>
                ))}
              </div>
            )}
          </Section>
        )}
        {Array.isArray(tool.tags) && tool.tags.length > 0 && (
          <Section label="Tags">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tool.tags.map((t) => <span key={t} style={{ fontSize: 12, color: '#6b6359', background: '#f1f0ec', padding: '2px 9px', borderRadius: 999 }}>{t}</span>)}
            </div>
          </Section>
        )}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #eee5da', fontSize: 11, color: '#a89e92' }}>
          From the Develop&nbsp;AI toolkit · scored for cost, difficulty and data exposure.
        </div>
      </div>
    </div>
  );
}

export default function BeAIReadyToolbox({ mode = 'list' }) {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [maxCost, setMaxCost] = useState('');
  const [maxDiff, setMaxDiff] = useState('');
  const [maxExp, setMaxExp] = useState('');

  useEffect(() => {
    if (mode !== 'list') return;
    publicFetch('/public/toolkit')
      .then((res) => { setItems(res.items || []); setCategories(res.categories || []); })
      .catch((e) => { setError(e.message); setItems([]); });
  }, [mode]);

  if (mode === 'detail') return <ToolDetail slug={slug} onBack={() => navigate('/toolbox')} />;

  const lte = (v, max) => max === '' || (v != null && v <= Number(max));
  const all = items || [];
  const visible = all.filter((t) =>
    (category === 'all' || t.primary_category === category) &&
    lte(t.cdi_cost, maxCost) && lte(t.cdi_difficulty, maxDiff) && lte(t.cdi_invasiveness, maxExp) &&
    (!search || `${t.name} ${t.description || ''} ${t.primary_category || ''}`.toLowerCase().includes(search.toLowerCase()))
  );
  const anyFilter = category !== 'all' || maxCost || maxDiff || maxExp || search;
  const clear = () => { setCategory('all'); setMaxCost(''); setMaxDiff(''); setMaxExp(''); setSearch(''); };

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The active AI toolbox</div>
        <h1>The right tool — scored for cost, effort and data safety.</h1>
        <p className="hub-lede">
          The comprehensive AI toolbox we maintain in Grounded, in one place: every tool rated on Cost,
          Difficulty and Data exposure (0–10, lower is better). Filter to what fits your budget, your team's
          skill, and how much data you're willing to expose. Audit clients get this mapped to their own functions.
        </p>
      </section>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: '#8a8076', flex: '1 1 220px' }}>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools…" style={INP} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: '#8a8076' }}>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={INP}>
            <option value="all">All ({all.length})</option>
            {categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </select>
        </label>
        <ThreshSelect label="Max cost" value={maxCost} onChange={setMaxCost} />
        <ThreshSelect label="Max difficulty" value={maxDiff} onChange={setMaxDiff} />
        <ThreshSelect label="Max data exposure" value={maxExp} onChange={setMaxExp} />
        {anyFilter && <button onClick={clear} style={{ ...INP, cursor: 'pointer', color: ACCENT, fontWeight: 700 }}>Clear</button>}
      </div>
      <div style={{ marginBottom: 14, fontSize: 12, color: '#8a8076' }}>{visible.length} of {all.length} tools</div>

      {items == null && <div style={{ color: '#8a8076' }}>Loading the toolbox…</div>}
      {error && <div style={{ color: '#991B1B' }}>{error}</div>}
      {items != null && visible.length === 0 && <p style={{ color: '#8a8076' }}>No tools match these filters.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {visible.map((t) => <ToolCard key={t.slug} t={t} onSelect={() => navigate(`/toolbox/${t.slug}`)} />)}
      </div>
    </div>
  );
}
