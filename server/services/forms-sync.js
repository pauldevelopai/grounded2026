// forms-sync.js — BE AI READY intake (spec Part D). Pulls each enabled
// intake_forms' published-to-web CSV and upserts rows into intake_responses by
// row-hash (idempotent). No Google API keys — a "Publish to web → CSV" URL is
// public. Registered as the hourly `forms_sheet_sync` background job.
import { createHash } from 'node:crypto';
import pool from '../db/pool.js';

// Turn a pasted Google Sheets link into something that actually returns CSV.
// The classic support call is "0 responses" because someone pasted the normal
// /edit (or /view) URL of the response sheet, which serves an HTML page, not CSV.
//   • An already-published CSV (…/pub?…output=csv or …/export?format=csv) → unchanged.
//   • A normal /spreadsheets/d/<ID>/edit#gid=<gid> link → rewritten to the gviz CSV
//     endpoint, which works for any sheet shared "anyone with the link can view"
//     (no Publish-to-web step needed).
// Anything we don't recognise is returned untouched (and the HTML guard below
// gives a clear error if it isn't CSV).
export function toCsvUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return url;
  if (/output=csv|format=csv|tqx=out:csv/i.test(url)) return url;       // already CSV
  // Published-to-web doc: /spreadsheets/d/e/<pubId>/pub… → ask for CSV.
  const pub = url.match(/\/spreadsheets\/d\/e\/([^/]+)\/pub/i);
  if (pub) {
    const gid = (url.match(/[?&]gid=(\d+)/) || [])[1];
    return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?single=true&output=csv${gid ? `&gid=${gid}` : ''}`;
  }
  // Ordinary edit/view link: /spreadsheets/d/<ID>/edit#gid=<gid> → gviz CSV.
  const doc = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (doc) {
    const gid = (url.match(/[#?&]gid=(\d+)/) || [])[1];
    return `https://docs.google.com/spreadsheets/d/${doc[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
  }
  return url;
}

// Minimal RFC-4180-ish CSV parser (quoted fields, escaped "" quotes, CRLF).
// Avoids a dependency for ~one job.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop a trailing empty row if the file ended with a newline.
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// Turn parsed rows into [{header: value}, …] keyed by the header row.
function toObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h || `col${i}`] = (r[i] ?? '').trim(); });
    return o;
  });
}

async function syncForm(form) {
  const res = await fetch(toCsvUrl(form.csv_url), { redirect: 'follow' });
  if (!res.ok) throw new Error(`the sheet URL returned HTTP ${res.status} — check it's shared so anyone with the link can view`);
  const text = await res.text();
  // Guard the #1 cause of "0 responses": an HTML page (editor / sign-in) instead of CSV.
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html') || /^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('that link returned a web page, not CSV — open the responses Sheet, then File → Share → Publish to web → CSV and paste that link (or share the sheet "anyone with the link")');
  }
  const objects = toObjects(parseCsv(text));
  let inserted = 0;
  for (const obj of objects) {
    const rowHash = createHash('sha256').update(JSON.stringify(obj)).digest('hex');
    // Best-effort timestamp from a common Google Forms column.
    const tsRaw = obj['Timestamp'] || obj['timestamp'] || null;
    const ts = tsRaw ? new Date(tsRaw) : null;
    const submittedAt = ts && !isNaN(ts.getTime()) ? ts.toISOString() : null;
    const r = await pool.query(
      `INSERT INTO intake_responses (newsroom_id, form_name, response, row_hash, submitted_at)
       VALUES ($1,$2,$3::jsonb,$4,$5)
       ON CONFLICT (newsroom_id, form_name, row_hash) DO NOTHING`,
      [form.newsroom_id, form.form_name, JSON.stringify(obj), rowHash, submittedAt]
    );
    inserted += r.rowCount;
  }
  await pool.query('UPDATE intake_forms SET last_synced_at = NOW() WHERE id = $1', [form.id]);
  return { form: form.form_name, total: objects.length, inserted };
}

// JOB_REGISTRY entry: returns { result, itemsProcessed }.
export async function runFormsSheetSync() {
  const { rows: forms } = await pool.query('SELECT * FROM intake_forms WHERE is_enabled = true');
  if (forms.length === 0) return { result: 'No intake forms configured.', itemsProcessed: 0 };
  let inserted = 0;
  const parts = [];
  for (const form of forms) {
    try {
      const r = await syncForm(form);
      inserted += r.inserted;
      parts.push(`${r.form}: +${r.inserted}/${r.total}`);
    } catch (err) {
      parts.push(`${form.form_name}: failed (${err.message})`);
    }
  }
  return { result: parts.join('; '), itemsProcessed: inserted };
}

// Sync ONE form by id and return a per-form result the UI can show verbatim.
// Used by "connect → auto-sync" and the per-form "Sync now" button.
export async function syncOneForm(formId) {
  const { rows } = await pool.query('SELECT * FROM intake_forms WHERE id = $1', [formId]);
  if (!rows.length) throw new Error('Form not found');
  const form = rows[0];
  const r = await syncForm(form);   // { form, total, inserted }
  return { form: form.form_name, ...r, error: null };
}

// Sync every enabled form for ONE tenant and return per-form results (no throw —
// each form's failure is captured) so the admin sees exactly what happened.
export async function syncFormsForTenant(newsroomId) {
  const { rows: forms } = await pool.query(
    'SELECT * FROM intake_forms WHERE newsroom_id = $1 AND is_enabled = true ORDER BY form_name', [newsroomId]);
  const results = [];
  for (const form of forms) {
    try {
      const r = await syncForm(form);
      results.push({ form: form.form_name, total: r.total, inserted: r.inserted, error: null });
    } catch (err) {
      results.push({ form: form.form_name, total: 0, inserted: 0, error: err.message });
    }
  }
  return results;
}
