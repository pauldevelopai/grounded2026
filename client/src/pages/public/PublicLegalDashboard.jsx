// AI-and-the-law dashboard — ONE page that pulls every tracker together for a
// NEWSROOM audience (not lawyers): the AI court cases, the regulations coming at
// them, how other newsrooms/orgs actually use AI, ethics guidance they can adapt,
// and the sources we watch. Each tracker carries a one-line "why this matters to
// your newsroom" so a journalist knows why to care. Data: /public/overview
// (counts + recent per tracker) + /public/sources (the watch-list).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// One tracker column: header (count + "view all"), a journalist "why it matters"
// line, then the recent rows.
function Section({ title, count, to, viewAll, why, children }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
          {typeof count === 'number' && (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{count}</span>
          )}
        </div>
        <Link to={to} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>{viewAll} →</Link>
      </div>
      {why && <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px 0' }}>{why}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

// A single recent row: title (optional link), a one-line meta, optional summary.
function Row({ to, href, title, meta, summary }) {
  const inner = (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        {meta && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{meta}</span>}
      </div>
      {summary && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{summary}</div>}
    </>
  );
  const style = { textDecoration: 'none', color: 'inherit', display: 'block' };
  if (to) return <Link to={to} style={style}>{inner}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={style}>{inner}</a>;
  return <div style={style}>{inner}</div>;
}

const Empty = () => <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Nothing yet.</div>;

export default function PublicLegalDashboard() {
  const [data, setData] = useState(null);
  const [sources, setSources] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    publicFetch('/public/overview').then(setData).catch(() => setErr(true));
    publicFetch('/public/sources').then((s) => setSources(Array.isArray(s) ? s : [])).catch(() => setSources([]));
  }, []);

  const d = data || {};
  const src = Array.isArray(sources) ? sources : [];

  return (
    <div>
      <section style={{ marginBottom: 28, maxWidth: 780 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
          For newsrooms · AI &amp; the law
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 14px 0', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          AI and the law, tracked for your newsroom
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          You don’t need a legal team to keep up. This is a journalist’s view of how AI is being
          fought over in court, regulated around the world, and used in real newsrooms — plus the
          ethics guidance and the sources behind it, all in one place. Plain language, updated continuously.
        </p>
      </section>

      {err && <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Couldn’t load the dashboard right now. Please try again.</div>}
      {!data && !err && <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</div>}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <Section title="Lawsuits" count={d.lawsuits?.count} to="/legal/lawsuits" viewAll="All lawsuits"
                   why="Court fights over training data, copyright, defamation and deepfakes — the precedents that decide what you can publish, reuse and be sued for.">
            {(d.lawsuits?.recent || []).length === 0 ? <Empty /> : d.lawsuits.recent.map(c => (
              <Row key={c.id} to={`/legal/lawsuits/${c.id}`} title={c.case_name}
                   meta={[c.jurisdiction, c.status, fmtDate(c.updated_at)].filter(Boolean).join(' · ')}
                   summary={c.summary} />
            ))}
          </Section>

          <Section title="Regulations" count={d.regulations?.count} to="/legal/regulations" viewAll="All regulations"
                   why="The AI rules landing in each country — what your newsroom will have to comply with, and what your audience needs to know is coming.">
            {(d.regulations?.recent || []).length === 0 ? <Empty /> : d.regulations.recent.map(r => (
              <Row key={r.id} to={`/legal/regulations/${r.id}`} title={r.title}
                   meta={[r.jurisdiction, r.status, fmtDate(r.updated_at)].filter(Boolean).join(' · ')}
                   summary={r.summary} />
            ))}
          </Section>

          <Section title="Use cases" count={d.useCases?.count} to="/legal/use-cases" viewAll="All use cases"
                   why="How other newsrooms and organisations actually put AI to work — borrow what’s working, and learn from what got them in trouble.">
            {(d.useCases?.recent || []).length === 0 ? <Empty /> : d.useCases.recent.map(u => (
              <Row key={u.id} to={`/legal/use-cases/${u.id}`} title={u.use_case_title || u.firm_name}
                   meta={[u.firm_name, u.jurisdiction, fmtDate(u.updated_at)].filter(Boolean).join(' · ')}
                   summary={u.summary} />
            ))}
          </Section>

          <Section title="Ethics" count={d.ethics?.count} to="/legal/ethics" viewAll="Ethics guide"
                   why="Real policies and guidance you can adapt into your own newsroom’s AI rules — without starting from a blank page.">
            {(d.ethics?.recent || []).length === 0 ? <Empty /> : d.ethics.recent.map(e => (
              <Row key={e.id} href={e.url} title={e.title}
                   meta={[e.item_type, e.source_name, fmtDate(e.updated_at)].filter(Boolean).join(' · ')}
                   summary={e.summary} />
            ))}
          </Section>

          <Section title="Sources" count={src.length || undefined} to="/legal/sources" viewAll="All sources"
                   why="Every place we watch for all of the above — so you can verify it yourself, cite the original, and dig deeper.">
            {src.length === 0 ? <Empty /> : src.slice(0, 6).map(s => (
              <Row key={s.id} href={s.url} title={s.name}
                   meta={[s.kind, s.jurisdiction].filter(Boolean).join(' · ')} />
            ))}
          </Section>
        </div>
      )}

      {/* Explore / build CTAs — the rest of the toolkit, in newsroom terms. */}
      {data && (
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/legal/explore" className="card" style={{ flex: '1 1 280px', padding: 16, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Search everything →</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Ask a question across all the cases, rules and use cases at once.</div>
          </Link>
          <Link to="/legal/ethics-builder" className="card" style={{ flex: '1 1 280px', padding: 16, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Build your AI ethics policy →</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Generate a first-draft AI policy tailored to your newsroom in minutes.</div>
          </Link>
        </div>
      )}
    </div>
  );
}
