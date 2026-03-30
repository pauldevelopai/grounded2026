import { useState, useEffect } from 'react';
import { apiFetch } from '../../hooks/useApi.js';
import PageHeader from '../../components/PageHeader.jsx';
import AiBadge from '../../components/AiBadge.jsx';

const STATUS_COLORS = {
  active:    { bg: '#DBEAFE', text: '#1D4ED8', label: 'Active' },
  appealing: { bg: '#EDE9FE', text: '#6D28D9', label: 'Appealing' },
  settled:   { bg: '#D1FAE5', text: '#065F46', label: 'Settled' },
  dismissed: { bg: '#F3F4F6', text: '#6B7280', label: 'Dismissed' },
  decided:   { bg: '#FEF3C7', text: '#92400E', label: 'Decided' },
};

const TYPE_COLORS = {
  copyright:  '#6366F1',
  privacy:    '#F59E0B',
  defamation: '#EF4444',
  labour:     '#10B981',
  contract:   '#EC4899',
  other:      '#94A3B8',
};

const MAJOR_DEFENDANTS = ['OpenAI', 'Microsoft', 'Meta', 'Google', 'Stability AI', 'Anthropic', 'Midjourney', 'Perplexity'];

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.active;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.text, letterSpacing: '0.02em' }}>
      {s.label.toUpperCase()}
    </span>
  );
}

