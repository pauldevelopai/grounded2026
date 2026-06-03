import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';

// Author + read the outbound questions WE ask users (the slate QuestionBubble on
// the public site). Multiple-choice only, one at a time. Composes the admin side
// of /api/user-questions: list (with counts), create, edit, toggle, delete, results.

const muted = { fontSize: 13, color: 'var(--text-secondary)' };

function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}

const EMPTY_FORM = { prompt: '', options: ['', ''], category: '', sort_order: 0 };

export default function UserQuestions() {
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resultsFor, setResultsFor] = useState(null);   // question id
  const [results, setResults] = useState(null);

  function load() {
    apiFetch('/user-questions').then(setQuestions).catch((e) => setError(e.message || 'Could not load'));
  }
  useEffect(load, []);

  function resetForm() { setForm(EMPTY_FORM); setEditingId(null); }

  function setOption(i, val) {
    setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? val : o)) }));
  }
  function addOption() { setForm((f) => ({ ...f, options: [...f.options, ''] })); }
  function removeOption(i) {
    setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }));
  }

  async function save(e) {
    e.preventDefault();
    const clean = form.options.map((o) => o.trim()).filter(Boolean);
    if (!form.prompt.trim() || clean.length < 2) {
      alert('A prompt and at least two options are required.');
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        prompt: form.prompt.trim(),
        options: clean,
        category: form.category.trim() || null,
        sort_order: Number(form.sort_order) || 0,
      });
      if (editingId) {
        await apiFetch(`/user-questions/${editingId}`, { method: 'PUT', body });
      } else {
        await apiFetch('/user-questions', { method: 'POST', body });
      }
      resetForm();
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(q) {
    setEditingId(q.id);
    setForm({ prompt: q.prompt, options: [...q.options], category: q.category || '', sort_order: q.sort_order });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleActive(q) {
    try {
      await apiFetch(`/user-questions/${q.id}`, { method: 'PUT', body: JSON.stringify({ is_active: !q.is_active }) });
      load();
    } catch (err) { alert(err.message); }
  }

  async function remove(q) {
    if (!window.confirm(`Delete "${q.prompt}" and all its answers? This cannot be undone.`)) return;
    try {
      await apiFetch(`/user-questions/${q.id}`, { method: 'DELETE' });
      if (resultsFor === q.id) { setResultsFor(null); setResults(null); }
      load();
    } catch (err) { alert(err.message); }
  }

  async function showResults(q) {
    if (resultsFor === q.id) { setResultsFor(null); setResults(null); return; }
    setResultsFor(q.id);
    setResults(null);
    try {
      setResults(await apiFetch(`/user-questions/${q.id}/results`));
    } catch (err) { alert(err.message); setResultsFor(null); }
  }

  if (error) return (<div><PageHeader title="Questions" /><div className="empty-state"><h3>{error}</h3></div></div>);

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 13 };

  return (
    <div>
      <PageHeader title="Questions" />
      <p style={{ ...muted, marginTop: -8, marginBottom: 20 }}>
        Short multiple-choice questions we put to logged-in visitors via the floating bubble — one at a time —
        to learn about the newsrooms and people using Grounded. Each person answers each question once.
      </p>

      {/* ── Author / edit ── */}
      <form onSubmit={save} className="card" style={{ padding: 16, marginBottom: 28 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
          {editingId ? 'Edit question' : 'New question'}
        </h3>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Question</label>
        <input
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          placeholder="e.g. Which best describes your newsroom?"
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Options</label>
        {form.options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input value={opt} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} style={inputStyle} />
            {form.options.length > 2 && (
              <button type="button" onClick={() => removeOption(i)} style={{ border: '1px solid var(--border-color)', background: 'white', borderRadius: 6, cursor: 'pointer', padding: '0 10px' }}>×</button>
            )}
          </div>
        ))}
        <button type="button" onClick={addOption} className="btn btn-small" style={{ marginBottom: 12 }}>+ Add option</button>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Category (optional)</label>
            <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. newsroom, usage" style={inputStyle} />
          </div>
          <div style={{ width: 120 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Order</label>
            <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add question'}</button>
          {editingId && <button type="button" className="btn btn-small" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      {/* ── Existing questions ── */}
      {!questions ? (
        <p style={muted}>Loading…</p>
      ) : questions.length === 0 ? (
        <div className="card" style={{ padding: 18, ...muted }}>No questions yet. Add one above and it appears in the bubble for logged-in visitors.</div>
      ) : (
        questions.map((q) => (
          <div key={q.id} className="card" style={{ padding: 16, marginBottom: 12, opacity: q.is_active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{q.prompt}</span>
              {q.category && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '1px 7px', borderRadius: 10 }}>{q.category}</span>}
              {!q.is_active && <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309' }}>inactive</span>}
              <span style={{ ...muted, marginLeft: 'auto' }}>{q.response_count} answer{q.response_count === 1 ? '' : 's'} · order {q.sort_order}</span>
            </div>
            <div style={{ ...muted, marginTop: 6 }}>{q.options.join('  ·  ')}</div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-small" onClick={() => showResults(q)}>{resultsFor === q.id ? 'Hide results' : 'Results'}</button>
              <button className="btn btn-small" onClick={() => startEdit(q)}>Edit</button>
              <button className="btn btn-small" onClick={() => toggleActive(q)}>{q.is_active ? 'Deactivate' : 'Activate'}</button>
              <button className="btn btn-small" onClick={() => remove(q)} style={{ color: '#EF4444' }}>Delete</button>
            </div>

            {resultsFor === q.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                {!results ? (
                  <div style={muted}>Loading results…</div>
                ) : results.total === 0 ? (
                  <div style={muted}>No answers yet.</div>
                ) : (
                  <>
                    {results.tally.map((t) => (
                      <div key={t.choice} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                          <span>{t.choice}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', ...muted }}>{t.count} · {t.pct}%</span>
                        </div>
                        <div style={{ background: 'var(--border-color)', borderRadius: 4, height: 8 }}>
                          <div style={{ width: `${t.pct}%`, height: 8, borderRadius: 4, background: '#3a6b7d' }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ ...muted, marginTop: 12, marginBottom: 4, fontWeight: 600 }}>Recent answers</div>
                    {results.recent.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0' }}>
                        <span style={{ fontWeight: 600 }}>{r.user_name || 'Unknown'}</span>
                        <span>{r.choice}</span>
                        <span style={{ ...muted, marginLeft: 'auto' }}>{fmtDateTime(r.created_at)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
