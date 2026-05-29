// Reference data — the per-tool library each tool reads when it runs (funders,
// personas, jurisdiction notes, operational resources). Admin-managed.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const HINTS = {
  'tool-fundraiser': 'Add funders — name + their focus, typical grant size, requirements.',
  'tool-audience': 'Add audience personas — name + who they are and what they care about.',
  'tool-security-audit': 'Add jurisdiction notes — a country + its legal / source-protection context.',
  'tool-operations': 'Add operational resources — team roster, recurring deadlines, key suppliers.',
};
const inp = { padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' };

export default function ReferenceData() {
  const [tools, setTools] = useState([]);
  const [tool, setTool] = useState('');
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', content: '' });

  useEffect(() => {
    apiFetch('/tool-kit').then((r) => { const t = r.tools || []; setTools(t); setTool((cur) => cur || (t[0]?.slug || '')); }).catch(() => {});
  }, []);
  useEffect(() => { if (tool) load(); }, [tool]);
  const load = () => apiFetch(`/references?tool=${tool}`).then(setItems).catch(() => setItems([]));

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await apiFetch('/references', { method: 'POST', body: JSON.stringify({ tool, ...form }) });
    setForm({ name: '', content: '' }); load();
  }
  async function del(id) { await apiFetch(`/references/${id}`, { method: 'DELETE' }); load(); }

  const current = tools.find((t) => t.slug === tool);
  return (
    <div>
      <PageHeader title="Reference data" subtitle="The library each tool reads when it runs — woven into its prompt alongside the Newsroom Profile." />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tools.map((t) => (
          <button key={t.slug} onClick={() => setTool(t.slug)}
                  style={{ padding: '7px 12px', borderRadius: 999, border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: 13, background: tool === t.slug ? 'var(--accent)' : 'var(--card-bg)', color: tool === t.slug ? '#fff' : 'var(--text-primary)' }}>
            {t.icon} {t.name}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 20, maxWidth: 760 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{HINTS[tool] || 'Add reference items this tool should know about.'}</div>
        <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ ...inp, flex: '1 1 180px' }} />
          <input placeholder="Details" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ ...inp, flex: '2 1 280px' }} />
          <button className="btn btn-primary" type="submit">Add</button>
        </form>
        {items.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No items yet for {current?.name || 'this tool'}.</div>}
        {items.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
            <div><div style={{ fontWeight: 600, fontSize: 13 }}>{it.name}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{it.content}</div></div>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => del(it.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
