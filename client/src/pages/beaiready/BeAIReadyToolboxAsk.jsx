// BeAIReadyToolboxAsk — /toolbox/ask. A rebuild of AIKit's "ask the toolkit".
// Conversational, LLM-grounded answers need an AI key with credit; until that's
// funded this does an honest keyword search across the live catalogue (name,
// category, description, tags) and surfaces the best-matching tools. No fake AI.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const ACCENT = '#c75b39';
const cdiColor = (v) => (v == null ? '#c9c1b6' : v <= 3 ? '#16a34a' : v <= 6 ? '#b45309' : '#c2410c');
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'how', 'do', 'i', 'my', 'can', 'what', 'is', 'are', 'best', 'tool', 'tools', 'ai', 'help', 'me']);

export default function BeAIReadyToolboxAsk() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');

  useEffect(() => { publicFetch('/public/toolkit').then((r) => setItems(r.items || [])).catch(() => setItems([])); }, []);

  const results = useMemo(() => {
    if (!items || !submitted.trim()) return [];
    const tokens = submitted.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    if (!tokens.length) return [];
    const score = (t) => {
      const name = (t.name || '').toLowerCase();
      const cat = (t.primary_category || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const tags = (Array.isArray(t.tags) ? t.tags.join(' ') : '').toLowerCase();
      let s = 0;
      for (const w of tokens) {
        if (name.includes(w)) s += 4;
        if (cat.includes(w)) s += 3;
        if (tags.includes(w)) s += 2;
        if (desc.includes(w)) s += 1;
      }
      return s;
    };
    return items.map((t) => ({ t, s: score(t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 10).map((x) => x.t);
  }, [items, submitted]);

  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">The AI toolbox · ask</div>
        <h1>Describe the job. We'll point you at tools.</h1>
        <p className="hub-lede">
          Tell us what you're trying to do — "transcribe client calls", "write better proposals", "automate
          invoicing" — and we'll surface the tools that fit. <Link to="/toolbox">Browse everything →</Link>
        </p>
      </section>

      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(q); }} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What are you trying to do?"
          style={{ flex: '1 1 320px', padding: '11px 14px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 15, background: '#fff', fontFamily: 'inherit' }} />
        <button type="submit" className="hub-btn hub-btn-solid">Find tools</button>
      </form>
      <p style={{ fontSize: 12, color: '#a89e92', marginBottom: 18 }}>
        Keyword matching for now — full conversational answers switch on once an AI key is funded.
      </p>

      {submitted && (items == null ? <div style={{ color: '#8a8076' }}>Searching…</div> : results.length === 0 ? (
        <div className="hub-band">Nothing matched "{submitted}". Try different words, or <Link to="/toolbox/finder" style={{ color: ACCENT, fontWeight: 600 }}>use the Finder</Link>.</div>
      ) : (
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
      ))}
    </div>
  );
}
