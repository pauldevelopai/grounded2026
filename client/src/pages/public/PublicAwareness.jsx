// Awareness — a splashy public page about newsroom DATA SECURITY. Top-level
// menu item (promoted from the old "Security Audit" tool link). The five
// essentials are evergreen; under each we surface curated resources compiled by
// the data-security pipeline (/public/data-security, grouped by `topic`). The
// interactive Digital Security Audit (auth-gated) is featured as a standout
// launch panel. Renders fine with no published resources.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';

const AUDIT_TO = '/tool/tool-security-audit';

const THEMES = [
  {
    id: 'source-protection',
    icon: '🕵️',
    title: 'Protecting your sources',
    lede: 'A burned source can mean a ruined life — and a story that never gets told again.',
    body: [
      'Confidential source material can leak through the tools you use every day: a messaging app that keeps metadata, a cloud drive shared too widely, an AI assistant that retains what you paste. The threat is rarely a dramatic hack — it is the quiet trail you leave.',
      'Use end-to-end encrypted messaging (Signal) with disappearing messages; prefer a dedicated drop (SecureDrop) for the most sensitive leaks; strip metadata before sharing files; and never paste a source identity into a public AI tool.',
    ],
  },
  {
    id: 'device-security',
    icon: '💻',
    title: 'Securing your devices',
    lede: 'Your phone and laptop are the keys to everything — treat them that way.',
    body: [
      'A lost, stolen, or seized device exposes your contacts, drafts and logins at once. Reporters crossing borders or covering protests are especially exposed.',
      'Turn on full-disk encryption; use a strong passcode, not a face or fingerprint, at checkpoints; keep the OS and apps patched; and carry a clean, minimal device when travelling to high-risk situations.',
    ],
  },
  {
    id: 'account-security',
    icon: '🔑',
    title: 'Locking down your accounts',
    lede: 'Most newsroom breaches start with one reused password and one convincing email.',
    body: [
      'Account takeover — of email, social, or your CMS — lets an attacker read your mail, impersonate you, or pull a story. Phishing remains the number-one way in.',
      'Use a password manager with a unique password per account; turn on phishing-resistant two-factor (a passkey or hardware key beats SMS); and slow down on any "urgent" login link before you click.',
    ],
  },
  {
    id: 'surveillance',
    icon: '📡',
    title: 'Defending against surveillance',
    lede: 'Sometimes the adversary is well-resourced and patient. Plan for it.',
    body: [
      'State and commercial surveillance — network monitoring, location tracking, mercenary spyware like Pegasus — targets journalists specifically. You cannot out-engineer every threat, but you can raise the cost and shrink your exposure.',
      'Minimise what you carry and store; keep software updated to close known exploits; watch for unusual battery, data or device behaviour; and build a relationship with a digital-security responder before you need one.',
    ],
  },
  {
    id: 'data-protection',
    icon: '🗄️',
    title: 'Handling data safely',
    lede: 'The data you hold is a responsibility — and, in a breach, a liability.',
    body: [
      'Investigations accumulate sensitive data: leaked documents, personal information, contact lists. Holding it carelessly risks a breach, and in many places breaks data-protection law (POPIA, GDPR and others).',
      'Encrypt sensitive data at rest; keep tested, encrypted backups; collect and keep only what you need, and delete the rest on a schedule; and know your obligations under local data-protection law before you gather personal data.',
    ],
  },
];

const C = {
  dark: '#0B1220',
  accent: 'var(--accent)',
};

