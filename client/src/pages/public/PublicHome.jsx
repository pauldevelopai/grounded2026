// Home — represents the whole of Grounded across its three sections: Builder
// (Nodes + Tools), Tracker (the open AI-legal dataset), and Monetisation
// (revenue strategies). A stats row shows what the app currently contains; the
// three cards explain each section. The legal feed is no longer the centrepiece.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const SECTIONS = [
  {
    tag: 'Builder',
    title: 'Tools your newsroom runs and owns',
    body: 'Nodes are small, sharp AI tools built with newsrooms — run them on your own machine with one command, or use them online. Plus a growing toolkit for everyday work. Your data, your tools.',
    links: [
      { label: 'Explore Nodes →', href: '/nodes/', external: true },
      { label: 'Browse Tools →', href: '/tools/', external: true },
    ],
  },
  {
    tag: 'Tracker',
    title: 'Track AI in court and regulation',
    body: 'A chronological, sourced, free-to-everyone feed of every significant AI lawsuit, regulation and real-world use case worldwide — and how they connect. Built and kept current by an automated source pipeline.',
    links: [
      { label: 'Open the tracker →', href: '/legal/lawsuits', external: false },
      { label: 'See the connections →', href: '/legal/explore', external: false },
    ],
  },
  {
    tag: 'Monetisation',
    title: 'Turn journalism into revenue in the AI era',
    body: 'Practical strategies for capturing value from your content and your rights — extracting value from your archive, charging AI crawlers, Answer Engine Optimization, and bargaining collectively with other newsrooms.',
    links: [
      { label: 'See the strategies →', href: '/monetisation', external: false },
    ],
  },
];

export default function PublicHome() {
  const [stats, setStats] = useState({ nodes: null, lawsuits: null, regulations: null, usecases: null });

  useEffect(() => {
    Promise.allSettled([
      fetch('/nodes/nodes.json').then(r => r.json()).then(d => (d.nodes || []).length),
      publicFetch('/public/lawsuits?pageSize=1').then(r => r.total),
      publicFetch('/public/regulations?pageSize=1').then(r => r.total),
      publicFetch('/public/usecases?pageSize=1').then(r => r.total),
    ]).then(([n, l, rg, u]) => setStats({
      nodes: n.status === 'fulfilled' ? n.value : null,
      lawsuits: l.status === 'fulfilled' ? l.value : null,
      regulations: rg.status === 'fulfilled' ? rg.value : null,
      usecases: u.status === 'fulfilled' ? u.value : null,
    }));
  }, []);

  return (
    <div>
      {/* ── Hero ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Grounded · by Develop AI
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '0 0 14px 0', letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1 }}>
          Newsroom-owned AI
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 780, lineHeight: 1.6, margin: 0 }}>
          One place for newsrooms to <b>build</b> AI tools they own and run, <b>track</b> how AI is being
          fought over in courts and parliaments, and <b>monetise</b> their journalism in the AI era.
        </p>
      </section>

      {/* ── What's inside (stats) ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 36 }}>
        <Stat value={stats.nodes} label="Nodes you can run" to="/nodes/" external />
        <Stat value={stats.lawsuits} label="AI lawsuits tracked" to="/legal/lawsuits" />
        <Stat value={stats.regulations} label="Regulations tracked" to="/legal/regulations" />
        <Stat value={stats.usecases} label="Use cases logged" to="/legal/use-cases" />
      </section>

      {/* ── The three sections ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Three things Grounded does
      </div>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 36 }}>
        {SECTIONS.map(s => (
          <div key={s.tag} className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {s.tag}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>{s.title}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 16px 0', flex: 1 }}>{s.body}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.links.map(l => l.external
                ? <a key={l.href} href={l.href} style={ctaStyle}>{l.label}</a>
                : <Link key={l.href} to={l.href} style={ctaStyle}>{l.label}</Link>)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Stat({ value, label, to, external }) {
  const inner = (
    <>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value == null ? '—' : value}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{label}</div>
    </>
  );
  const style = { display: 'block', padding: 18, textDecoration: 'none' };
  return (
    <div className="card" style={{ padding: 0 }}>
      {external
        ? <a href={to} style={style}>{inner}</a>
        : <Link to={to} style={style}>{inner}</Link>}
    </div>
  );
}

const ctaStyle = { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', fontSize: 14 };
