// BeAIReadyAdminClient — the client cockpit. The BE AI READY admin is organised by
// feature (Training, Prompts, Users…), each with its own client dropdown, so seeing
// ONE client whole meant hopping pages and re-selecting them. This page inverts that:
// pick a client once, then everything about them — their people, their training,
// their prompts, their tools — under one set of tabs. The feature pages stay for
// cross-client work; this is the oversight view.
//
// It reuses the real section components (no duplicated logic): TrainingSections and
// DashboardRefresh from the Training page, and the per-client panels from Users.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../../hooks/useApi.js';
import { LoginsPanel, AccessCodeControl, InsightsConsentControl } from './ClientUserPanels.jsx';
import { TrainingSections, DashboardRefresh } from './BeAIReadyAdminTraining.jsx';

const TABS = [['overview', 'Overview'], ['users', 'Users'], ['training', 'Training'], ['prompts', 'Prompts'], ['tools', 'Tools']];

// Client-scoped fetch — the admin acts inside a client via the X-Newsroom-Id override.
const useApi = (clientId) =>
  useCallback((path, opts = {}) => apiFetch(path, { ...opts, headers: { 'X-Newsroom-Id': clientId, ...(opts.headers || {}) } }), [clientId]);

export default function BeAIReadyAdminClient() {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [tab, setTab] = useState('overview');
  const [err, setErr] = useState('');
  const [params] = useSearchParams();
  const wanted = params.get('c');   // deep-link from the Overview roster: /admin/client?c=<id>

  const loadClients = useCallback(() => apiFetch('/beaiready/admin/clients')
    .then((c) => {
      setClients(c);
      setClientId((id) => id || (wanted && c.some((x) => x.id === wanted) ? wanted : (c[0] && c[0].id) || ''));
    })
    .catch((e) => setErr(e.message)), [wanted]);
  useEffect(() => { loadClients(); }, [loadClients]);

  const client = (clients || []).find((c) => c.id === clientId) || null;

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Client</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '68ch' }}>
        Everything about one client business in one place — their people, their training, their prompts and their
        tools. Pick the client once; the tabs below all follow it.
      </p>
      {err && <div style={banner}>{err}</div>}

      <div style={{ marginBottom: 16 }}>
        <label style={kicker}>Client</label>{' '}
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...inp, minWidth: 260 }}>
          {clients === null && <option>Loading…</option>}
          {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e4dcd2', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
            fontWeight: tab === key ? 700 : 500, color: tab === key ? '#c75b39' : '#6b6359',
            padding: '9px 14px', borderBottom: `2px solid ${tab === key ? '#c75b39' : 'transparent'}`, marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {!clientId ? <p style={muted}>No client selected.</p> : (
        <>
          {tab === 'overview' && <OverviewTab clientId={clientId} client={client} setErr={setErr} goTab={setTab} />}
          {tab === 'users' && <UsersTab client={client} onChanged={loadClients} setErr={setErr} />}
          {tab === 'training' && <TrainingSections clientId={clientId} setErr={setErr} />}
          {tab === 'prompts' && <PromptsTab clientId={clientId} setErr={setErr} />}
          {tab === 'tools' && <ToolsTab clientId={clientId} setErr={setErr} />}
        </>
      )}
    </div>
  );
}

