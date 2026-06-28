/**
 * routes/nodes.js — GROUNDED Nodes telemetry + admin overview.
 *
 *   POST /api/nodes/beacon         (PUBLIC)  opt-in local-install heartbeat
 *   GET  /api/nodes/admin/overview (ADMIN)   per-newsroom hosted usage + feedback
 *                                            + opted-in local installs
 *
 * The beacon is the only inbound write a local install makes, and it's OFF by
 * default in the Node — a newsroom turns it on explicitly. We store ONLY the
 * minimal identified fields below; never story text, titles, or file names.
 *
 * Hosted usage + feedback already live in the box's Postgres: the hosted Node
 * (server-hosted.js + lib/pg-host.js) writes node_analytics_activity, scoped by
 * newsroom_id (= the signed-in team_members.id). Feedback is the rows with
 * kind='feedback' (message in the `response` column). This route just reads it.
 */

import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────
const str = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const intClamp = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 10_000_000);
};

// Self-bootstrap node_beacons so the beacon works whether or not the SQL
// migration (066) has been run on this box yet. Idempotent; runs once.
let beaconTableReady = null;
function ensureBeaconTable() {
  if (!beaconTableReady) {
    beaconTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS node_beacons (
        install_id       TEXT PRIMARY KEY,
        node_slug        TEXT NOT NULL,
        newsroom         TEXT,
        node_version     TEXT,
        runtime_version  TEXT,
        os               TEXT,
        ingests          INTEGER NOT NULL DEFAULT 0,
        briefs           INTEGER NOT NULL DEFAULT 0,
        errors           INTEGER NOT NULL DEFAULT 0,
        story_count      INTEGER NOT NULL DEFAULT 0,
        last_activity_at TEXT,
        first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch((err) => { beaconTableReady = null; throw err; });
  }
  return beaconTableReady;
}

// ── POST /api/nodes/beacon — PUBLIC opt-in local-install heartbeat ───────────
router.post('/beacon', async (req, res) => {
  try {
    const b = req.body || {};
    const install_id = str(b.install_id, 80);
    const node_slug = str(b.node_slug, 40);
    if (!install_id || !/^[A-Za-z0-9._-]+$/.test(install_id)) {
      return res.status(400).json({ message: 'install_id required (alphanumeric / . _ -)' });
    }
    if (!node_slug) return res.status(400).json({ message: 'node_slug required' });

    const counts = b.counts || {};
    await ensureBeaconTable();
    await pool.query(
      `INSERT INTO node_beacons
         (install_id, node_slug, newsroom, node_version, runtime_version, os,
          ingests, briefs, errors, story_count, last_activity_at, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW())
       ON CONFLICT (install_id) DO UPDATE SET
         node_slug        = EXCLUDED.node_slug,
         newsroom         = EXCLUDED.newsroom,
         node_version     = EXCLUDED.node_version,
         runtime_version  = EXCLUDED.runtime_version,
         os               = EXCLUDED.os,
         ingests          = EXCLUDED.ingests,
         briefs           = EXCLUDED.briefs,
         errors           = EXCLUDED.errors,
         story_count      = EXCLUDED.story_count,
         last_activity_at = EXCLUDED.last_activity_at,
         last_seen        = NOW()`,
      [
        install_id, node_slug, str(b.newsroom, 120),
        str(b.node_version, 40), str(b.runtime_version, 40), str(b.os, 60),
        intClamp(counts.ingests), intClamp(counts.briefs), intClamp(counts.errors),
        intClamp(counts.story_count), str(b.last_activity_at, 40),
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[nodes/beacon]', err.message);
    res.status(500).json({ message: 'Could not record beacon' });
  }
});

// Friendly display names for the hosted Nodes (slug → product name).
const NODE_LABELS = { analytics: 'Audience Signal', verifier: 'Election Watch', podcasting: 'Podcast Studio', bair_extract: 'Extract PDF' };
const labelForNode = (slug) => NODE_LABELS[slug] || slug.replace(/_/g, ' ');

// ── GET /api/nodes/admin/node-keys — ADMIN ───────────────────────────────────
// BYOK oversight: which tenants have configured a key for a node, WITHOUT ever
// exposing the key (it's encrypted at rest). Discovers credential entries across
// every node_<slug>_store table. Table names come from the catalog → safe to
// interpolate.
router.get('/admin/node-keys', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { rows: tbls } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name ~ '^node_[a-z0-9_]+_store$' ORDER BY table_name`);
    const out = [];
    for (const { table_name } of tbls) {
      const slug = table_name.replace(/^node_/, '').replace(/_store$/, '');
      if (!/^[a-z0-9_]+$/.test(slug)) continue;
      const { rows } = await pool.query(`
        SELECT s.newsroom_id, tm.name AS member_name, tm.email AS member_email, MAX(s.updated_at) AS updated_at
          FROM ${table_name} s
          LEFT JOIN team_members tm ON tm.id::text = s.newsroom_id
         WHERE s.collection ILIKE 'credential%' OR s.key ILIKE 'credential%'
         GROUP BY s.newsroom_id, tm.name, tm.email`).catch(() => ({ rows: [] }));
      if (rows.length) out.push({ slug, label: labelForNode(slug), tenants: rows.map((r) => ({ member_name: r.member_name, member_email: r.member_email, configured: true, updated_at: r.updated_at })) });
    }
    res.json(out);
  } catch (err) { console.error('[nodes/admin/node-keys]', err.message); res.status(500).json({ message: 'Internal server error' }); }
});

// ── GET /api/nodes/admin/overview — ADMIN ────────────────────────────────────
// Generalised across EVERY hosted Node: each Node writes its own
// node_<slug>_activity table (created by the Node, not by a tracker migration),
// so we discover them from the catalog and report each one — usage, op
// breakdown, recent events, errors — plus feedback aggregated across all Nodes
// and the opted-in local installs (node_beacons).
router.get('/admin/overview', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Discover hosted-Node activity tables. The pattern is strict, and the names
    // come from the system catalog, so interpolating them below is safe.
    const { rows: tbls } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name ~ '^node_[a-z0-9_]+_activity$'
      ORDER BY table_name
    `);

    const nodes = [];
    const feedback = [];

    for (const { table_name } of tbls) {
      const slug = table_name.replace(/^node_/, '').replace(/_activity$/, '');
      if (!/^[a-z0-9_]+$/.test(slug)) continue;          // defence-in-depth
      const T = `node_${slug}_activity`;

      const { rows: usage } = await pool.query(`
        SELECT a.newsroom_id, tm.name AS member_name, tm.email AS member_email,
               COUNT(*) FILTER (WHERE a.kind = 'run')      AS runs,
               COUNT(*) FILTER (WHERE a.kind = 'error')    AS errors,
               COUNT(*) FILTER (WHERE a.kind = 'feedback') AS feedback_count,
               MAX(a.ts) AS last_activity_at
        FROM ${T} a
        LEFT JOIN team_members tm ON tm.id::text = a.newsroom_id
        GROUP BY a.newsroom_id, tm.name, tm.email
        ORDER BY MAX(a.ts) DESC NULLS LAST
      `);

      const { rows: ops } = await pool.query(`
        SELECT op, COUNT(*)::int AS n FROM ${T}
        WHERE kind = 'run' AND op IS NOT NULL AND op <> ''
        GROUP BY op ORDER BY n DESC LIMIT 12
      `);

      const { rows: recent } = await pool.query(`
        SELECT a.ts, a.kind, a.op, tm.email AS member_email
        FROM ${T} a
        LEFT JOIN team_members tm ON tm.id::text = a.newsroom_id
        ORDER BY a.ts DESC LIMIT 15
      `);

      const { rows: fb } = await pool.query(`
        SELECT a.newsroom_id, tm.name AS member_name, tm.email AS member_email,
               a.ts, a.op, a.response AS message
        FROM ${T} a
        LEFT JOIN team_members tm ON tm.id::text = a.newsroom_id
        WHERE a.kind = 'feedback' ORDER BY a.ts DESC LIMIT 200
      `);
      for (const f of fb) feedback.push({ ...f, node: slug });

      // Audience Signal also tracks ingested stories in its own table.
      let hasStories = false;
      if (slug === 'analytics') {
        const { rows: [reg] } = await pool.query(`SELECT to_regclass('public.node_analytics_stories') AS s`);
        if (reg.s) {
          const { rows: st } = await pool.query(`
            SELECT newsroom_id, COUNT(*)::int AS stories, COUNT(DISTINCT source_label)::int AS sources
            FROM node_analytics_stories GROUP BY newsroom_id
          `);
          const byId = new Map(st.map((r) => [r.newsroom_id, r]));
          usage.forEach((u) => {
            u.stories = Number(byId.get(u.newsroom_id)?.stories || 0);
            u.sources = Number(byId.get(u.newsroom_id)?.sources || 0);
          });
          hasStories = true;
        }
      }

      nodes.push({
        slug,
        label: labelForNode(slug),
        has_stories: hasStories,
        newsrooms: usage.map((u) => ({
          newsroom_id: u.newsroom_id,
          member_name: u.member_name,
          member_email: u.member_email,
          runs: Number(u.runs || 0),
          errors: Number(u.errors || 0),
          feedback_count: Number(u.feedback_count || 0),
          last_activity_at: u.last_activity_at,
          ...(u.stories !== undefined ? { stories: u.stories, sources: u.sources } : {}),
        })),
        ops,
        recent,
        totals: {
          newsrooms: usage.length,
          runs: usage.reduce((a, u) => a + Number(u.runs || 0), 0),
          errors: usage.reduce((a, u) => a + Number(u.errors || 0), 0),
        },
      });
    }

    feedback.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

    await ensureBeaconTable();
    const { rows: local } = await pool.query(`
      SELECT install_id, node_slug, newsroom, node_version, runtime_version, os,
             ingests, briefs, errors, story_count, last_activity_at, first_seen, last_seen
      FROM node_beacons
      ORDER BY last_seen DESC
    `);

    res.json({ nodes, feedback: feedback.slice(0, 200), local });
  } catch (err) {
    console.error('[nodes/admin/overview]', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
