// BeAIReadyAdminOverview — the BE AI READY admin command centre. This is where
// Paul goes first thing each day: what's NEW, what NEEDS him (review/assess), and
// what USERS have been doing (activity + feedback) — on one page, with the ability
// to act inline (resolve feedback, keep/remove auto-added tracker entries) or jump
// straight to the right admin page. Real signals only — honest empty states, never
// invented data.
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../../hooks/useApi.js';
import { useAuth } from '../../../context/AuthContext.jsx';

const CHARCOAL = '#1c1b1a';
const TERRACOTTA = '#c75b39';
const NEW_WINDOW_MS = 48 * 60 * 60 * 1000; // "new since yesterday" = last 48h

const card = { background: '#fff', border: '1px solid #e7ddd1', borderRadius: 12, padding: '18px 20px', marginBottom: 18 };
const kicker = { fontSize: 11, fontWeight: 700, color: '#8a8076', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, display: 'block' };
const pill = (bg, fg) => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, background: bg, color: fg, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.03em' });
const btn = (solid) => ({
  fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
  border: solid ? 'none' : '1px solid #d8cfc4', background: solid ? TERRACOTTA : '#fff', color: solid ? '#fff' : '#5a524a',
});
const linkBtn = { ...btn(false), textDecoration: 'none', display: 'inline-block' };
const input = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid #d8cfc4', background: '#fff', color: '#2a2622', minWidth: 150 };

const PRIORITY_STYLE = { high: ['#fee2e2', '#991b1b'], medium: ['#fef3c7', '#92400e'], low: ['#f1f5f9', '#475569'] };