// ── Overview — one glance at the whole client, composed from the real endpoints ────
function OverviewTab({ clientId, client, setErr, goTab }) {
  const api = useApi(clientId);
  const [team, setTeam] = useState(undefined);
  const [agendas, setAgendas] = useState(null);
  const [insights, setInsights] = useState(null);
  const [prompts, setPrompts] = useState(null);
  const [tools, setTools] = useState(null);

  useEffect(() => {
    setTeam(undefined); setAgendas(null); setInsights(null); setPrompts(null); setTools(null);
    api('/beaiready/training/team-analysis').then(setTeam).catch(() => setTeam(null));
    api('/beaiready/training/agendas').then(setAgendas).catch(() => setAgendas([]));
    api('/beaiready/training/form-insights').then(setInsights).catch(() => setInsights([]));
    api('/prompts').then(setPrompts).catch(() => setPrompts([]));
    apiFetch(`/beaiready/admin/clients/${clientId}/tools`).then(setTools).catch(() => setTools([]));
  }, [api, clientId]);

  const feedback = (insights || []).find((f) => f.form_type === 'feedback');
  const ownPrompts = (prompts || []).filter((p) => p.newsroom_id === clientId);
  const published = (agendas || []).filter((a) => a.status === 'published').length;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat n={client ? client.user_count : '—'} label="logins" onClick={() => goTab('users')} />
        <Stat n={agendas ? agendas.length : '—'} label={`trainings${agendas ? ` · ${published} live` : ''}`} onClick={() => goTab('training')} />
        <Stat n={team && team.team_size ? team.team_size : '—'} label="survey responses" onClick={() => goTab('training')} />
        <Stat n={feedback ? feedback.responses : 0} label="feedback responses" onClick={() => goTab('training')} />
        <Stat n={ownPrompts.length} label="client prompts" onClick={() => goTab('prompts')} />
        <Stat n={tools ? tools.length : '—'} label="tools assigned" onClick={() => goTab('tools')} />
      </div>

      {team && team.familiarity && (
        <div style={{ ...card, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><div style={kicker}>AI familiarity</div><div style={{ fontSize: 20, fontWeight: 800, color: '#c75b39' }}>{team.familiarity.avg}/10</div></div>
          <div style={{ fontSize: 13, color: '#6b6359' }}>
            Beginner {team.familiarity.beginner} · Intermediate {team.familiarity.intermediate} · Advanced {team.familiarity.advanced}
          </div>
          {feedback && feedback.rating && (
            <div style={{ marginLeft: 'auto' }}>
              <div style={kicker}>Training rated</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#166534' }}>{feedback.rating.avg}/10</div>
            </div>
          )}
        </div>
      )}

      {/* Pushing the client's dashboard live lives here too — it's the whole-client action. */}
      <DashboardRefresh clientId={clientId} setErr={setErr} />

      {team === undefined && <p style={muted}>Loading the client's picture…</p>}
      {team === null && <p style={muted}>No intake survey yet — connect their Google form under Training.</p>}
    </div>
  );
}

function Stat({ n, label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: '12px 18px', minWidth: 110,
      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#c75b39', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12, color: '#6b6359', marginTop: 3 }}>{label}</div>
    </button>
  );
}

// ── Users — the client's logins, access code and insight consent ───────────────────
function UsersTab({ client, onChanged, setErr }) {
  if (!client) return <p style={muted}>Loading…</p>;
  return (
    <div style={card}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{client.name}{!client.is_active && <span style={{ color: '#8a8076', fontWeight: 400 }}> · inactive</span>}</div>
      <div style={{ fontSize: 12, color: '#8a8076', marginTop: 2 }}>
        /{client.slug} · {client.user_count} login{client.user_count === 1 ? '' : 's'}{client.website ? ` · ${client.website}` : ''}
      </div>
      <AccessCodeControl client={client} onChanged={onChanged} setErr={setErr} />
      <InsightsConsentControl client={client} onChanged={onChanged} setErr={setErr} />
      <LoginsPanel client={client} onChanged={onChanged} setErr={setErr} />
    </div>
  );
}

// ── Prompts — this client's own library (global seeds are shown but not theirs) ────
function PromptsTab({ clientId, setErr }) {
  const api = useApi(clientId);
  const [prompts, setPrompts] = useState(null);
  const load = useCallback(() => { api('/prompts').then(setPrompts).catch((e) => setErr(e.message)); }, [api, setErr]);
  useEffect(() => { setPrompts(null); load(); }, [load]);

  const own = (prompts || []).filter((p) => p.newsroom_id === clientId);
  const global = (prompts || []).filter((p) => !p.newsroom_id);
  const remove = async (id) => { setErr(''); try { await api(`/prompts/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={kicker}>This client's own prompts</div>
        {prompts === null ? <p style={muted}>Loading…</p> : own.length === 0 ? (
          <p style={muted}>None yet. Share one from the Prompt library page, and it lands in their library.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {own.map((p) => (
              <div key={p.id} style={{ ...card, marginBottom: 0, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{p.title}</strong>
                  {p.task_type && <span style={{ ...pill, background: '#f1f0ec', color: '#6b6359', marginLeft: 6 }}>{p.task_type}</span>}
                  {p.description && <div style={{ fontSize: 13, color: '#6b6359', marginTop: 3 }}>{p.description}</div>}
                </div>
                <button type="button" onClick={() => remove(p.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div style={kicker}>Also available to them (global library)</div>
        <p style={{ ...muted, fontSize: 13 }}>
          {prompts === null ? 'Loading…' : `${global.length} shared prompt${global.length === 1 ? '' : 's'} every client can see.`}
        </p>
      </div>
    </div>
  );
}

// ── Tools — what their team already uses (derived) + what you recommend (assigned) ─
function ToolsTab({ clientId, setErr }) {
  const api = useApi(clientId);
  const [team, setTeam] = useState(undefined);       // derived: tools from their intake survey
  const [assigned, setAssigned] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAssigned = useCallback(() => {
    apiFetch(`/beaiready/admin/clients/${clientId}/tools`).then(setAssigned).catch((e) => setErr(e.message));
  }, [clientId, setErr]);

  useEffect(() => {
    setTeam(undefined); setAssigned(null); setPick(''); setNote('');
    api('/beaiready/training/team-analysis').then(setTeam).catch(() => setTeam(null));
    loadAssigned();
    apiFetch('/public/toolkit').then((d) => setCatalogue(Array.isArray(d) ? d : (d.tools || d.items || []))).catch(() => setCatalogue([]));
  }, [api, clientId, loadAssigned]);

  const assign = async () => {
    const tool = catalogue.find((t) => t.slug === pick);
    if (!tool) return;
    setBusy(true); setErr('');
    try {
      await apiFetch(`/beaiready/admin/clients/${clientId}/tools`, {
        method: 'POST', body: JSON.stringify({ tool_slug: tool.slug, tool_name: tool.name, note: note || null }),
      });
      setPick(''); setNote(''); loadAssigned();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const unassign = async (id) => {
    setErr('');
    try { await apiFetch(`/beaiready/admin/clients/${clientId}/tools/${id}`, { method: 'DELETE' }); loadAssigned(); }
    catch (e) { setErr(e.message); }
  };

  const derived = (team && team.tools) || [];
  const assignedSlugs = new Set((assigned || []).map((t) => t.tool_slug));

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={kicker}>Already in use — from their own survey</div>
        {team === undefined ? <p style={muted}>Loading…</p>
          : derived.length === 0 ? <p style={muted}>No tools reported yet — this comes from their intake survey.</p>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', marginTop: 4 }}>
                {derived.map((t) => (
                  <span key={t.label} style={chip}>{t.label}<span style={{ color: '#8a8076', marginLeft: 4 }}>×{t.count}</span></span>
                ))}
              </div>
            )}
      </div>

      <div>
        <div style={kicker}>Recommended for this client</div>
        {assigned === null ? <p style={muted}>Loading…</p> : assigned.length === 0 ? (
          <p style={muted}>Nothing assigned yet — pick a tool from the Toolbox below.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
            {assigned.map((t) => (
              <div key={t.id} style={{ ...card, marginBottom: 0, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{t.tool_name}</strong>
                  {t.note && <div style={{ fontSize: 13, color: '#6b6359', marginTop: 3 }}>{t.note}</div>}
                </div>
                <button type="button" onClick={() => unassign(t.id)} style={{ ...tag, color: '#b91c1c' }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...card, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Assign a tool from the Toolbox</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...inp, minWidth: 240 }}>
            <option value="">— Choose a tool —</option>
            {catalogue.filter((t) => !assignedSlugs.has(t.slug)).map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}{t.primary_category ? ` · ${t.primary_category}` : ''}</option>
            ))}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this tool, for this client (optional)" style={{ ...inp, flex: '1 1 260px' }} />
          <button type="button" onClick={assign} disabled={busy || !pick} style={btn}>{busy ? 'Assigning…' : 'Assign'}</button>
        </div>
      </div>
    </div>
  );
}

const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 14, marginBottom: 0 };
const banner = { background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39', marginBottom: 6 };
const inp = { padding: '8px 12px', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' };
const btn = { padding: '9px 16px', background: '#c75b39', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const tag = { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e4dcd2', background: '#faf8f5', color: '#6b6359', cursor: 'pointer' };
const pill = { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' };
const chip = { fontSize: 12.5, background: '#f7ece7', color: '#7a4636', padding: '3px 10px', borderRadius: 999 };
const muted = { color: '#8a8076', fontSize: 13, margin: 0 };
