import { useState } from 'react';
import { apiFetch } from '../../hooks/useApi.js';

// Shared bits for the Pulse admin pages.

export const muted = { fontSize: 13, color: 'var(--text-secondary)' };

// Status → accent colour (badges + chips).
export const STATUS_COLOR = {
  Draft: '#F59E0B',
  Vetted: '#6366F1',
  Sent: '#0EA5E9',
  Responded: '#10B981',
  'Plan drafted': '#8B5CF6',
  'Plan approved': '#6366F1',
  Shipped: '#059669',
  'Reported back': '#94A3B8',
  Cancelled: '#EF4444',
};

export function StatusBadge({ status }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: 'white', padding: '2px 8px',
      borderRadius: 10, background: STATUS_COLOR[status] || '#94A3B8', whiteSpace: 'nowrap',
    }}>{status || '—'}</span>
  );
}

export function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// POST/PATCH helper that JSON-encodes the body.
export function sendJson(path, method, body) {
  return apiFetch(path, { method, body: JSON.stringify(body || {}) });
}

// A copy-to-clipboard block for the generated WhatsApp/email/briefing bodies.
export function CopyBlock({ label, text, mono }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        <button className="btn btn-small" onClick={copy} style={{ fontSize: 12 }}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: 12, background: 'var(--bg-secondary, #efe9e1)',
        border: '1px solid var(--border-color)', borderRadius: 8, whiteSpace: 'pre-wrap',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', fontSize: 13, lineHeight: 1.5,
      }}>{text || '—'}</pre>
    </div>
  );
}
