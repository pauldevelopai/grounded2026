// BeAIReadyToolbox — /toolbox on the BE AI READY site.
// The comprehensive GROUNDED/AIKit toolkit (GET /api/public/toolkit), replicated
// in BE AI READY style: search + category, and the AIKit toolbox's multi-dimensional
// filters — Max Cost / Max Difficulty / Max Data-exposure (each scored 0–10, lower
// is better) — plus a per-tool detail page (/toolbox/:slug). Loads the catalogue once
// and filters client-side (≈46 tools).
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import { apiFetch } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

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
        <ToolPlaybook slug={tool.slug} />
        <ToolReviews slug={tool.slug} />
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #eee5da', fontSize: 11, color: '#a89e92' }}>
          From the Develop&nbsp;AI toolkit · scored for cost, difficulty and data exposure.
        </div>
      </div>
    </div>
  );
}

function Stars({ value, onPick, size = 18 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={onPick ? () => onPick(n) : undefined}
          style={{ cursor: onPick ? 'pointer' : 'default', color: n <= value ? '#e0a52e' : '#d8cfc4', fontSize: size, lineHeight: 1 }}>★</span>
      ))}
    </span>
  );
}

// Published playbook for a tool (null → renders nothing).
function ToolPlaybook({ slug }) {
  const [pb, setPb] = useState(null);
  useEffect(() => { publicFetch(`/public/toolkit/${slug}/playbook`).then(setPb).catch(() => setPb(null)); }, [slug]);
  if (!pb) return null;
  const Row = ({ label, text }) => (!text ? null : (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#3a342e' }}>{label}</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: '#3a342e', lineHeight: 1.6 }}>{text}</div>
    </div>
  ));
  return (
    <div style={{ marginTop: 20, background: '#faf6f3', border: '1px solid #eee5da', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Playbook · getting value fast</div>
      {Array.isArray(pb.key_features) && pb.key_features.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {pb.key_features.map((f, i) => <span key={i} style={{ fontSize: 11.5, color: '#7a4636', background: '#f7ece7', padding: '2px 9px', borderRadius: 999 }}>{f}</span>)}
        </div>
      )}
      <Row label="Best uses" text={pb.best_use_cases} />
      <Row label="How to start" text={pb.implementation_steps} />
      <Row label="Common mistakes" text={pb.common_mistakes} />
      <Row label="Privacy notes" text={pb.privacy_notes} />
    </div>
  );
}

// Reviews block: public stats + list, plus a write/vote/flag UI for signed-in users.
function ToolReviews({ slug }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);   // { stats, reviews }
  const [mine, setMine] = useState(undefined);
  const [form, setForm] = useState({ rating: 0, comment: '', use_case: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const loadPublic = () => publicFetch(`/public/toolkit/${slug}/reviews`).then(setData).catch(() => setData({ stats: { count: 0, avg: 0, dist: {} }, reviews: [] }));
  useEffect(() => { loadPublic(); }, [slug]);
  useEffect(() => {
    if (!user) { setMine(null); return; }
    apiFetch(`/toolkit/${slug}/reviews/mine`).then((m) => { setMine(m); if (m) setForm({ rating: m.rating, comment: m.comment || '', use_case: m.use_case || '' }); }).catch(() => setMine(null));
  }, [slug, user]);

  const submit = async () => {
    if (!form.rating) { setErr('Pick a star rating first.'); return; }
    setBusy(true); setErr(null);
    try { await apiFetch(`/toolkit/${slug}/reviews`, { method: 'POST', body: JSON.stringify(form) }); await loadPublic(); setMine(await apiFetch(`/toolkit/${slug}/reviews/mine`)); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async () => { if (!window.confirm('Delete your review?')) return; try { await apiFetch(`/toolkit/${slug}/reviews`, { method: 'DELETE' }); setMine(null); setForm({ rating: 0, comment: '', use_case: '' }); loadPublic(); } catch (e) { setErr(e.message); } };
  const vote = async (id) => { try { await apiFetch(`/toolkit/reviews/${id}/vote`, { method: 'POST', body: JSON.stringify({ is_helpful: true }) }); loadPublic(); } catch (e) { setErr(e.message); } };
  const flag = async (id) => { const reason = window.prompt('Why are you flagging this review? (optional)'); if (reason === null) return; try { await apiFetch(`/toolkit/reviews/${id}/flag`, { method: 'POST', body: JSON.stringify({ reason }) }); window.alert('Thanks — flagged for review.'); } catch (e) { setErr(e.message); } };

  if (!data) return null;
  const { stats, reviews } = data;

  return (
    <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid #eee5da' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reviews</div>
        {stats.count > 0 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Stars value={Math.round(stats.avg)} /> <strong style={{ fontSize: 14 }}>{stats.avg}</strong> <span style={{ fontSize: 12.5, color: '#8a8076' }}>· {stats.count} review{stats.count === 1 ? '' : 's'}</span></span>
        ) : <span style={{ fontSize: 12.5, color: '#8a8076' }}>No reviews yet — be the first.</span>}
      </div>

      {err && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 8 }}>{err}</div>}

      {/* write / edit */}
      {user ? (
        <div style={{ marginTop: 12, background: '#fff', border: '1px solid #eee5da', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{mine ? 'Your review' : 'Rate this tool'}</span>
            <Stars value={form.rating} onPick={(n) => setForm((f) => ({ ...f, rating: n }))} size={20} />
          </div>
          <input value={form.use_case} onChange={(e) => setForm((f) => ({ ...f, use_case: e.target.value }))} placeholder="What did you use it for? (optional)" style={{ ...INP, width: '100%', marginTop: 8 }} />
          <textarea value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} placeholder="Your experience (optional)" style={{ ...INP, width: '100%', marginTop: 8, minHeight: 56, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={submit} disabled={busy} className="hub-btn hub-btn-solid" style={{ padding: '7px 14px', fontSize: 13 }}>{busy ? 'Saving…' : mine ? 'Update review' : 'Post review'}</button>
            {mine && <button onClick={del} style={{ background: 'none', border: '1px solid #f0c9c9', color: '#b91c1c', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>Delete</button>}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: '#6b6359', marginTop: 8 }}><a href="/login" style={{ color: ACCENT }}>Sign in</a> to rate this tool and read your team's reviews.</p>
      )}

      {/* list */}
      {reviews.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {reviews.map((r) => (
            <div key={r.id} style={{ background: '#fff', border: '1px solid #f1ece5', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Stars value={r.rating} size={14} />
                  <strong style={{ fontSize: 13 }}>{r.author_name || 'A user'}</strong>
                  {r.use_case && <span style={{ fontSize: 11, color: '#7a4636', background: '#f7ece7', padding: '1px 7px', borderRadius: 999 }}>{r.use_case}</span>}
                </span>
                <span style={{ fontSize: 11.5, color: '#a89e92' }}>{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.comment && <p style={{ fontSize: 13.5, color: '#3a342e', margin: '6px 0 0', lineHeight: 1.55 }}>{r.comment}</p>}
              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: '#8a8076' }}>
                <span>{r.helpful_count > 0 ? `${r.helpful_count} found this helpful` : ''}</span>
                {user && mine?.id !== r.id && (
                  <span style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => vote(r.id)} style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontSize: 12, padding: 0 }}>Helpful</button>
                    <button onClick={() => flag(r.id)} style={{ background: 'none', border: 'none', color: '#a89e92', cursor: 'pointer', fontSize: 12, padding: 0 }}>Flag</button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
          Every AI tool worth knowing, in one place — each rated on Cost, Difficulty and Data exposure
          (0–10, lower is better). Filter to what fits your budget, your team's skill, and how much data
          you're willing to expose. Audit clients get this mapped to their own business functions.
        </p>
        <div className="hub-hero-cta" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <Link to="/toolbox/finder" className="hub-btn hub-btn-solid">Not sure where to start? Find your tool →</Link>
          <Link to="/toolbox/ask" className="hub-btn hub-btn-ghost">Ask the toolbox →</Link>
          <Link to="/toolbox/explore" className="hub-btn hub-btn-ghost">Explore the trade-offs →</Link>
          <Link to="/toolbox/for-you" className="hub-btn hub-btn-ghost">For you →</Link>
        </div>
      </section>

      {/* Browse by need — the business categories, each a guided landing. */}
      {categories.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div className="hub-section-label">Browse by need</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 10 }}>
            {categories.map((c) => (
              <Link key={c.name} to={`/toolbox/category/${encodeURIComponent(c.name)}`}
                style={{ textDecoration: 'none', color: 'inherit', background: '#fff', border: '1px solid #eee5da', borderLeft: `3px solid ${ACCENT}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#3a342e' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#8a8076', marginTop: 2 }}>{c.count} tool{c.count === 1 ? '' : 's'} →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

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
      <div style={{ marginBottom: 14, fontSize: 12, color: '#8a8076', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>{visible.length} of {all.length} tools</span>
        <Link to="/toolbox/suggest" style={{ color: ACCENT, fontWeight: 600 }}>Know a tool we're missing? Suggest it →</Link>
      </div>

      {items == null && <div style={{ color: '#8a8076' }}>Loading the toolbox…</div>}
      {error && <div style={{ color: '#991B1B' }}>{error}</div>}
      {items != null && visible.length === 0 && <p style={{ color: '#8a8076' }}>No tools match these filters.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {visible.map((t) => <ToolCard key={t.slug} t={t} onSelect={() => navigate(`/toolbox/${t.slug}`)} />)}
      </div>
    </div>
  );
}