function timeAgo(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

const isRecent = (ts) => ts && (Date.now() - new Date(ts).getTime()) < NEW_WINDOW_MS;
const isToday = (ts) => ts && new Date(ts).toDateString() === new Date().toDateString();

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// A queue count chip in the top summary strip. Terracotta when it needs attention.
function QueueChip({ label, count, to }) {
  const active = count > 0;
  const inner = (
    <div style={{
      minWidth: 130, padding: '12px 16px', borderRadius: 10, textAlign: 'left',
      background: active ? 'rgba(199,91,57,0.10)' : '#fff', border: `1px solid ${active ? 'rgba(199,91,57,0.35)' : '#e7ddd1'}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: active ? TERRACOTTA : '#a89f95', lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 12, color: '#6b6359', marginTop: 4 }}>{label}</div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

export default function BeAIReadyAdminOverview() {
  const { user } = useAuth();
  const [data, setData] = useState({ clients: [], tracker: { lawsuit: [], regulation: [] }, feedback: [], suggestions: [], nodes: null, today: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});      // per-item action spinner: { [key]: true }
  const [notice, setNotice] = useState('');
  const [orgForm, setOrgForm] = useState({ name: '', website: '' }); // add-organisation form
  const [codeInputs, setCodeInputs] = useState({});                  // { [clientId]: plaintext code }

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      apiFetch('/beaiready/admin/clients'),
      apiFetch('/tracker-review'),
      apiFetch('/feedback'),
      apiFetch('/toolkit-admin/suggestions?status=pending'),
      apiFetch('/nodes/admin/overview'),
      apiFetch('/public/governance-today'),
    ]);
    const val = (i, fallback) => (results[i].status === 'fulfilled' ? results[i].value : fallback);
    setData({
      clients: val(0, []) || [],
      tracker: val(1, { lawsuit: [], regulation: [] }) || { lawsuit: [], regulation: [] },
      feedback: val(2, []) || [],
      suggestions: val(3, []) || [],
      nodes: val(4, null),
      today: val(5, null),
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setItemBusy = (key, on) => setBusy((b) => ({ ...b, [key]: on }));

  // ── Inline actions ─────────────────────────────────────────────────────────
  async function resolveFeedback(id) {
    setItemBusy(`fb-${id}`, true);
    try {
      await apiFetch(`/feedback/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'resolved' }) });
      setData((d) => ({ ...d, feedback: d.feedback.map((f) => (f.id === id ? { ...f, status: 'resolved' } : f)) }));
      setNotice('Feedback marked resolved.');
    } catch (e) { setNotice(e.message || 'Could not update feedback.'); }
    finally { setItemBusy(`fb-${id}`, false); }
  }

  async function keepTracker(kind, id) {
    setItemBusy(`tr-${id}`, true);
    try {
      await apiFetch(`/tracker-review/${kind}/${id}/keep`, { method: 'PUT' });
      setData((d) => ({ ...d, tracker: { ...d.tracker, [kind]: d.tracker[kind].map((r) => (r.id === id ? { ...r, review_status: 'kept' } : r)) } }));
      setNotice('Kept on the tracker.');
    } catch (e) { setNotice(e.message || 'Could not keep entry.'); }
    finally { setItemBusy(`tr-${id}`, false); }
  }

  async function removeTracker(kind, id) {
    setItemBusy(`tr-${id}`, true);
    try {
      await apiFetch(`/tracker-review/${kind}/${id}`, { method: 'DELETE' });
      setData((d) => ({ ...d, tracker: { ...d.tracker, [kind]: d.tracker[kind].filter((r) => r.id !== id) } }));
      setNotice('Removed from the tracker.');
    } catch (e) { setNotice(e.message || 'Could not remove entry.'); }
    finally { setItemBusy(`tr-${id}`, false); }
  }

  // ── Organisations: add + open for self-registration via an access code ───────
  async function addOrg(e) {
    e?.preventDefault();
    const name = orgForm.name.trim();
    if (!name) { setNotice('Enter an organisation name.'); return; }
    setItemBusy('add-org', true);
    try {
      await apiFetch('/beaiready/admin/clients', {
        method: 'POST',
        body: JSON.stringify({ name, website: orgForm.website.trim() || undefined }),
      });
      setOrgForm({ name: '', website: '' });
      setNotice(`Added “${name}”. Set an access code below to open it for client sign-up.`);
      await load();
    } catch (err) { setNotice(err.message || 'Could not add the organisation.'); }
    finally { setItemBusy('add-org', false); }
  }

  // Set or clear a company's self-registration access code. Empty = clear (closes
  // self-registration). The plaintext is hashed server-side; we never store it here.
  async function saveCode(id, name, clear = false) {
    const code = clear ? '' : (codeInputs[id] || '').trim();
    setItemBusy(`code-${id}`, true);
    try {
      await apiFetch(`/beaiready/admin/clients/${id}/access-code`, {
        method: 'POST',
        body: JSON.stringify({ access_code: code }),
      });
      setCodeInputs((c) => ({ ...c, [id]: '' }));
      setNotice(code
        ? `Access code set for “${name}” — clients can now select it on sign-up and join with this code.`
        : `Access code cleared for “${name}” — it's no longer open for self-registration.`);
      await load();
    } catch (err) { setNotice(err.message || 'Could not update the access code.'); }
    finally { setItemBusy(`code-${id}`, false); }
  }

  // ── Derived signals ──────────────────────────────────────────────────────────
  const pendingTracker = [...(data.tracker.lawsuit || []), ...(data.tracker.regulation || [])].filter((r) => r.review_status === 'pending');
  const openFeedback = (data.feedback || []).filter((f) => f.status !== 'resolved');
  const pendingSuggestions = (data.suggestions || []).filter((s) => s.status === 'pending');
  const newClients = (data.clients || []).filter((c) => isRecent(c.created_at));
  const newTracker = pendingTracker.filter((r) => isRecent(r.created_at));
  const briefingToday = data.today && isToday(data.today.generated_at) ? data.today : null;

  // Recent user activity from hosted-node telemetry, flattened + newest first.
  const activity = [];
  for (const n of (data.nodes?.nodes || [])) {
    for (const ev of (n.recent || [])) activity.push({ ...ev, node: n.label || n.slug });
  }
  activity.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  const recentActivity = activity.slice(0, 12);

  const nothingToDo = pendingTracker.length === 0 && openFeedback.length === 0 && pendingSuggestions.length === 0;

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: CHARCOAL }}>{greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
          <p style={{ color: '#6b6359', margin: '4px 0 0', fontSize: 14 }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · everything BE AI READY, at a glance
          </p>
        </div>
        <button onClick={load} disabled={loading} style={{ ...btn(false), padding: '8px 16px' }}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {notice && (
        <div style={{ ...card, padding: '10px 14px', background: '#f0f7f0', border: '1px solid #cfe6cf', color: '#2f6b34', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13 }}>{notice}</span>
          <button onClick={() => setNotice('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2f6b34' }}>×</button>
        </div>
      )}

      {/* Summary strip — the three action queues */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <QueueChip label="Tracker items to review" count={pendingTracker.length} to="/admin/tracker" />
        <QueueChip label="Open feedback" count={openFeedback.length} />
        <QueueChip label="Toolbox suggestions" count={pendingSuggestions.length} to="/admin/tools" />
        <QueueChip label="New clients (48h)" count={newClients.length} to="/admin/users" />
      </div>

      {/* ═══ NEEDS YOU TODAY ═══ */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: CHARCOAL, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Needs you today</h2>

      {loading ? (
        <div style={{ ...card, color: '#8a8076' }}>Loading your queues…</div>
      ) : nothingToDo ? (
        <div style={{ ...card, color: '#5a7a5a', background: '#f4f9f4', border: '1px solid #d6e8d6' }}>
          ✓ You’re all caught up — nothing waiting for review, no open feedback, no new tool suggestions.
        </div>
      ) : (
        <>
          {/* Open feedback — resolve inline */}
          {openFeedback.length > 0 && (
            <div style={card}>
              <span style={kicker}>Feedback from users · {openFeedback.length} open</span>
              {openFeedback.slice(0, 6).map((f) => {
                const [bg, fg] = PRIORITY_STYLE[f.priority] || PRIORITY_STYLE.medium;
                return (
                  <div key={f.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid #f0e9df' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: '#2a2622' }}>{f.content}</div>
                      <div style={{ fontSize: 12, color: '#8a8076', marginTop: 4 }}>
                        {f.user_name || 'Someone'}{f.page ? ` · on ${f.page}` : ''} · {timeAgo(f.created_at)} <span style={{ ...pill(bg, fg), marginLeft: 6 }}>{f.priority || 'medium'}</span>
                      </div>
                    </div>
                    <button onClick={() => resolveFeedback(f.id)} disabled={busy[`fb-${f.id}`]} style={btn(false)}>
                      {busy[`fb-${f.id}`] ? '…' : 'Resolve'}
                    </button>
                  </div>
                );
              })}
              {openFeedback.length > 6 && <div style={{ fontSize: 12, color: '#8a8076', marginTop: 10 }}>+ {openFeedback.length - 6} more open</div>}
            </div>
          )}

          {/* Tracker review queue — keep / remove inline */}
          {pendingTracker.length > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ ...kicker, marginBottom: 0 }}>Auto-added tracker entries to check · {pendingTracker.length} pending</span>
                <Link to="/admin/tracker" style={{ fontSize: 12, color: TERRACOTTA, fontWeight: 600 }}>Full review →</Link>
              </div>
              {pendingTracker.slice(0, 6).map((r) => (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid #f0e9df' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#2a2622' }}>
                      <span style={{ ...pill('#ede7df', '#6b6359'), marginRight: 6 }}>{r.kind}</span>
                      {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: '#2a2622' }}>{r.name}</a> : r.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#8a8076', marginTop: 4 }}>
                      {[r.jurisdiction, r.status, r.source_origin].filter(Boolean).join(' · ')} · added {timeAgo(r.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => keepTracker(r.kind, r.id)} disabled={busy[`tr-${r.id}`]} style={btn(true)}>Keep</button>
                    <button onClick={() => removeTracker(r.kind, r.id)} disabled={busy[`tr-${r.id}`]} style={btn(false)}>Remove</button>
                  </div>
                </div>
              ))}
              {pendingTracker.length > 6 && <div style={{ fontSize: 12, color: '#8a8076', marginTop: 10 }}>+ {pendingTracker.length - 6} more pending</div>}
            </div>
          )}

          {/* Toolbox suggestions — review on the Toolbox admin page */}
          {pendingSuggestions.length > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ ...kicker, marginBottom: 0 }}>Tool suggestions from users · {pendingSuggestions.length} pending</span>
                <Link to="/admin/tools" style={{ fontSize: 12, color: TERRACOTTA, fontWeight: 600 }}>Review & approve →</Link>
              </div>
              {pendingSuggestions.slice(0, 5).map((s) => (
                <div key={s.id} style={{ padding: '10px 0', borderTop: '1px solid #f0e9df' }}>
                  <div style={{ fontSize: 14, color: '#2a2622' }}>
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#2a2622', fontWeight: 600 }}>{s.name}</a> : <span style={{ fontWeight: 600 }}>{s.name}</span>}
                  </div>
                  {s.why_valuable && <div style={{ fontSize: 13, color: '#5a524a', marginTop: 3 }}>{s.why_valuable}</div>}
                  <div style={{ fontSize: 12, color: '#8a8076', marginTop: 3 }}>{s.submitter_name || 'Someone'} · {timeAgo(s.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ NEW SINCE YESTERDAY ═══ */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: CHARCOAL, margin: '26px 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>New since yesterday</h2>
      <div style={card}>
        {/* Today's governance briefing */}
        <div style={{ paddingBottom: 12, borderBottom: '1px solid #f0e9df' }}>
          <span style={kicker}>Today’s governance briefing</span>
          {briefingToday ? (
            <div style={{ fontSize: 13, color: '#2a2622' }}>
              Generated {timeAgo(briefingToday.generated_at)}. <Link to="/tracker" style={{ color: TERRACOTTA, fontWeight: 600 }}>Open the tracker →</Link>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#8a8076' }}>Not generated yet today — the daily digest job runs each morning. <Link to="/admin/briefings" style={{ color: TERRACOTTA, fontWeight: 600 }}>Briefings →</Link></div>
          )}
        </div>
        {/* New clients */}
        <div style={{ padding: '12px 0', borderBottom: '1px solid #f0e9df' }}>
          <span style={kicker}>New client businesses (last 48h)</span>
          {newClients.length === 0 ? (
            <div style={{ fontSize: 13, color: '#8a8076' }}>No new sign-ups.</div>
          ) : newClients.map((c) => (
            <div key={c.id} style={{ fontSize: 13, color: '#2a2622', padding: '3px 0' }}>
              <strong>{c.name}</strong> · {c.user_count} {c.user_count === 1 ? 'user' : 'users'} · joined {timeAgo(c.created_at)}
            </div>
          ))}
        </div>
        {/* New tracker items */}
        <div style={{ paddingTop: 12 }}>
          <span style={kicker}>New tracker entries (last 48h)</span>
          <div style={{ fontSize: 13, color: newTracker.length ? '#2a2622' : '#8a8076' }}>
            {newTracker.length === 0 ? 'None added.' : `${newTracker.length} auto-added and awaiting your review (above).`}
          </div>
        </div>
      </div>

      {/* ═══ ORGANISATIONS ═══ */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: CHARCOAL, margin: '26px 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Organisations</h2>
      <div style={card}>
        {/* Add a new organisation */}
        <span style={kicker}>Add an organisation</span>
        <form onSubmit={addOrg} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
          <input value={orgForm.name} onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Organisation name" style={{ ...input, flex: '1 1 220px' }} />
          <input value={orgForm.website} onChange={(e) => setOrgForm((f) => ({ ...f, website: e.target.value }))}
            placeholder="Website (optional)" style={{ ...input, flex: '1 1 200px' }} />
          <button type="submit" disabled={busy['add-org']} style={btn(true)}>{busy['add-org'] ? 'Adding…' : 'Add organisation'}</button>
        </form>
        <p style={{ fontSize: 12, color: '#8a8076', margin: '8px 0 0' }}>
          New organisations start closed. Set an access code below to open one for client self-sign-up — clients then
          pick it from the list on the Create-account screen and join with that code.
        </p>

        {/* Access codes per organisation */}
        <span style={{ ...kicker, marginTop: 18 }}>Access codes</span>
        {(data.clients || []).length === 0 ? (
          <div style={{ fontSize: 13, color: '#8a8076' }}>No organisations yet — add your first above.</div>
        ) : (data.clients || []).map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #f0e9df', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}>
              <span style={{ fontWeight: 600, color: '#2a2622' }}>{c.name}</span>
              {!c.is_active && <span style={{ color: '#a89f95', fontSize: 12 }}> · inactive</span>}
              <span style={{ marginLeft: 8, ...(c.has_access_code ? pill('#dcfce7', '#166534') : pill('#f1f5f9', '#475569')) }}>
                {c.has_access_code ? 'open for sign-up' : 'no code'}
              </span>
            </div>
            <input type="text" value={codeInputs[c.id] || ''} autoComplete="off"
              onChange={(e) => setCodeInputs((ci) => ({ ...ci, [c.id]: e.target.value }))}
              placeholder={c.has_access_code ? 'New code…' : 'Set access code…'}
              style={{ ...input, flex: '0 1 170px' }} />
            <button onClick={() => saveCode(c.id, c.name)} disabled={busy[`code-${c.id}`] || !(codeInputs[c.id] || '').trim()} style={btn(true)}>
              {busy[`code-${c.id}`] ? '…' : (c.has_access_code ? 'Change' : 'Set code')}
            </button>
            {c.has_access_code && (
              <button onClick={() => saveCode(c.id, c.name, true)} disabled={busy[`code-${c.id}`]} style={btn(false)}>Clear</button>
            )}
          </div>
        ))}
      </div>

      {/* ═══ WHAT USERS HAVE BEEN DOING ═══ */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: CHARCOAL, margin: '26px 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>What users have been doing</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        {/* Recent activity feed */}
        <div style={card}>
          <span style={kicker}>Recent activity</span>
          {recentActivity.length === 0 ? (
            <div style={{ fontSize: 13, color: '#8a8076' }}>No hosted-tool activity recorded yet.</div>
          ) : recentActivity.map((ev, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: i ? '1px solid #f0e9df' : 'none', fontSize: 13 }}>
              <span style={{ color: '#2a2622' }}>
                <span style={{ color: ev.kind === 'error' ? '#b91c1c' : '#5a524a' }}>{ev.op || ev.kind}</span> · {ev.node}
                {ev.member_email && <span style={{ color: '#8a8076' }}> · {ev.member_email}</span>}
              </span>
              <span style={{ color: '#a89f95', whiteSpace: 'nowrap' }}>{timeAgo(ev.ts)}</span>
            </div>
          ))}
        </div>

        {/* Client engagement snapshot */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ ...kicker, marginBottom: 0 }}>Clients · {data.clients.length}</span>
            <Link to="/admin/users" style={{ fontSize: 12, color: TERRACOTTA, fontWeight: 600 }}>Manage →</Link>
          </div>
          {data.clients.length === 0 ? (
            <div style={{ fontSize: 13, color: '#8a8076', marginTop: 8 }}>No client businesses yet.</div>
          ) : data.clients.slice(0, 8).map((c) => {
            const done = ['has_policy', 'visibility_checks', 'tools_logged', 'recommendations', 'metrics'].filter((k) => c[k]).length;
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid #f0e9df', fontSize: 13 }}>
                <span style={{ color: '#2a2622' }}>{c.name}{!c.is_active && <span style={{ color: '#a89f95' }}> · inactive</span>}</span>
                <span style={{ color: '#8a8076', whiteSpace: 'nowrap' }}>{c.user_count} user{c.user_count === 1 ? '' : 's'} · {done}/5 pillars</span>
              </div>
            );
          })}
          {data.clients.length > 8 && <div style={{ fontSize: 12, color: '#8a8076', marginTop: 8 }}>+ {data.clients.length - 8} more</div>}
        </div>
      </div>
    </div>
  );
}
