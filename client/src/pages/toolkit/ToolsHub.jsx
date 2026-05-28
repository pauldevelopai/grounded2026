// Tools & Agents index — the operations tools + journalism agents, each opening a
// workspace. (They're also droppable into workflows in the Builder.)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

function Card({ b }) {
  return (
    <Link to={`/tool/${b.slug}`} className="card" style={{ padding: 20, textDecoration: 'none', color: 'inherit', display: 'block', opacity: b.comingSoon ? 0.7 : 1 }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{b.icon}</div>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>
        {b.name}{b.comingSoon && <span style={{ fontSize: 10, background: '#fde68a', color: '#92400e', borderRadius: 4, padding: '1px 6px', marginLeft: 6, verticalAlign: 'middle' }}>coming soon</span>}
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{b.description}</p>
    </Link>
  );
}

export default function ToolsHub() {
  const [tools, setTools] = useState([]);
  const [agents, setAgents] = useState([]);
  useEffect(() => {
    apiFetch('/tool-kit').then((r) => { setTools(r.tools || []); setAgents(r.agents || []); }).catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>Builder</div>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Tools &amp; Agents</h1>
      <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 720, margin: '0 0 24px' }}>
        Use one directly here, or drop it into a workflow in the Builder. They’re grounded in your Newsroom Profile.
      </p>

      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: '8px 0 10px' }}>Operations tools</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 28 }}>
        {tools.map((b) => <Card key={b.slug} b={b} />)}
        {tools.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: '8px 0 10px' }}>Journalism agents</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {agents.map((b) => <Card key={b.slug} b={b} />)}
      </div>
    </div>
  );
}
