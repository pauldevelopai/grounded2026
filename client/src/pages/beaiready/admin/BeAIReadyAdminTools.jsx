// BeAIReadyAdminTools — /admin/tools. Manage the AI toolbox: the catalogue
// (list/add/edit/score/delete + per-tool playbook), the suggestions queue
// (approve → seeds a draft tool to score, or reject), and review moderation
// (hide/unhide flagged reviews). Admin-only; talks to /api/toolkit-admin.
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

const TERRACOTTA = '#c75b39';
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #d8cfc4', borderRadius: 8, fontSize: 13.5, background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' };
const cdiColor = (v) => (v == null ? '#c9c1b6' : v <= 3 ? '#16a34a' : v <= 6 ? '#b45309' : '#c2410c');

const BLANK = {
  slug: '', name: '', url: '', primary_category: '', description: '', purpose: '', comments: '',
  time_saved: '', time_reinvestment: '', cdi_cost: '', cdi_difficulty: '', cdi_invasiveness: '',
  tags: '', similar_tools: '', sovereign_alternative: '',
};
const toForm = (t) => ({
  ...BLANK, ...t,
  cdi_cost: t.cdi_cost ?? '', cdi_difficulty: t.cdi_difficulty ?? '', cdi_invasiveness: t.cdi_invasiveness ?? '',
  url: t.url || '', primary_category: t.primary_category || '', description: t.description || '', purpose: t.purpose || '',
  comments: t.comments || '', time_saved: t.time_saved || '', time_reinvestment: t.time_reinvestment || '',
  sovereign_alternative: t.sovereign_alternative || '',
  tags: Array.isArray(t.tags) ? t.tags.join(', ') : '',
  similar_tools: Array.isArray(t.similar_tools) ? t.similar_tools.join(', ') : '',
});

export default function BeAIReadyAdminTools() {
  const [tab, setTab] = useState('catalogue');
  const [pending, setPending] = useState(0); // pending suggestion count for the tab badge
  useEffect(() => { apiFetch('/toolkit-admin/suggestions?status=pending').then((r) => setPending(r.length)).catch(() => {}); }, [tab]);

  const TABS = [['catalogue', 'Catalogue'], ['suggestions', `Suggestions${pending ? ` (${pending})` : ''}`], ['moderation', 'Moderation']];
  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Toolbox</h1>
      <p style={{ color: '#6b6359', margin: '0 0 16px', maxWidth: '64ch' }}>
        The AI tools your clients see at <code>/toolbox</code>. Scores are 0–10, <strong>lower is better</strong>. Changes appear on the site after the next build.
      </p>
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e7ddd1', marginBottom: 18 }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            fontWeight: tab === k ? 700 : 500, color: tab === k ? TERRACOTTA : '#6b6359',
            borderBottom: tab === k ? `2px solid ${TERRACOTTA}` : '2px solid transparent', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>
      {tab === 'catalogue' && <Catalogue />}
      {tab === 'suggestions' && <Suggestions onScored={() => setTab('catalogue')} />}
      {tab === 'moderation' && <Moderation />}
    </div>
  );
}

