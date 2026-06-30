// BusinessReview — Roles, Review Routine & Incidents (/dashboard/governance/review),
// a Governance-pillar feature. Name the accountable owner, set a review cadence, log
// review meetings, and log incidents with an escalation path. The heartbeat that keeps
// the register from going stale. Scoped to the tenant. (manual Components 5 + 7)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

const CADENCES = ['monthly', 'quarterly', 'biannual', 'annual'];
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function BusinessReview() {
  const [profile, setProfile] = useState(undefined); // undefined=loading
  const [reviews, setReviews] = useState(null);
  const [incidents, setIncidents] = useState(null);
  const [agenda, setAgenda] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [rForm, setRForm] = useState({ review_date: '', attendees: '', what_checked: '', actions: '' });
  const [iForm, setIForm] = useState({ occurred_at: '', what_happened: '', who_told: '', action_taken: '' });
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [err, setErr] = useState('');

  const loadReviews = () => apiFetch('/beaiready/governance/reviews').then(setReviews).catch(() => setReviews([]));
  const loadIncidents = () => apiFetch('/beaiready/governance/incidents').then(setIncidents).catch(() => setIncidents([]));
  useEffect(() => {
    apiFetch('/beaiready/governance/profile').then((p) => setProfile(p || { review_cadence: 'quarterly' })).catch(() => setProfile({ review_cadence: 'quarterly' }));
    loadReviews();
    loadIncidents();
  }, []);

  const setP = (k, v) => setProfile((p) => ({ ...p, [k]: v }));

  const saveProfile = async () => {
    setBusy(true); setErr(''); setSavedNote('');
    try {
      const p = await apiFetch('/beaiready/governance/profile', { method: 'PUT', body: JSON.stringify(profile) });
      setProfile(p); setSavedNote('Saved.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const suggestAgenda = async () => {
    setSuggesting(true); setErr('');
    try { setAgenda(await apiFetch('/beaiready/governance/review/suggest-agenda', { method: 'POST', timeout: 60000 })); }
    catch (e) { setErr(e.message); }
    setSuggesting(false);
  };

  const addReview = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await apiFetch('/beaiready/governance/reviews', { method: 'POST', body: JSON.stringify(rForm) }); setRForm({ review_date: '', attendees: '', what_checked: '', actions: '' }); await loadReviews(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const delReview = async (id) => { try { await apiFetch(`/beaiready/governance/reviews/${id}`, { method: 'DELETE' }); await loadReviews(); } catch (e) { setErr(e.message); } };

  const addIncident = async (e) => {
    e.preventDefault(); if (!iForm.what_happened.trim()) return; setBusy(true); setErr('');
    try { await apiFetch('/beaiready/governance/incidents', { method: 'POST', body: JSON.stringify(iForm) }); setIForm({ occurred_at: '', what_happened: '', who_told: '', action_taken: '' }); await loadIncidents(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const toggleIncident = async (it) => { try { await apiFetch(`/beaiready/governance/incidents/${it.id}`, { method: 'PUT', body: JSON.stringify({ status: it.status === 'open' ? 'resolved' : 'open' }) }); await loadIncidents(); } catch (e) { setErr(e.message); } };
  const delIncident = async (id) => { try { await apiFetch(`/beaiready/governance/incidents/${id}`, { method: 'DELETE' }); await loadIncidents(); } catch (e) { setErr(e.message); } };

  const dueForReview = profile?.next_review_date && profile.next_review_date.slice(0, 10) <= todayISO();

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Governance · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>Roles &amp; Review</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 14 }}>
        Name who's accountable for AI governance, set a review cadence, and keep the log of reviews and
        incidents — the routine that stops your register and controls going stale.
      </p>
      <p style={{ marginBottom: 18 }}>
        <Link to="/dashboard">← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/security">AI System Register</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance/controls">Controls library</Link>
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* Accountability & cadence */}
      <section className="hub-card" style={{ marginBottom: 18 }}>
        <div className="hub-card-kicker">Accountability &amp; review cadence</div>
        {profile === undefined ? <p style={{ color: '#8a8076' }}>Loading…</p> : (
          <div style={{ display: 'grid', gap: 10, maxWidth: 620, marginTop: 6 }}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <input style={inp} placeholder="Accountable owner (the person who answers for AI)" value={profile.accountable_owner || ''} onChange={(e) => setP('accountable_owner', e.target.value)} />
              <input style={inp} placeholder="Their role (e.g. Managing Director)" value={profile.owner_role || ''} onChange={(e) => setP('owner_role', e.target.value)} />
              <select style={inp} value={profile.review_cadence || 'quarterly'} onChange={(e) => setP('review_cadence', e.target.value)}>
                {CADENCES.map((c) => <option key={c} value={c}>Review: {c}</option>)}
              </select>
              <input style={inp} type="date" value={profile.next_review_date ? profile.next_review_date.slice(0, 10) : ''} onChange={(e) => setP('next_review_date', e.target.value)} />
            </div>
            <textarea style={{ ...inp, minHeight: 60 }} placeholder="Incident escalation path — if AI causes a problem, who is told, who acts, in what order?" value={profile.incident_escalation_path || ''} onChange={(e) => setP('incident_escalation_path', e.target.value)} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={saveProfile} disabled={busy} style={btn}>{busy ? 'Saving…' : 'Save'}</button>
              <button onClick={suggestAgenda} disabled={suggesting} style={btnGhost}>{suggesting ? 'Thinking…' : '✨ Suggest a review agenda'}</button>
              {savedNote && <span style={{ fontSize: 13, color: '#166534' }}>{savedNote}</span>}
              {dueForReview && <span style={{ ...badge, background: '#fef3c7', color: '#92400e' }}>Review due</span>}
            </div>
          </div>
        )}
        {agenda && (
          <div style={{ marginTop: 12, background: '#fffaf5', border: '1px solid #f0e2d4', borderRadius: 8, padding: 12 }}>
            <div className="hub-card-kicker">Suggested standing agenda</div>
            {agenda.agenda?.length > 0 ? <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5 }}>{agenda.agenda.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p style={{ fontSize: 13, color: '#8a8076' }}>No agenda returned.</p>}
            {agenda.escalation && <p style={{ fontSize: 13, marginTop: 8 }}><b>Escalation:</b> {agenda.escalation}</p>}
            {agenda.citations?.length > 0 && (
              <p style={{ fontSize: 11.5, marginTop: 6 }}><span style={{ color: '#8a8076' }}>Sources: </span>
                {agenda.citations.map((c, i) => <span key={i}>{i > 0 && ', '}{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}</span>)}</p>
            )}
            <p style={{ fontSize: 11, color: '#a8a29e', fontStyle: 'italic', marginTop: 6 }}>Generated guidance, not legal advice — verify with counsel.</p>
          </div>
        )}
      </section>

      {/* Reviews log */}
      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>Review log</h2>
        <form onSubmit={addReview} className="hub-card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 620 }}>
            <input style={inp} type="date" value={rForm.review_date} onChange={(e) => setRForm({ ...rForm, review_date: e.target.value })} />
            <input style={inp} placeholder="Attendees" value={rForm.attendees} onChange={(e) => setRForm({ ...rForm, attendees: e.target.value })} />
          </div>
          <textarea style={{ ...inp, minHeight: 48, marginTop: 8, maxWidth: 620 }} placeholder="What was checked (register, risks, controls followed, incidents)" value={rForm.what_checked} onChange={(e) => setRForm({ ...rForm, what_checked: e.target.value })} />
          <textarea style={{ ...inp, minHeight: 48, marginTop: 8, maxWidth: 620 }} placeholder="Actions agreed" value={rForm.actions} onChange={(e) => setRForm({ ...rForm, actions: e.target.value })} />
          <div style={{ marginTop: 10 }}><button type="submit" disabled={busy} style={btn}>Log review</button></div>
        </form>
        {reviews === null ? <p style={{ color: '#8a8076' }}>Loading…</p> : reviews.length === 0 ? <p style={{ color: '#8a8076' }}>No reviews logged yet — the first one starts the rhythm.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {reviews.map((r) => (
              <div key={r.id} className="hub-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{fmt(r.review_date) || 'Undated review'}</strong>
                  <button onClick={() => delReview(r.id)} style={btnGhostSmall}>Remove</button>
                </div>
                {r.attendees && <p style={{ fontSize: 12.5, color: '#8a8076', margin: '2px 0 0' }}>Attendees: {r.attendees}</p>}
                {r.what_checked && <p style={{ fontSize: 13, margin: '6px 0 0' }}><b>Checked:</b> {r.what_checked}</p>}
                {r.actions && <p style={{ fontSize: 13, margin: '4px 0 0' }}><b>Actions:</b> {r.actions}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Incidents log */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>Incident log</h2>
        <form onSubmit={addIncident} className="hub-card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', maxWidth: 620 }}>
            <input style={inp} type="date" value={iForm.occurred_at} onChange={(e) => setIForm({ ...iForm, occurred_at: e.target.value })} />
            <input style={inp} placeholder="Who was told" value={iForm.who_told} onChange={(e) => setIForm({ ...iForm, who_told: e.target.value })} />
          </div>
          <textarea style={{ ...inp, minHeight: 48, marginTop: 8, maxWidth: 620 }} placeholder="What happened" value={iForm.what_happened} onChange={(e) => setIForm({ ...iForm, what_happened: e.target.value })} />
          <textarea style={{ ...inp, minHeight: 48, marginTop: 8, maxWidth: 620 }} placeholder="Action taken" value={iForm.action_taken} onChange={(e) => setIForm({ ...iForm, action_taken: e.target.value })} />
          <div style={{ marginTop: 10 }}><button type="submit" disabled={busy} style={btn}>Log incident</button></div>
        </form>
        {incidents === null ? <p style={{ color: '#8a8076' }}>Loading…</p> : incidents.length === 0 ? <p style={{ color: '#8a8076' }}>No incidents logged — good. The log exists so there's a place for them.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {incidents.map((it) => (
              <div key={it.id} className="hub-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{fmt(it.occurred_at) || 'Undated'}
                    <span style={{ ...badge, background: it.status === 'resolved' ? '#dcfce7' : '#fef3c7', color: it.status === 'resolved' ? '#166534' : '#92400e', marginLeft: 8 }}>{it.status}</span>
                  </strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggleIncident(it)} style={btnGhostSmall}>{it.status === 'open' ? 'Mark resolved' : 'Reopen'}</button>
                    <button onClick={() => delIncident(it.id)} style={btnGhostSmall}>Remove</button>
                  </div>
                </div>
                <p style={{ fontSize: 13, margin: '6px 0 0' }}>{it.what_happened}</p>
                {it.who_told && <p style={{ fontSize: 12.5, color: '#8a8076', margin: '2px 0 0' }}>Told: {it.who_told}</p>}
                {it.action_taken && <p style={{ fontSize: 12.5, color: '#9a3412', margin: '2px 0 0' }}><b>Action:</b> {it.action_taken}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const inp = { width: '100%', padding: '9px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
const badge = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhost = { padding: '9px 16px', background: 'transparent', color: '#1c1b1a', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const btnGhostSmall = { padding: '6px 12px', background: 'transparent', color: '#6b6359', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
