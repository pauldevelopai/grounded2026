// KnowHow identity bridge — maps the BAIR tenancy (newsroom + team_member) onto the
// KnowHow schema (tenant + person), so a member's OWN AI use can accrue to THEIR private
// Tier-1 base and be surfaced back only to them.
//
// This is plumbing, not capture-of-record: a person's Tier-1 base is private to them and
// reaches company knowledge ONLY through the admin gate. So ensuring these rows exist does
// not widen what the consultant collects "about the business" — that stays gated.
// Accepts a pool or a transaction client (anything with .query).

// The KnowHow tenant for a newsroom. Prefers the consultant-linked tenant; if a same-named
// unlinked one exists it adopts it (one link); otherwise creates a fresh bair tenant.
export async function ensureKnowhowTenantForNewsroom(db, { newsroomId, name }) {
  const linked = await db.query('SELECT id FROM knowhow.tenants WHERE newsroom_id = $1 LIMIT 1', [newsroomId]);
  if (linked.rows[0]) return linked.rows[0].id;

  if (name) {
    const adopt = await db.query(
      `UPDATE knowhow.tenants SET newsroom_id = $1
         WHERE id = (SELECT id FROM knowhow.tenants
                      WHERE newsroom_id IS NULL AND product = 'bair' AND lower(name) = lower($2)
                      ORDER BY created_at LIMIT 1)
       RETURNING id`, [newsroomId, name]);
    if (adopt.rows[0]) return adopt.rows[0].id;
  }
  const { rows: [t] } = await db.query(
    `INSERT INTO knowhow.tenants (name, product, newsroom_id) VALUES ($1, 'bair', $2) RETURNING id`,
    [name || 'Business', newsroomId]);
  return t.id;
}

// Read-only: the KnowHow tenant id for a newsroom, or null. Used by the member surfaces
// and the coach, which must not create anything.
export async function knowhowTenantIdForNewsroom(db, newsroomId) {
  const { rows } = await db.query('SELECT id FROM knowhow.tenants WHERE newsroom_id = $1 LIMIT 1', [newsroomId]);
  return rows[0]?.id || null;
}

// The KnowHow person for an app account within a tenant. find-or-create, keyed by the
// team_member link so the same user always maps to the same person.
export async function ensureKnowhowPerson(db, { tenantId, teamMemberId, name }) {
  if (!teamMemberId) return null;
  const found = await db.query(
    'SELECT id FROM knowhow.people WHERE tenant_id = $1 AND team_member_id = $2 LIMIT 1', [tenantId, teamMemberId]);
  if (found.rows[0]) return found.rows[0].id;
  const { rows: [p] } = await db.query(
    `INSERT INTO knowhow.people (tenant_id, name, team_member_id, active) VALUES ($1, $2, $3, true) RETURNING id`,
    [tenantId, name || 'Team member', teamMemberId]);
  return p.id;
}

// Read-only: the person id for an app account within a tenant, or null.
export async function knowhowPersonId(db, { tenantId, teamMemberId }) {
  if (!tenantId || !teamMemberId) return null;
  const { rows } = await db.query(
    'SELECT id FROM knowhow.people WHERE tenant_id = $1 AND team_member_id = $2 LIMIT 1', [tenantId, teamMemberId]);
  return rows[0]?.id || null;
}