export default function PublicAwareness() {
  const [byTopic, setByTopic] = useState({});
  useEffect(() => {
    publicFetch('/public/data-security')
      .then(r => {
        const g = {};
        (r.items || []).forEach(it => { (g[it.topic] = g[it.topic] || []).push(it); });
        setByTopic(g);
      })
      .catch(() => setByTopic({}));
  }, []);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{
        position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius)',
        background: `radial-gradient(1100px 400px at 15% -10%, #1d3a6e 0%, ${C.dark} 55%)`,
        color: 'white', padding: '54px 40px 48px', marginBottom: 28,
      }}>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 720 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7FB0FF', marginBottom: 14 }}>
            Awareness · Data security
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 800, margin: '0 0 16px 0', letterSpacing: '-0.025em', lineHeight: 1.08 }}>
            Protect your sources,<br />devices and accounts
          </h1>
          <p style={{ fontSize: 17, color: '#C7D2E2', lineHeight: 1.6, margin: '0 0 26px 0', maxWidth: 600 }}>
            Good journalism depends on trust — and trust depends on security. Here are the five
            essentials every newsroom should get right, plus a free audit that risk-scores the
            tools you already use and drafts the fixes.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to={AUDIT_TO} style={{
              fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 'var(--radius)',
              background: 'white', color: C.dark, textDecoration: 'none',
            }}>Run the security audit →</Link>
            <a href="#essentials" style={{
              fontSize: 15, fontWeight: 600, padding: '12px 22px', borderRadius: 'var(--radius)',
              background: 'rgba(255,255,255,0.12)', color: 'white', textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.25)',
            }}>See the five essentials ↓</a>
          </div>
        </div>
        <div style={{
          position: 'absolute', right: -40, top: -30, fontSize: 280, lineHeight: 1,
          opacity: 0.06, zIndex: 0, userSelect: 'none', pointerEvents: 'none',
        }}>🔒</div>
      </section>

      {/* ── Theme pills ──────────────────────────────────────────────── */}
      <section id="essentials" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26, scrollMarginTop: 90 }}>
        {THEMES.map(t => (
          <a key={t.id} href={`#${t.id}`} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 999, textDecoration: 'none',
            border: '1px solid var(--border-color)', color: 'var(--text-primary)', background: 'var(--card-bg)',
          }}>{t.icon} {t.title}</a>
        ))}
      </section>

      {/* ── Themes (audit panel injected after the 2nd) ──────────────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>
        {THEMES.map((t, i) => (
          <div key={t.id} style={{ display: 'contents' }}>
            <article id={t.id} className="card" style={{ padding: 26, scrollMarginTop: 90 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 30, lineHeight: 1 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{String(i + 1).padStart(2, '0')}</div>
                  <h2 style={{ fontSize: 23, fontWeight: 700, margin: '2px 0 0', letterSpacing: '-0.01em' }}>{t.title}</h2>
                </div>
              </div>
              <p style={{ fontSize: 15.5, fontWeight: 600, color: C.accent, margin: '0 0 12px 0' }}>{t.lede}</p>
              {t.body.map((p, j) => (
                <p key={j} style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.66, margin: '0 0 10px 0' }}>{p}</p>
              ))}
              <Resources items={byTopic[t.id]} />
            </article>
            {i === 1 && <AuditPanel />}
          </div>
        ))}
      </section>
    </div>
  );
}

// The interactive Digital Security Audit, featured as a standout launch panel.
function AuditPanel() {
  return (
    <section style={{
      borderRadius: 'var(--radius)', padding: '28px 30px', color: 'white',
      background: `linear-gradient(120deg, ${C.dark} 0%, #16305c 100%)`,
      display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 46, lineHeight: 1 }}>🔐</div>
      <div style={{ flex: '1 1 320px', minWidth: 280 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7FB0FF', marginBottom: 6 }}>
          Free interactive tool
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px 0' }}>Run a Digital Security Audit</h3>
        <p style={{ fontSize: 14.5, color: '#C7D2E2', lineHeight: 1.6, margin: 0 }}>
          List the tools and services your newsroom uses. The audit risk-scores each one for your
          jurisdiction and drafts concrete fixes — prioritised, so you know what to change first.
        </p>
      </div>
      <Link to={AUDIT_TO} style={{
        fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 'var(--radius)',
        background: 'white', color: C.dark, textDecoration: 'none', whiteSpace: 'nowrap',
      }}>Start the audit →</Link>
    </section>
  );
}

// Curated resources for a theme — only renders when the pipeline has published
// something for this topic, so the evergreen guide stands on its own.
function Resources({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
        Latest guidance
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.slice(0, 6).map(it => (
          <a key={it.id} href={it.url || '#'} target="_blank" rel="noreferrer"
             style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              {it.item_type && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: '#E2E8F0', color: '#334155', textTransform: 'capitalize' }}>{it.item_type}</span>}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{it.title}</span>
              {it.source_name && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {it.source_name}</span>}
            </div>
            {it.summary && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{it.summary}</div>}
          </a>
        ))}
      </div>
    </div>
  );
}
