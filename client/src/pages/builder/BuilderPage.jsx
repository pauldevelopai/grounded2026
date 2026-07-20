// Builder — the drag-and-drop workflow composer.
// Palette (blocks from /api/workflows/blocks) → drop onto a React Flow canvas →
// connect blocks (an edge pipes the source's output into a target input field) →
// Save / Test run. Workflow inputs are auto-derived: any REQUIRED input field
// with no incoming edge is prompted for at run time. The sink block is the output.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges, Handle, Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

const CAT_COLOR = { node: '#0d9488', tool: '#c4761b', agent: '#6366F1' };
const HEADER_H = 30, ROW_H = 22;

function BlockNode({ data, selected }) {
  const b = data.block;
  const inputFields = Object.keys(b.inputs || {});
  return (
    <div style={{
      minWidth: 180, background: '#fff', border: `1px solid ${selected ? 'var(--accent)' : '#cbd5e1'}`,
      borderRadius: 8, boxShadow: selected ? '0 0 0 2px var(--accent)' : '0 1px 3px rgba(0,0,0,.1)', fontSize: 12,
    }}>
      <div style={{ padding: '7px 10px', borderBottom: '1px solid #eef2f7', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>{b.icon}</span><span>{b.name}</span>
        {b.comingSoon && <span style={{ fontSize: 9, background: '#fde68a', color: '#92400e', borderRadius: 4, padding: '1px 5px' }}>soon</span>}
        <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: CAT_COLOR[b.category] }} />
      </div>
      {inputFields.map((f, i) => (
        <div key={f} style={{ position: 'relative', padding: '3px 10px', height: ROW_H, color: '#475569' }}>
          <Handle type="target" position={Position.Left} id={f}
                  style={{ top: HEADER_H + i * ROW_H + ROW_H / 2, background: b.inputs[f].required ? '#ef4444' : '#94a3b8' }} />
          {f}{b.inputs[f].required ? ' *' : ''}
        </div>
      ))}
      <Handle type="source" position={Position.Right} id="out" style={{ top: HEADER_H + (inputFields.length * ROW_H) / 2, background: CAT_COLOR[b.category] }} />
      {inputFields.length === 0 && <div style={{ height: 8 }} />}
    </div>
  );
}

