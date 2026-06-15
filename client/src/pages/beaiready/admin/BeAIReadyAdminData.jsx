// BeAIReadyAdminData — Data page of the BE AI READY admin. Scrape / assess /
// commit the shared data that feeds the pillars. This does NOT rebuild any
// pipeline: it surfaces real counts and triggers Grounded's EXISTING background
// jobs (GET/POST /background-jobs) and reads live counts from /admin/overview
// and the published tools catalog (/tools). Grouped by the pillar each source
// feeds. Everything shown is real — no placeholder numbers.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../hooks/useApi.js';

// Each source maps to a pillar and the existing job(s) that feed it. Job keys
// are the background_jobs.name values (= the scheduler registry keys).
const SOURCES = [
  {
    pillar: 'Governance',
    blurb: 'AI lawsuits + regulations, scraped from sources and triaged into the tracker clients see.',
    counts: (o) => [['Lawsuits', o?.legal?.lawsuits], ['Regulations', o?.legal?.regulations], ['Use cases', o?.legal?.use_cases], ['Sources', o?.legal?.sources]],
    jobs: [
      ['legal_sources_ingest', 'Ingest sources', 'Pull new items from every due legal source'],
      ['legal_article_scrape', 'Scrape detail', 'Fetch full article content for new items'],
      ['legal_items_triage', 'Triage + commit', 'Classify items with AI and commit to the tracker'],
      ['governance_today_digest', 'Refresh “Today” digest', 'Regenerate the tracker’s Today summary via a live web search (manual — uses AI credit)'],
    ],
  },
  {
    pillar: 'Data Security',
    blurb: 'The assessed AI-tools catalog clients check their own tools against.',
    counts: (o, tools) => [['Tools in catalog', tools]],
    jobs: [
      ['tools_triage', 'Assess new tools', 'Classify + assess AI tools for the catalog'],
      ['data_security_triage', 'Data-security triage', 'Process queued data-security items'],
    ],
  },
  {
    pillar: 'Training',
    blurb: 'Staff intake + AI-competency form responses, synced hourly from connected sheets.',
    counts: () => [],
    jobs: [
      ['forms_sheet_sync', 'Sync forms', 'Fetch new responses from connected form CSVs'],
    ],
  },
];

const STATUS_STYLE = {
  success: { bg: '#dcfce7', fg: '#166534' }, completed: { bg: '#dcfce7', fg: '#166534' },
  error: { bg: '#fee2e2', fg: '#991b1b' }, failed: { bg: '#fee2e2', fg: '#991b1b' },
  running: { bg: '#fef3c7', fg: '#92400e' },
};

export default function BeAIReadyAdminData() {
  const [jobs, setJobs] = useState(null);   // name -> row
  const [overview, setOverview] = useState(null);
  const [toolsCount, setToolsCount] = useState(null);
  const [running, setRunning] = useState({}); // name -> true while a manual run is in flight
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const loadJobs = () =>
    apiFetch('/background-jobs').then((rows) => {
      const map = {};
      rows.forEach((r) => { map[r.name] = r; });
      setJobs(map);
    }).catch((e) => setErr(e.message));

  useEffect(() => {
    loadJobs();
    apiFetch('/admin/overview').then(setOverview).catch(() => setOverview(null));
    apiFetch('/public/tools').then((t) => setToolsCount(Array.isArray(t) ? t.length : null)).catch(() => setToolsCount(null));
  }, []);

  const run = async (name) => {
    const job = jobs?.[name];
    if (!job) return;
    setErr(''); setMsg('');
    setRunning((r) => ({ ...r, [name]: true }));
    try {
      await apiFetch(`/background-jobs/${job.id}/run`, { method: 'POST' });
      setMsg(`${name} started — refreshing status…`);
      // The run is async server-side; give it a moment then refresh the list.
      setTimeout(async () => { await loadJobs(); setRunning((r) => ({ ...r, [name]: false })); }, 4000);
    } catch (e) {
      setErr(e.message);
      setRunning((r) => ({ ...r, [name]: false }));
    }
  };

  const fmt = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Data</h1>
      <p style={{ color: '#6b6359', marginBottom: 16, maxWidth: '66ch' }}>
        The shared data that feeds the pillars. Scrape, assess and commit run through Grounded's
        pipelines on a schedule — trigger a run on demand here and watch its status. Counts are live.
      </p>
      {err && <div style={banner('#FEF2F2', '#B91C1C')}>{err}</div>}
      {msg && <div style={banner('#ECFDF5', '#065F46')}>{msg}</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {SOURCES.map((s) => {
          const counts = s.counts(overview, toolsCount).filter(([, v]) => v != null);
          return (
            <div key={s.pillar} style={card}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={kicker}>{s.pillar}</span>
              </div>
              <p style={{ fontSize: 13, color: '#6b6359', margin: '2px 0 12px', maxWidth: '64ch' }}>{s.blurb}</p>

              {counts.length > 0 && (
                <div style={{ display: 'flex', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
                  {counts.map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#c75b39', lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 11, color: '#8a8076', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                {s.jobs.map(([name, label, what]) => {
                  const job = jobs?.[name];
                  const status = running[name] ? 'running' : job?.last_status;
                  const st = STATUS_STYLE[status] || { bg: '#f1f0ec', fg: '#8a8076' };
                  return (
                    <div key={name} style={jobRow}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                        <div style={{ fontSize: 12, color: '#8a8076' }}>{what}</div>
                        <div style={{ fontSize: 11.5, color: '#a89e92', marginTop: 2 }}>
                          {jobs == null ? 'loading…' : job
                            ? <>last run {fmt(job.last_run_at)}{job.is_enabled ? '' : ' · paused'}</>
                            : <span style={{ color: '#b91c1c' }}>job not found</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {status && <span style={{ ...pill, background: st.bg, color: st.fg }}>{running[name] ? 'running' : status}</span>}
                        <button onClick={() => run(name)} disabled={!job || running[name]} style={{ ...btn, opacity: !job || running[name] ? 0.5 : 1 }}>
                          {running[name] ? 'Running…' : 'Run now'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12.5, color: '#a89e92', marginTop: 16, maxWidth: '64ch' }}>
        These jobs also run automatically on schedule. The tools catalog is curated by the triage jobs —
        there's no manual entry here, so a client only ever sees assessed, committed data.
      </p>
    </div>
  );
}

const banner = (bg, fg) => ({ background: bg, color: fg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 });
const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const kicker = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c75b39' };
const jobRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#faf8f5', border: '1px solid #f0ebe3', borderRadius: 8 };
const btn = { padding: '7px 14px', background: '#1c1b1a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const pill = { fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', textTransform: 'uppercase' };