// ── Catalogue ────────────────────────────────────────────────────────────────
function Catalogue() {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [playbookSlug, setPlaybookSlug] = useState(null);

  const load = () => apiFetch('/toolkit-admin').then((d) => { setItems(d.items || []); setCategories(d.categories || []); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => (items || []).filter((t) =>
    (catFilter === 'all' || t.primary_category === catFilter) &&
    (!search || `${t.name} ${t.primary_category || ''} ${t.slug}`.toLowerCase().includes(search.toLowerCase()))
  ), [items, search, catFilter]);

  const openNew = () => { setForm(BLANK); setEditing('new'); setMsg(null); setErr(null); };
  const openEdit = (t) => { setForm(toForm(t)); setEditing(t.slug); setMsg(null); setErr(null); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setErr(null); setMsg(null);
    try {
      if (editing === 'new') { await apiFetch('/toolkit-admin', { method: 'POST', body: JSON.stringify(form) }); setMsg(`Added "${form.name}".`); }
      else { const { slug, ...patch } = form; await apiFetch(`/toolkit-admin/${editing}`, { method: 'PATCH', body: JSON.stringify(patch) }); setMsg(`Saved "${form.name}".`); }
      setEditing(null); await load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Remove "${t.name}" from the toolbox? This can't be undone.`)) return;
    try { await apiFetch(`/toolkit-admin/${t.slug}`, { method: 'DELETE' }); setMsg(`Removed "${t.name}".`); await load(); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={openNew} style={{ background: TERRACOTTA, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>+ Add tool</button>
      </div>
      {err && <div style={{ marginBottom: 12, color: '#991B1B', background: '#fdecec', border: '1px solid #f5c6c6', borderRadius: 8, padding: '10px 12px' }}>{err}</div>}
      {msg && <div style={{ marginBottom: 12, color: '#166534', background: '#ecfdf3', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px' }}>{msg}</div>}

      {playbookSlug && <PlaybookEditor slug={playbookSlug} name={(items || []).find((t) => t.slug === playbookSlug)?.name} onClose={() => setPlaybookSlug(null)} />}

      {editing && (
        <div style={{ marginBottom: 16, background: '#fff', border: '1px solid #e7ddd1', borderRadius: 12, padding: '18px 20px' }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{editing === 'new' ? 'Add a tool' : `Edit ${form.name}`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Name</label><input style={inp} value={form.name} onChange={set('name')} /></div>
            <div><label style={lbl}>Slug {editing === 'new' ? '(optional)' : '(fixed)'}</label><input style={{ ...inp, background: editing === 'new' ? '#fff' : '#f4f1ec' }} value={form.slug} onChange={set('slug')} disabled={editing !== 'new'} placeholder="auto" /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>URL</label><input style={inp} value={form.url} onChange={set('url')} placeholder="https://…" /></div>
            <div>
              <label style={lbl}>Category</label>
              <input style={inp} value={form.primary_category} onChange={set('primary_category')} list="bair-tool-cats" placeholder="e.g. Writing & Content" />
              <datalist id="bair-tool-cats">{categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[['cdi_cost', 'Cost'], ['cdi_difficulty', 'Difficulty'], ['cdi_invasiveness', 'Data exp.']].map(([k, label]) => (
                <div key={k}><label style={lbl}>{label}</label><input style={{ ...inp, borderColor: form[k] === '' ? '#d8cfc4' : cdiColor(Number(form[k])) }} type="number" min="0" max="10" value={form[k]} onChange={set(k)} /></div>
              ))}
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Description</label><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={form.description} onChange={set('description')} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Purpose</label><textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={form.purpose} onChange={set('purpose')} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Practical notes (comments)</label><textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={form.comments} onChange={set('comments')} /></div>
            <div><label style={lbl}>Time it buys back</label><input style={inp} value={form.time_saved} onChange={set('time_saved')} /></div>
            <div><label style={lbl}>Reinvest the time on…</label><input style={inp} value={form.time_reinvestment} onChange={set('time_reinvestment')} /></div>
            <div><label style={lbl}>Tags (comma-separated)</label><input style={inp} value={form.tags} onChange={set('tags')} placeholder="free, open-source" /></div>
            <div><label style={lbl}>Privacy-first alternative (slug)</label><input style={inp} value={form.sovereign_alternative} onChange={set('sovereign_alternative')} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Similar tools (slugs, comma-separated)</label><input style={inp} value={form.similar_tools} onChange={set('similar_tools')} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={saving || !form.name.trim()} style={{ background: TERRACOTTA, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: !form.name.trim() ? 0.5 : 1 }}>{saving ? 'Saving…' : editing === 'new' ? 'Add tool' : 'Save changes'}</button>
            <button onClick={() => setEditing(null)} style={{ background: 'none', border: '1px solid #d8cfc4', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: 'pointer', color: '#6b6359' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input style={{ ...inp, width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools…" />
        <select style={{ ...inp, width: 'auto' }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories ({(items || []).length})</option>
          {categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#8a8076' }}>{visible.length} shown</span>
      </div>

      {items == null && !err ? <div style={{ color: '#8a8076' }}>Loading…</div> : (
        <div style={{ background: '#fff', border: '1px solid #e7ddd1', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr style={{ background: '#f4f1ec', textAlign: 'left', color: '#6b6359' }}>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Tool</th>
              <th style={{ padding: '10px 14px', fontWeight: 700 }}>Category</th>
              <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center' }}>Cost</th>
              <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center' }}>Diff.</th>
              <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center' }}>Data</th>
              <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}></th>
            </tr></thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.slug} style={{ borderTop: '1px solid #f1ece5' }}>
                  <td style={{ padding: '9px 14px' }}><div style={{ fontWeight: 700 }}>{t.name}</div><div style={{ fontSize: 11.5, color: '#a89e92' }}>{t.slug}</div></td>
                  <td style={{ padding: '9px 14px', color: '#6b6359' }}>{t.primary_category || '—'}</td>
                  {['cdi_cost', 'cdi_difficulty', 'cdi_invasiveness'].map((k) => <td key={k} style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 800, color: cdiColor(t[k]) }}>{t[k] ?? '–'}</td>)}
                  <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setPlaybookSlug(t.slug)} style={{ background: 'none', border: '1px solid #d8cfc4', borderRadius: 6, padding: '4px 9px', fontSize: 12.5, cursor: 'pointer', marginRight: 6 }}>Playbook</button>
                    <button onClick={() => openEdit(t)} style={{ background: 'none', border: '1px solid #d8cfc4', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer', marginRight: 6 }}>Edit</button>
                    <button onClick={() => remove(t)} style={{ background: 'none', border: '1px solid #f0c9c9', color: '#b91c1c', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer' }}>Delete</button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={6} style={{ padding: '18px 14px', color: '#8a8076' }}>No tools match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Playbook editor ──────────────────────────────────────────────────────────
function PlaybookEditor({ slug, name, onClose }) {
  const [pb, setPb] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const blank = { status: 'draft', best_use_cases: '', implementation_steps: '', common_mistakes: '', privacy_notes: '', key_features: '' };
  useEffect(() => {
    apiFetch(`/toolkit-admin/${slug}/playbook`).then((p) => setPb(p ? { ...blank, ...p, key_features: Array.isArray(p.key_features) ? p.key_features.join('\n') : '' } : blank)).catch(() => setPb(blank));
  }, [slug]);
  const set = (k) => (e) => setPb((p) => ({ ...p, [k]: e.target.value }));
  const save = async (status) => {
    setErr(null); setMsg(null);
    try { await apiFetch(`/toolkit-admin/${slug}/playbook`, { method: 'PUT', body: JSON.stringify({ ...pb, status }) }); setMsg(status === 'published' ? 'Published.' : 'Saved as draft.'); setPb((p) => ({ ...p, status })); }
    catch (e) { setErr(e.message); }
  };
  if (!pb) return null;
  return (
    <div style={{ marginBottom: 16, background: '#fbf7f4', border: '1px solid #e7ddd1', borderLeft: `3px solid ${TERRACOTTA}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Playbook · {name || slug} <span style={{ fontSize: 11, fontWeight: 700, color: pb.status === 'published' ? '#166534' : '#b45309', textTransform: 'uppercase', marginLeft: 6 }}>{pb.status}</span></div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8076', cursor: 'pointer', fontSize: 13 }}>Close</button>
      </div>
      {err && <div style={{ color: '#991B1B', fontSize: 13, marginTop: 8 }}>{err}</div>}
      {msg && <div style={{ color: '#166534', fontSize: 13, marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <div><label style={lbl}>Key features (one per line)</label><textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={pb.key_features} onChange={set('key_features')} /></div>
        <div><label style={lbl}>Best uses</label><textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={pb.best_use_cases} onChange={set('best_use_cases')} /></div>
        <div><label style={lbl}>How to start</label><textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={pb.implementation_steps} onChange={set('implementation_steps')} /></div>
        <div><label style={lbl}>Common mistakes</label><textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={pb.common_mistakes} onChange={set('common_mistakes')} /></div>
        <div><label style={lbl}>Privacy notes</label><textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={pb.privacy_notes} onChange={set('privacy_notes')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button onClick={() => save('draft')} style={{ background: 'none', border: '1px solid #d8cfc4', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', color: '#6b6359' }}>Save draft</button>
        <button onClick={() => save('published')} style={{ background: TERRACOTTA, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>Publish</button>
      </div>
      <p style={{ fontSize: 11.5, color: '#a89e92', marginTop: 8 }}>Only published playbooks show on the public tool page.</p>
    </div>
  );
}

// ── Suggestions queue ────────────────────────────────────────────────────────
function Suggestions({ onScored }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => apiFetch('/toolkit-admin/suggestions').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const approve = async (s) => {
    try { const r = await apiFetch(`/toolkit-admin/suggestions/${s.id}/approve`, { method: 'POST', body: JSON.stringify({ create: true }) }); await load(); if (r.slug && window.confirm(`Added "${s.name}" as a draft tool. Open the catalogue to score it now?`)) onScored?.(); }
    catch (e) { setErr(e.message); }
  };
  const reject = async (s) => { const notes = window.prompt(`Reject "${s.name}"? Optional note:`); if (notes === null) return; try { await apiFetch(`/toolkit-admin/suggestions/${s.id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) }); load(); } catch (e) { setErr(e.message); } };

  if (err) return <div style={{ color: '#991B1B' }}>{err}</div>;
  if (rows == null) return <div style={{ color: '#8a8076' }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ color: '#8a8076' }}>No suggestions yet. When a signed-in user suggests a tool at <code>/toolbox/suggest</code>, it lands here.</div>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((s) => (
        <div key={s.id} style={{ background: '#fff', border: '1px solid #e7ddd1', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name} {s.url && <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: TERRACOTTA, fontWeight: 500 }}>↗</a>}</div>
              <div style={{ fontSize: 12, color: '#a89e92' }}>by {s.submitter_name || 'a user'} · {new Date(s.created_at).toLocaleDateString()}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: s.status === 'approved' ? '#166534' : s.status === 'rejected' ? '#b91c1c' : '#b45309', height: 'fit-content' }}>{s.status}</span>
          </div>
          {s.description && <p style={{ fontSize: 13.5, color: '#3a342e', margin: '8px 0 0' }}>{s.description}</p>}
          {s.why_valuable && <p style={{ fontSize: 13, color: '#6b6359', margin: '4px 0 0' }}><strong>Why:</strong> {s.why_valuable}</p>}
          {s.review_notes && <p style={{ fontSize: 12.5, color: '#8a8076', margin: '4px 0 0' }}>Note: {s.review_notes}</p>}
          {s.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => approve(s)} style={{ background: TERRACOTTA, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Approve → add to score</button>
              <button onClick={() => reject(s)} style={{ background: 'none', border: '1px solid #f0c9c9', color: '#b91c1c', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>Reject</button>
            </div>
          )}
          {s.created_tool_slug && <p style={{ fontSize: 12, margin: '6px 0 0' }}>Added as <code>{s.created_tool_slug}</code> — score it in the Catalogue tab.</p>}
        </div>
      ))}
    </div>
  );
}

// ── Review moderation ────────────────────────────────────────────────────────
function Moderation() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const load = () => apiFetch('/toolkit-admin/reviews/flagged').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => { try { await apiFetch(`/toolkit-admin/reviews/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }); load(); } catch (e) { setErr(e.message); } };

  if (err) return <div style={{ color: '#991B1B' }}>{err}</div>;
  if (rows == null) return <div style={{ color: '#8a8076' }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ color: '#8a8076' }}>Nothing to moderate. Flagged or hidden reviews appear here.</div>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ background: '#fff', border: '1px solid #e7ddd1', borderRadius: 10, padding: '14px 16px', opacity: r.is_hidden ? 0.65 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13 }}><strong>{r.tool_name}</strong> · {r.rating}★ by {r.author_name}{r.is_hidden && <span style={{ color: '#b91c1c', marginLeft: 6 }}>(hidden)</span>}</div>
            {r.open_flags > 0 && <span style={{ fontSize: 11.5, color: '#b45309', fontWeight: 700 }}>{r.open_flags} flag{r.open_flags === 1 ? '' : 's'}</span>}
          </div>
          {r.comment && <p style={{ fontSize: 13.5, color: '#3a342e', margin: '6px 0 0' }}>{r.comment}</p>}
          {r.flag_reasons && <p style={{ fontSize: 12.5, color: '#8a8076', margin: '4px 0 0' }}>Flagged: {r.flag_reasons}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {!r.is_hidden
              ? <button onClick={() => act(r.id, 'hide')} style={{ background: 'none', border: '1px solid #f0c9c9', color: '#b91c1c', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Hide review</button>
              : <button onClick={() => act(r.id, 'unhide')} style={{ background: 'none', border: '1px solid #d8cfc4', color: '#6b6359', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Restore</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