function Inner() {
  const [blocks, setBlocks] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [wf, setWf] = useState({ id: null, name: '', description: '' });
  const [runForm, setRunForm] = useState(null); // {inputs:[...], values:{}}
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const nodeTypes = useMemo(() => ({ block: BlockNode }), []);

  useEffect(() => {
    apiFetch('/workflows/blocks').then(r => setBlocks(r.blocks || [])).catch(() => {});
    refreshList();
  }, []);
  const refreshList = () => apiFetch('/workflows').then(setWorkflows).catch(() => {});

  const onNodesChange = useCallback((ch) => setNodes((n) => applyNodeChanges(ch, n)), []);
  const onEdgesChange = useCallback((ch) => setEdges((e) => applyEdgeChanges(ch, e)), []);
  const onConnect = useCallback((c) => setEdges((e) => addEdge({ ...c, animated: true }, e)), []);

  let _id = useMemo(() => ({ n: 0 }), []);
  function addBlock(block) {
    const id = `n${Date.now().toString(36)}${_id.n++}`;
    setNodes((n) => [...n, { id, type: 'block', position: { x: 120 + (n.length % 3) * 240, y: 80 + Math.floor(n.length / 3) * 160 }, data: { block, config: {} } }]);
  }

  function serialize() {
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const defNodes = nodes.map((n) => ({ id: n.id, block: n.data.block.slug, config: n.data.config || {} }));
    const defEdges = edges.map((e) => ({ from: { node: e.source, field: '*' }, to: { node: e.target, field: e.targetHandle || Object.keys(byId[e.target]?.data.block.inputs || {})[0] } }));
    const wired = new Set(edges.map((e) => `${e.target}:${e.targetHandle}`));
    const seen = {};
    const inputs = [];
    for (const n of nodes) {
      for (const [field, schema] of Object.entries(n.data.block.inputs || {})) {
        if (schema.required && !wired.has(`${n.id}:${field}`)) {
          let name = field; if (seen[name]) name = `${n.data.block.slug}_${field}`; seen[name] = true;
          inputs.push({ name, to: { node: n.id, field }, label: `${n.data.block.name} → ${field}`, type: schema.type });
        }
      }
    }
    const hasOut = new Set(edges.map((e) => e.source));
    const sink = nodes.find((n) => !hasOut.has(n.id)) || nodes[nodes.length - 1];
    return { nodes: defNodes, edges: defEdges, inputs, output: sink ? { node: sink.id, field: '*' } : null };
  }

  async function save() {
    if (!wf.name.trim()) { alert('Give the workflow a name.'); return; }
    setBusy('save');
    const definition = serialize();
    try {
      const body = JSON.stringify({ name: wf.name, description: wf.description, definition });
      const saved = wf.id
        ? await apiFetch(`/workflows/${wf.id}`, { method: 'PUT', body })
        : await apiFetch('/workflows', { method: 'POST', body });
      setWf((w) => ({ ...w, id: saved.id }));
      refreshList();
    } catch (e) { alert(e.message); } finally { setBusy(''); }
  }

  function openRun() {
    const def = serialize();
    if (!def.nodes.length) { alert('Add at least one block.'); return; }
    setResult(null);
    setRunForm({ inputs: def.inputs, values: {}, definition: def });
  }
  async function doRun() {
    setBusy('run');
    try {
      const res = await apiFetch('/workflows/run', { method: 'POST', body: JSON.stringify({ definition: runForm.definition, input: runForm.values }) });
      setResult(res); setRunForm(null);
    } catch (e) { setResult({ status: 'failed', error: e.message }); setRunForm(null); } finally { setBusy(''); }
  }

  function applyDefinition(def, meta) {
    const bySlug = Object.fromEntries(blocks.map((b) => [b.slug, b]));
    const rfNodes = (def.nodes || []).map((n, i) => ({
      id: n.id, type: 'block', position: { x: 120 + (i % 3) * 240, y: 80 + Math.floor(i / 3) * 160 },
      data: { block: bySlug[n.block || n.agent] || { slug: n.block, name: n.block, icon: '⚙️', inputs: {}, outputs: {}, category: 'agent' }, config: n.config || {} },
    }));
    const rfEdges = (def.edges || []).map((e, i) => ({ id: `e${i}`, source: e.from.node, target: e.to.node, targetHandle: e.to.field, animated: true }));
    setNodes(rfNodes); setEdges(rfEdges);
    setWf({ id: meta.id ?? null, name: meta.name || '', description: meta.description || '' });
    setResult(null);
  }
  async function load(id) {
    const w = await apiFetch(`/workflows/${id}`);
    applyDefinition(w.definition || {}, { id: w.id, name: w.name, description: w.description || '' });
  }
  const [describe, setDescribe] = useState('');
  async function generate() {
    if (!describe.trim()) return;
    setBusy('gen');
    try {
      const out = await apiFetch('/workflows/generate', { method: 'POST', body: JSON.stringify({ description: describe }) });
      applyDefinition(out.definition, { id: null, name: out.name });
      setDescribe('');
    } catch (e) { alert(e.message); } finally { setBusy(''); }
  }
  function newWf() { setNodes([]); setEdges([]); setWf({ id: null, name: '', description: '' }); setResult(null); }

  return (
    <div>
      <PageHeader title="Builder" subtitle="Compose a workflow from Nodes, tools and (soon) agents — drag blocks in, wire them up, save, and test.">
        <Link to="/run" className="btn" style={{ fontSize: 13 }}>Run a saved workflow&nbsp;&rarr;</Link>
      </PageHeader>
      <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 200px)', minHeight: 520 }}>
        {/* Palette */}
        <div style={{ width: 230, overflowY: 'auto', borderRight: '1px solid var(--border-color)', paddingRight: 10 }}>
          <input value={wf.name} onChange={(e) => setWf((w) => ({ ...w, name: e.target.value }))} placeholder="Workflow name"
                 style={{ width: '100%', padding: 8, marginBottom: 6, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className="btn btn-primary" style={{ fontSize: 12, flex: 1 }} disabled={busy === 'save'} onClick={save}>{busy === 'save' ? '…' : (wf.id ? 'Update' : 'Save')}</button>
            <button className="btn" style={{ fontSize: 12, flex: 1 }} onClick={openRun}>Test run</button>
            <button className="btn" style={{ fontSize: 12 }} onClick={newWf}>＋</button>
          </div>
          <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', margin: '4px 0 3px' }}>✨ Describe &amp; build</div>
            <textarea value={describe} onChange={(e) => setDescribe(e.target.value)} rows={3}
                      placeholder="Describe what you want, e.g. “Verify a claim with Election Watch, then draft a fundraiser brief about it.”"
                      style={{ width: '100%', padding: 7, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12, resize: 'vertical' }} />
            <button className="btn" style={{ fontSize: 12, width: '100%', marginTop: 4 }} disabled={busy === 'gen'} onClick={generate}>{busy === 'gen' ? 'Drafting…' : 'Build it for me'}</button>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '4px 0' }}>Blocks</div>
          {['node', 'tool', 'agent'].map((cat) => {
            const items = blocks.filter((b) => b.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: CAT_COLOR[cat], fontWeight: 700, textTransform: 'capitalize', margin: '6px 0 3px' }}>{cat}s</div>
                {items.map((b) => (
                  <button key={b.slug} onClick={() => addBlock(b)} title={b.description}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', marginBottom: 4, border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--card-bg)', cursor: 'pointer', fontSize: 12 }}>
                    {b.icon} {b.name}{b.comingSoon ? ' (soon)' : ''}
                  </button>
                ))}
              </div>
            );
          })}
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '12px 0 4px' }}>Saved</div>
          {workflows.map((w) => (
            <button key={w.id} onClick={() => load(w.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', marginBottom: 3, border: 'none', background: wf.id === w.id ? '#efe9e1' : 'transparent', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>{w.name}</button>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                     onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
            <Background /><Controls /><MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>

      {/* Test-run input modal */}
      {runForm && (
        <Modal onClose={() => setRunForm(null)} title="Test run">
          {runForm.inputs.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No inputs needed — this runs end-to-end.</p>}
          {runForm.inputs.map((inp) => (
            <label key={inp.name} style={{ display: 'block', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{inp.label || inp.name}</div>
              <textarea rows={inp.type === 'longtext' ? 3 : 1} value={runForm.values[inp.name] || ''}
                        onChange={(e) => setRunForm((f) => ({ ...f, values: { ...f.values, [inp.name]: e.target.value } }))}
                        style={{ width: '100%', padding: 8, border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13 }} />
            </label>
          ))}
          <button className="btn btn-primary" disabled={busy === 'run'} onClick={doRun}>{busy === 'run' ? 'Running…' : 'Run'}</button>
        </Modal>
      )}

      {result && (
        <Modal onClose={() => setResult(null)} title={`Run ${result.status || ''}`}>
          {result.error
            ? <div style={{ color: '#991B1B', fontSize: 13 }}>{result.error}</div>
            : <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(result.output, null, 2)}</pre>}
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 520, maxWidth: 'calc(100vw - 40px)', maxHeight: '80vh', overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><h3 style={{ margin: 0 }}>{title}</h3><button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button></div>
        {children}
      </div>
    </div>
  );
}

export default function BuilderPage() {
  return <ReactFlowProvider><Inner /></ReactFlowProvider>;
}
