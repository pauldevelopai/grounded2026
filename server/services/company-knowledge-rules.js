// company-knowledge-rules.js — bulk manifest rules + the publish/search gates.
// Ported from node-aiready lib/rules.js + manifest.js gates, adapted to
// beaiready_company_sources. applyRules is PURE: it layers matching rules over a
// source to compute its EFFECTIVE inclusion + output toggles, never mutating the row,
// and a field the user set by hand (manual_overrides) always wins over a rule.

export const RULE_TARGET_FIELDS = ['inclusion', 'out_clean_markdown', 'out_json_ld', 'out_mirror_md', 'in_llms_txt', 'in_llms_full'];
export const RULE_WHEN_FIELDS = ['category', 'author', 'title', 'kind', 'published_at', 'inclusion'];
export const OPS = ['eq', 'neq', 'contains', 'is_empty', 'within_days', 'older_than_days', 'before', 'after'];

export function applyRules(source, rules) {
  const eff = { ...source };
  const manual = new Set(source.manual_overrides || []);
  for (const rule of rules || []) {
    if (!matches(source, rule.when)) continue;
    for (const [k, v] of Object.entries(rule.then || {})) {
      if (!RULE_TARGET_FIELDS.includes(k)) continue;
      if (manual.has(k)) continue;            // manual edit wins
      eff[k] = v;
    }
  }
  return eff;
}

export function applyRulesAll(sources, rules) {
  return sources.map((s) => applyRules(s, rules));
}

export function countMatches(sources, when) {
  return sources.filter((s) => matches(s, when)).length;
}

// ── Gates (read the EFFECTIVE row, i.e. after applyRules) ──
export function isSearchable(a) {
  return a && a.inclusion !== 'exclude' && a.sensitivity !== 'withdrawn';
}
export function isPublishable(a) {
  return a && a.inclusion === 'include' && (a.sensitivity == null || a.sensitivity === 'none');
}

function matches(source, when) {
  if (!when) return false;
  if (Array.isArray(when.all)) return when.all.every((c) => matchOne(source, c));
  if (Array.isArray(when.any)) return when.any.some((c) => matchOne(source, c));
  return matchOne(source, when);
}

function matchOne(a, c) {
  if (!c || !c.field) return false;
  const raw = a[c.field];
  const val = c.value;
  switch (c.op) {
    case 'eq': return norm(raw) === norm(val);
    case 'neq': return norm(raw) !== norm(val);
    case 'contains': return norm(raw).includes(norm(val));
    case 'is_empty': return raw == null || raw === '';
    case 'within_days': return ageDays(raw) != null && ageDays(raw) <= Number(val);
    case 'older_than_days': return ageDays(raw) != null && ageDays(raw) > Number(val);
    case 'before': return dateOf(raw) != null && dateOf(raw) < dateOf(val);
    case 'after': return dateOf(raw) != null && dateOf(raw) > dateOf(val);
    default: return false;
  }
}

function norm(v) { return String(v ?? '').trim().toLowerCase(); }
function dateOf(v) { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
function ageDays(v) { const t = dateOf(v); return t == null ? null : (Date.now() - t) / 86400000; }
