// resolve-tenant.js — resolve the caller's BAIR tenant up front.
//
// resolveNewsroomId fails closed: a non-admin (client team member) with no home
// newsroom is denied rather than scoped onto the office tenant. On its own that 403
// can be swallowed into a 500 by a route's local try/catch. Running the resolve as
// middleware — in front of the BAIR routes — turns access-denied into a guaranteed
// 403 before any route handler runs. It caches the result on req._newsroomId, so the
// routes' own resolveNewsroomId() calls hit the cache (no second lookup, no re-throw).
import { resolveNewsroomId } from '../lib/tenancy.js';

export async function resolveTenant(req, res, next) {
  try {
    await resolveNewsroomId(req);
    next();
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
