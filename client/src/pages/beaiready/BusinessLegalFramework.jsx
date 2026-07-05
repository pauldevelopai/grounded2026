// BusinessLegalFramework — "here are the rules that apply to you" (item 6).
// Presentation only: it surfaces the two frameworks that bite for an SA business
// using AI (POPIA + the EU AI Act) and maps them onto the business's OWN AI
// System Register — reusing the EU AI Act risk tiers already recorded there.
// No new engine; the live, dated legal text lives in the tracker (/regulations).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../hooks/useApi.js';

// Mirror the register's tier colours so the two views read as one system.
const RISK = {
  unacceptable: { bg: '#fee2e2', fg: '#991b1b', label: 'Unacceptable' },
  high:         { bg: '#fed7aa', fg: '#9a3412', label: 'High risk' },
  limited:      { bg: '#fef9c3', fg: '#854d0e', label: 'Limited risk' },
  minimal:      { bg: '#dcfce7', fg: '#166534', label: 'Minimal risk' },
  unclassified: { bg: '#e2e8f0', fg: '#475569', label: 'Unclassified' },
};

export default function BusinessLegalFramework() {
  const [data, setData] = useState(undefined); // undefined=loading, obj=loaded, null=error
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/beaiready/governance/legal-framework')
      .then(setData)
      .catch((e) => { setErr(e.message); setData(null); });
  }, []);

  const popia = data?.frameworks?.find((f) => f.key === 'popia');
  const euAct = data?.frameworks?.find((f) => f.key === 'eu_ai_act');
  const reg = data?.register;

  return (
    <div className="hub hub-beaiready">
      <div className="hub-eyebrow">Governance · your dashboard</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 6px' }}>The rules that apply to you</h1>
      <p style={{ color: '#6b6359', maxWidth: '66ch', marginBottom: 18 }}>
        A plain-language read of the legal frameworks your business operates under when it uses AI —
        <strong> POPIA</strong> and the <strong>EU AI Act</strong> — mapped onto the AI systems you've
        logged. Reference guidance, not legal advice.
      </p>
      <p style={{ marginBottom: 20 }}>
        <Link to="/dashboard">← Back to dashboard</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/security">AI System Register</Link> &nbsp;·&nbsp;
        <Link to="/dashboard/governance">Your AI policy</Link> &nbsp;·&nbsp;
        <Link to="/tracker">Legal &amp; Regulation tracker</Link>
      </p>

      {err && <div style={{ background: '#FEF2F2', color: '#B91C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}
      {data === undefined && <p style={{ color: '#8a8076' }}>Loading…</p>}

      {reg && reg.total === 0 && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2', marginBottom: 16 }}>
          <p style={{ color: '#6b6359', margin: 0 }}>
            The frameworks below apply regardless — but to see <em>which rules bite hardest for you</em>,
            log your AI systems so we can map them to their risk tiers.
          </p>
          <p style={{ marginTop: 10 }}><Link to="/dashboard/security" style={linkBtn}>Build your AI register →</Link></p>
        </section>
      )}

      {/* ── POPIA ── */}
      {popia && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{popia.name}</h2>
            <span style={badge}>{popia.jurisdiction}</span>
          </div>
          <p style={{ color: '#6b6359', marginTop: 8 }}><strong>When it applies:</strong> {popia.applies_when}</p>
          <div className="hub-card-kicker">What it requires</div>
          <ul className="hub-card-points">{popia.obligations.map((o, i) => <li key={i}>{o}</li>)}</ul>

          {reg && (
            <div style={mapBox}>
              {reg.personal_data_systems.length > 0 ? (
                <>
                  <strong>{reg.personal_data_systems.length}</strong> of your logged systems record data going into them —
                  these are where POPIA bites first:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {reg.personal_data_systems.map((s, i) => (
                      <li key={i}><strong>{s.tool_name}</strong> <span style={{ color: '#8a8076' }}>— {s.data_shared}</span></li>
                    ))}
                  </ul>
                  <p style={{ margin: '8px 0 0', fontSize: 12.5 }}>Check each records only what it needs, and where the tool stores/sends it.</p>
                </>
              ) : (
                <>No logged system records personal data going into it yet. As you fill in the “data shared” field on your <Link to="/dashboard/security">register</Link>, POPIA-relevant systems will surface here.</>
              )}
            </div>
          )}
          {popia.tracker_query && (
            <p style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
              <Link to={`/tracker?q=${encodeURIComponent(popia.tracker_query)}`} style={linkBtn}>See POPIA activity in the tracker →</Link>
            </p>
          )}
        </section>
      )}

      {/* ── EU AI Act ── */}
      {euAct && (
        <section className="hub-band" style={{ background: '#fff', border: '1px solid #e4dcd2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{euAct.name}</h2>
            <span style={badge}>{euAct.jurisdiction}</span>
          </div>
          <p style={{ color: '#6b6359', marginTop: 8 }}><strong>When it applies:</strong> {euAct.applies_when}</p>
          <div className="hub-card-kicker">The four tiers — and where your systems sit</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
            {euAct.tiers.map((t) => {
              const risk = RISK[t.tier] || RISK.unclassified;
              const yours = reg?.by_tier?.[t.tier] || [];
              return (
                <div key={t.tier} style={{ border: `1px solid ${risk.bg}`, borderLeft: `4px solid ${risk.fg}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: risk.bg, color: risk.fg, fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 999 }}>{risk.label}</span>
                      <strong style={{ fontSize: 13.5 }}>{t.headline}</strong>
                    </span>
                    <span style={{ fontSize: 12.5, color: yours.length ? risk.fg : '#8a8076', fontWeight: 600 }}>
                      {yours.length} of your system{yours.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4b463f' }}>{t.requirement}</p>
                  {yours.length > 0 && (
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#6b6359' }}>{yours.join(' · ')}</p>
                  )}
                </div>
              );
            })}
          </div>

          {reg?.unclassified > 0 && (
            <div style={{ ...mapBox, background: '#fff7ed', borderColor: '#fed7aa' }}>
              <strong>{reg.unclassified}</strong> of your systems aren’t risk-classified yet — classify them on the{' '}
              <Link to="/dashboard/security">register</Link> to know which obligations bite.
            </div>
          )}
          {euAct.tracker_query && (
            <p style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
              <Link to={`/tracker?q=${encodeURIComponent(euAct.tracker_query)}`} style={linkBtn}>See EU AI Act activity in the tracker →</Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const badge = { fontSize: 12, color: '#475569', background: '#f1f5f9', padding: '3px 9px', borderRadius: 999 };
const mapBox = { marginTop: 12, padding: '11px 13px', background: '#f6f2ec', border: '1px solid #e4dcd2', borderRadius: 8, fontSize: 13, color: '#4b463f', lineHeight: 1.5 };
const linkBtn = { fontWeight: 600, color: '#c75b39' };
