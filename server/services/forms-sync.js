// forms-sync.js — BE AI READY intake (spec Part D). Pulls each enabled
// intake_forms' published-to-web CSV and upserts rows into intake_responses by
// row-hash (idempotent). No Google API keys — a "Publish to web → CSV" URL is
// public. Registered as the hourly `forms_sheet_sync` background job.
import { createHash } from 'node:crypto';
import pool from '../db/pool.js';

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
  const res = await fetch(form.csv_url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
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
