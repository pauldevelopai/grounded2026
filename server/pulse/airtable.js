// Pulse Airtable client — the ONLY Airtable integration in the tracker.
//
// Non-destructive contract (enforced by this module):
//   • WRITES go only to the four Pulse tables (Cycles / Questions / Responses /
//     Change Plans).
//   • READS are allowed from Newsrooms and Node Installs (and best-effort Node
//     Events) for context only.
// The write helpers below physically cannot target a non-Pulse table — they
// hard-code the Pulse table IDs.
import config from '../config.js';

const API = 'https://api.airtable.com/v0';

// Table IDs in MediaMap (app4FVlF4AAy8Q8s2). Created in Phase 1.
export const TABLES = {
  CYCLES:        'tblqJM6HuyZRjcCTU',
  QUESTIONS:     'tblq6wSC8Ilq417GQ',
  RESPONSES:     'tblEWg58SenX8taon',
  PLANS:         'tblrc65g0eoM1n2bP',
  // Read-only sources:
  NEWSROOMS:     'tblUCJtQvYFcSIdxP',
  NODE_INSTALLS: 'tbl14KQxvb6HUUzcs',
  NODE_EVENTS:   'tblJhlmbK5yYmsRs6',
};

const WRITABLE = new Set([TABLES.CYCLES, TABLES.QUESTIONS, TABLES.RESPONSES, TABLES.PLANS]);

function assertConfigured() {
  if (!config.airtableApiKey) throw new Error('AIRTABLE_API_KEY not configured');
  if (!config.airtableBaseId) throw new Error('AIRTABLE_BASE_ID not configured');
}

