// tenancy.js — Phase 2 multi-tenancy helpers (see docs/PHASE2_PLAN.md).
//
// The "Develop AI (office)" newsroom is the dogfooding tenant every
// pre-multi-tenancy row was backfilled to (migration 080). Its id is fixed so
// backfills and fallbacks are deterministic.

import { AsyncLocalStorage } from 'node:async_hooks';
import pool from '../db/pool.js';

export const OFFICE_NEWSROOM_ID = '00000000-0000-0000-0000-000000000001';

// Ambient per-run tenancy. Workflow/tool executions are wrapped in
// runWithNewsroom() so deep call-sites (e.g. the profile loader every agent
// block uses) can read the active newsroom WITHOUT threading an id through
// every block signature. Outside any wrap, falls back to the office newsroom
// (pre-multi-tenancy behaviour).
const als = new AsyncLocalStorage();

export function runWithNewsroom(newsroomId, fn) {
  return als.run({ newsroomId: newsroomId || OFFICE_NEWSROOM_ID }, fn);
}

export function currentNewsroomId() {
  return als.getStore()?.newsroomId || OFFICE_NEWSROOM_ID;
}

/**
 * Resolve the newsroom a request operates in. Members are pinned to their own
 * newsroom; admins may act inside any newsroom by sending X-Newsroom-Id
 * (the AdminArea newsroom switcher) and default to their own.
 *
 * Tokens minted before Phase 2b carry no newsroom_id — fall back to a DB
 * lookup so nobody is forced to re-login (cached on req for the request).
 */
export async function resolveNewsroomId(req) {
  if (req._newsroomId) return req._newsroomId;

  let own = req.user?.newsroom_id;
  if (!own && req.user?.id) {
    const { rows } = await pool.query('SELECT newsroom_id FROM team_members WHERE id = $1', [req.user.id]);
    own = rows[0]?.newsroom_id || OFFICE_NEWSROOM_ID;
  }

  let active = own;
  if (req.user?.role === 'admin') {
    const requested = req.headers['x-newsroom-id'];
    if (requested && /^[0-9a-f-]{36}$/i.test(requested)) active = requested;
  }

  req._newsroomId = active || OFFICE_NEWSROOM_ID;
  return req._newsroomId;
}