function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || '#94A3B8';
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: color + '20', color, border: `1px solid ${color}40` }}>
      {(type || 'other').replace('_', ' ')}
    </span>
  );
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(d) {
  if (!d) return null;
  const diff = Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function LawsuitTracker() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDefendant, setFilterDefendant] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshMsg, setRefreshMsg] = useState(null);

  function loadAll() {
    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (filterDefendant) params.set('defendant', filterDefendant);
    if (filterType !== 'all') params.set('case_type', filterType);
    if (search) params.set('q', search);

    return Promise.all([
      apiFetch(`/lawsuits?${params}`),
      apiFetch('/lawsuits/stats'),
    ]).then(([c, s]) => {
      setCases(c);
      setStats(s);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { loadAll(); }, [filterStatus, filterDefendant, filterType, search]);

  async function refresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const r = await apiFetch('/lawsuits/refresh', { method: 'POST', timeout: 300000 });
      setRefreshMsg({ type: 'success', text: r.result || 'Refresh complete' });
      await loadAll();
    } catch (err) {
      setRefreshMsg({ type: 'error', text: 'Refresh failed: ' + err.message });
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 12000);
    }
  }

  const activeCases = cases.filter(c => c.status === 'active' || c.status === 'appealing');

  return (
    <div>
      <PageHeader title="AI Lawsuit Tracker">
        <AiBadge />
        <button className="btn btn-secondary btn-small" onClick={refresh} disabled={refreshing} style={{ fontSize: 11 }}>
          {refreshing ? 'Scanning sources…' : '↻ Refresh Cases'}
        </button>
      </PageHeader>

      {/* Refresh status banner */}
      {refreshMsg && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13,
          background: refreshMsg.type === 'success' ? '#D1FAE5' : '#FEE2E2',
          color: refreshMsg.type === 'success' ? '#065F46' : '#991B1B',
          border: `1px solid ${refreshMsg.type === 'success' ? '#6EE7B7' : '#FECACA'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{refreshMsg.type === 'success' ? '✓ ' : '⚠ '}{refreshMsg.text}</span>
          <button onClick={() => setRefreshMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5 }}>×</button>
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Cases', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Active', value: parseInt(stats.active || 0) + parseInt(stats.appealing || 0), color: '#1D4ED8' },
            { label: 'Settled', value: stats.settled || 0, color: '#065F46' },
            { label: 'Dismissed', value: stats.dismissed || 0, color: '#6B7280' },
            { label: 'Decided', value: stats.decided || 0, color: '#92400E' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '10px 16px', minWidth: 90, textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming deadlines */}
      {stats?.deadlines?.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderLeft: '3px solid #EF4444' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⏱ Upcoming Deadlines</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {stats.deadlines.map(d => {
              const days = daysUntil(d.next_deadline);
              const urgent = days !== null && days <= 30;
              return (
                <div key={d.id} onClick={() => setSelected(d.id)} style={{ cursor: 'pointer', fontSize: 12, padding: '5px 10px', borderRadius: 6, border: `1px solid ${urgent ? '#FECACA' : 'var(--border-color)'}`, background: urgent ? '#FEF2F2' : 'var(--card-bg)' }}>
                  <span style={{ fontWeight: 600 }}>{d.case_name.length > 35 ? d.case_name.slice(0, 35) + '…' : d.case_name}</span>
                  <span style={{ color: urgent ? '#EF4444' : 'var(--text-secondary)', marginLeft: 6 }}>
                    {formatDate(d.next_deadline)}{days !== null && ` (${days}d)`}
                  </span>
                  {d.next_deadline_notes && <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>{d.next_deadline_notes}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top defendants bar */}
      {stats?.defendants?.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Defendants:</span>
          {stats.defendants.map(d => (
            <button key={d.defendant} onClick={() => setFilterDefendant(filterDefendant === d.defendant ? '' : d.defendant)}
              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, border: `1.5px solid ${filterDefendant === d.defendant ? 'var(--accent)' : 'var(--border-color)'}`, background: filterDefendant === d.defendant ? 'var(--accent)' : 'transparent', color: filterDefendant === d.defendant ? 'white' : 'var(--text-secondary)', cursor: 'pointer' }}>
              {d.defendant} <span style={{ opacity: 0.7 }}>({d.case_count})</span>
            </button>
          ))}
          {filterDefendant && <button onClick={() => setFilterDefendant('')} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕ Clear</button>}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Search cases, parties…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13, minWidth: 200 }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="appealing">Appealing</option>
          <option value="settled">Settled</option>
          <option value="dismissed">Dismissed</option>
          <option value="decided">Decided</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <option value="all">All Types</option>
          <option value="copyright">Copyright</option>
          <option value="privacy">Privacy</option>
          <option value="defamation">Defamation</option>
          <option value="labour">Labour</option>
          <option value="contract">Contract</option>
          <option value="other">Other</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>
          {cases.length} case{cases.length !== 1 ? 's' : ''} {filterStatus !== 'all' || filterDefendant || filterType !== 'all' || search ? '(filtered)' : ''}
        </span>
      </div>

      {loading && <div className="empty-state"><p>Loading cases…</p></div>}

      {!loading && cases.length === 0 && (
        <div className="empty-state">
          <h3>No cases found.</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Try adjusting your filters, or click Refresh Cases to scan for new litigation.</p>
        </div>
      )}

      {/* Case list */}
      {!loading && cases.map(c => (
        <CaseCard key={c.id} case_={c} selected={selected === c.id} onSelect={() => setSelected(selected === c.id ? null : c.id)} />
      ))}
    </div>
  );
}

function CaseCard({ case_: c, selected, onSelect }) {
  const deadline = c.next_deadline ? daysUntil(c.next_deadline) : null;
  const deadlineUrgent = deadline !== null && deadline <= 30 && (c.status === 'active' || c.status === 'appealing');

  return (
    <div className="card" style={{
      marginBottom: 6, padding: 0, overflow: 'hidden',
      borderLeft: `3px solid ${TYPE_COLORS[c.case_type] || '#94A3B8'}`,
      cursor: 'pointer',
    }} onClick={onSelect}>
      {/* Header row */}
      <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
            <StatusBadge status={c.status} />
            <TypeBadge type={c.case_type} />
            {c.jurisdiction && c.jurisdiction !== 'US Federal' && (
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#F1F5F9', color: '#475569', fontWeight: 600 }}>{c.jurisdiction}</span>
            )}
            {c.district && (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{c.district}{c.circuit ? ` · ${c.circuit}` : ''}</span>
            )}
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{c.case_name}</div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <span style={{ color: 'var(--text-primary)' }}>{(c.plaintiffs || []).join(', ') || '—'}</span>
            <span style={{ margin: '0 6px', color: '#CBD5E1' }}>v.</span>
            <span style={{ color: 'var(--text-primary)' }}>{(c.defendants || []).join(', ') || '—'}</span>
          </div>

          {c.summary && !selected && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {c.summary}
            </div>
          )}

          {/* Key issues chips */}
          {selected && c.key_issues?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {c.key_issues.map(issue => (
                <span key={issue} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#F1F5F9', color: '#475569' }}>{issue}</span>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
          {c.filing_date && <div>Filed {formatDate(c.filing_date)}</div>}
          {c.judge && <div style={{ marginTop: 2 }}>Judge {c.judge}</div>}
          {c.settlement_amount && <div style={{ marginTop: 2, color: '#065F46', fontWeight: 600 }}>{c.settlement_amount}</div>}
        </div>
      </div>

      {/* Expanded detail */}
      {selected && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '12px 14px', background: '#FAFBFC' }}>
          {c.summary && (
            <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10, color: 'var(--text-primary)' }}>{c.summary}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
            {c.court && <DetailField label="Court" value={c.court} />}
            {c.district && <DetailField label="District/Circuit" value={`${c.district}${c.circuit ? ` · ${c.circuit}` : ''}`} />}
            {c.last_update && <DetailField label="Last Update" value={formatDate(c.last_update)} />}
            {c.outcome && <DetailField label="Outcome" value={c.outcome} />}
          </div>

          {c.next_deadline && (
            <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: deadlineUrgent ? '#FEF2F2' : '#EFF6FF', border: `1px solid ${deadlineUrgent ? '#FECACA' : '#BFDBFE'}` }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: deadlineUrgent ? '#EF4444' : '#1D4ED8' }}>
                Next: {c.next_deadline_notes || 'Deadline'} — {formatDate(c.next_deadline)}
                {deadline !== null && ` (${deadline > 0 ? `in ${deadline} days` : 'past'})`}
              </span>
            </div>
          )}

          {c.curriculum_relevance && (
            <div style={{ fontSize: 12, padding: '8px 10px', background: '#EEF2FF', borderRadius: 6, color: 'var(--accent)', marginBottom: 10, lineHeight: 1.5 }}>
              <strong>Curriculum relevance:</strong> {c.curriculum_relevance}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {c.case_url && (
              <a href={c.case_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-small" style={{ fontSize: 11 }}>
                Court Documents →
              </a>
            )}
            {c.source_url && c.source_url !== c.case_url && (
              <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-small" style={{ fontSize: 11 }}>
                Source Article →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