// Airtable Meta API (schema). Separate base path from the data API.
async function metaRequest(path) {
  assertConfigured();
  const res = await fetch(`${API}/meta/bases/${config.airtableBaseId}/${path}`, {
    headers: { Authorization: `Bearer ${config.airtableApiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Airtable meta ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function request(method, path, { body, query } = {}) {
  assertConfigured();
  let url = `${API}/${config.airtableBaseId}/${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.airtableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Airtable ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function guardWritable(tableId) {
  if (!WRITABLE.has(tableId)) {
    throw new Error(`Refusing to write to non-Pulse table ${tableId}`);
  }
}

// ── Generic reads ──────────────────────────────────────────────────────────
// Lists all records (auto-paginates). filterByFormula/sort/fields are optional.
export async function listAll(tableId, { filterByFormula, sort, fields, maxRecords } = {}) {
  const out = [];
  let offset;
  do {
    const query = { pageSize: '100' };
    if (filterByFormula) query.filterByFormula = filterByFormula;
    if (offset) query.offset = offset;
    // Airtable expects sort[0][field], fields[] as repeated params — easiest via
    // URLSearchParams append loop:
    const params = new URLSearchParams(query);
    (fields || []).forEach((f) => params.append('fields[]', f));
    (sort || []).forEach((s, i) => {
      params.append(`sort[${i}][field]`, s.field);
      if (s.direction) params.append(`sort[${i}][direction]`, s.direction);
    });
    const data = await request('GET', `${tableId}?${params.toString()}`);
    out.push(...(data.records || []));
    offset = data.offset;
    if (maxRecords && out.length >= maxRecords) return out.slice(0, maxRecords);
  } while (offset);
  return out;
}

export async function getRecord(tableId, recordId) {
  return request('GET', `${tableId}/${recordId}`);
}

// ── Pulse writes (guarded) ─────────────────────────────────────────────────
export async function createRecords(tableId, records) {
  guardWritable(tableId);
  const data = await request('POST', tableId, {
    body: { records: records.map((fields) => ({ fields })), typecast: true },
  });
  return data.records;
}

export async function createRecord(tableId, fields) {
  const [rec] = await createRecords(tableId, [fields]);
  return rec;
}

export async function updateRecord(tableId, recordId, fields) {
  guardWritable(tableId);
  return request('PATCH', `${tableId}/${recordId}`, { body: { fields, typecast: true } });
}

// ── Convenience reads for context ──────────────────────────────────────────
export async function listNewsrooms() {
  return listAll(TABLES.NEWSROOMS, { fields: ['Name', 'Country', 'Type', 'Cohort Name'] });
}

// ── MediaMap: the Africa-wide directory + AI-journey overlay ────────────────
// One row per media organisation in the Newsrooms table, folded together with
// its Pulse cycle activity (grouped by the "Newsroom record ID" back-reference
// on Cycles). Newsrooms are fetched with ALL fields — never a `fields[]` filter —
// so a renamed or absent journey column can never 422 the whole map; we just
// read what's there. This is the read behind GET /beaiready/admin/mediamap.
export async function mediamapNewsrooms() {
  const [rooms, cycles] = await Promise.all([
    listAll(TABLES.NEWSROOMS),
    listAll(TABLES.CYCLES, { fields: ['Newsroom record ID', 'Status', 'Triggered date'] }),
  ]);
  // Airtable values: singleSelect → {name}, multi/linked → [{name}|string], else text.
  const pick = (v) => (v == null ? ''
    : Array.isArray(v) ? v.map((x) => (x && x.name) || x).filter(Boolean).join(', ')
    : (v && v.name) || v);

  const byRoom = new Map();
  for (const c of cycles) {
    const rid = c.fields?.['Newsroom record ID'];
    if (!rid) continue;
    if (!byRoom.has(rid)) byRoom.set(rid, []);
    byRoom.get(rid).push(c);
  }

  return rooms.map((r) => {
    const f = r.fields || {};
    const cs = (byRoom.get(r.id) || []).slice().sort((a, b) =>
      String(b.fields?.['Triggered date'] || '').localeCompare(String(a.fields?.['Triggered date'] || '')));
    const latest = cs[0];
    return {
      id: r.id,
      name: pick(f.Name),
      country: pick(f.Country),
      type: pick(f.Type),
      cohort: pick(f['Cohort Name']),
      languages: pick(f.Languages),
      aiTools: pick(f['AI tools used']),
      who: pick(f['Who are they?']),
      journeyStatus: pick(f['AI Journey Status']),
      notes: pick(f.Notes),
      cyclesRun: cs.length,
      latestCycleStatus: latest ? pick(latest.fields?.Status) : '',
      latestCycleDate: latest ? (latest.fields?.['Triggered date'] || '') : '',
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function listNodeInstalls() {
  return listAll(TABLES.NODE_INSTALLS);
}

// Prior Pulse responses for a newsroom (by stored newsroom record id), newest
// first, capped. Walks Cycles → Responses.
export async function priorResponsesForNewsroom(newsroomRecordId, limit = 5) {
  if (!newsroomRecordId) return [];
  const cycles = await listAll(TABLES.CYCLES, {
    filterByFormula: `{Newsroom record ID} = '${newsroomRecordId}'`,
  });
  const responseIds = cycles.flatMap((c) => c.fields?.Response || []);
  if (!responseIds.length) return [];
  const responses = [];
  for (const id of responseIds) {
    try { responses.push(await getRecord(TABLES.RESPONSES, id)); } catch { /* skip */ }
  }
  responses.sort((a, b) =>
    String(b.fields?.['Submitted at'] || '').localeCompare(String(a.fields?.['Submitted at'] || '')));
  return responses.slice(0, limit);
}

// Tag library = the singleSelect choices on Questions.Tag. Read via Meta API so
// it reflects Paul's curation even before any question uses a tag. Falls back to
// scanning records if the meta call fails.
export async function tagLibrary() {
  try {
    const data = await metaRequest('tables');
    const t = (data.tables || []).find((x) => x.id === TABLES.QUESTIONS);
    const tag = (t?.fields || []).find((f) => f.name === 'Tag');
    const choices = tag?.options?.choices || [];
    if (choices.length) return choices.map((c) => c.name);
  } catch { /* fall through */ }
  try {
    const recs = await listAll(TABLES.QUESTIONS, { fields: ['Tag'] });
    return [...new Set(recs.map((r) => r.fields?.Tag?.name || r.fields?.Tag).filter(Boolean))];
  } catch {
    return [];
  }
}

// Find a Cycle by its public token (token is embedded in the Public URL).
export async function cycleByToken(token) {
  if (!token) return null;
  const safe = String(token).replace(/'/g, '');
  const recs = await listAll(TABLES.CYCLES, {
    filterByFormula: `FIND('${safe}', {Public URL})`,
    maxRecords: 1,
  });
  return recs[0] || null;
}

// Best-effort recent Node Events for a slug (read-only context; never fatal).
export async function recentNodeEvents(slug, limit = 10) {
  if (!slug) return [];
  try {
    const recs = await listAll(TABLES.NODE_EVENTS, { maxRecords: 200 });
    return recs
      .filter((r) => {
        const f = r.fields || {};
        return String(f.slug || f.Slug || '').toLowerCase() === String(slug).toLowerCase();
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}
