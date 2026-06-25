// seed-bair-local.mjs — local-only test fixtures for clicking through BE AI READY
// before deploying. Idempotent: safe to re-run; it resets the test logins each time.
// Creates a consultant (admin) login + a client team-member login for tenant-zero
// (Leads 2 Business), turns on the bits needed to exercise the new features, and adds
// one sample company-knowledge note so the Team AI workspace has something to ground
// on. NEVER run against production — it sets known passwords on test accounts.
import bcrypt from 'bcryptjs';
import pool from '../pool.js';
import { OFFICE_NEWSROOM_ID } from '../../lib/tenancy.js';

const PASS = 'localtest123';

async function upsertUser({ name, email, role, newsroomId }) {
  const hash = await bcrypt.hash(PASS, 10);
  const { rows } = await pool.query(
    `INSERT INTO team_members (name, email, password_hash, role, tracker_access, is_active, newsroom_id)
     VALUES ($1,$2,$3,$4,true,true,$5)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
           tracker_access = true, is_active = true, newsroom_id = EXCLUDED.newsroom_id
     RETURNING id`, [name, email, hash, role, newsroomId]);
  return rows[0].id;
}

const main = async () => {
  // Tenant-zero + a second business (for the >=2-org anonymised insight test).
  const { rows: biz } = await pool.query(
    `SELECT id, name FROM newsrooms WHERE kind='business' ORDER BY created_at LIMIT 2`);
  if (!biz.length) { console.error('No business newsrooms found — create one in the admin first.'); process.exit(1); }
  const primary = biz[0];

  await upsertUser({ name: 'Test Consultant', email: 'admin@local', role: 'admin', newsroomId: OFFICE_NEWSROOM_ID });
  await upsertUser({ name: 'Test Teammate', email: 'member@local', role: 'member', newsroomId: primary.id });

  // Self-registration: give the primary client an access code.
  await pool.query(`UPDATE newsrooms SET access_code_hash = $1 WHERE id = $2`, [await bcrypt.hash('joinus', 10), primary.id]);

  // Anonymised insight needs >=2 consenting businesses — opt the first two in.
  await pool.query(`UPDATE newsrooms SET shares_anonymised_insights = true WHERE id = ANY($1)`, [biz.map((b) => b.id)]);

  // One sample company-knowledge note so the workspace grounds on something real.
  const { rows: existing } = await pool.query(
    `SELECT id FROM beaiready_company_sources WHERE newsroom_id=$1 AND title='[sample] How we work' LIMIT 1`, [primary.id]);
  if (!existing.length) {
    await pool.query(
      `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, extracted_text)
       VALUES ($1,'note','[sample] How we work',$2)`,
      [primary.id, 'We draft the monthly client report in Google Docs (account manager → MD review → PDF). It takes ~6 hours. We use Claude for first drafts. Late deliveries get a 10% credit and a personal call from the account manager.']);
  }

  console.log('\n✓ Local BE AI READY test fixtures ready.\n');
  console.log('  Consultant (admin):   admin@local   / ' + PASS);
  console.log('  Client teammate:      member@local  / ' + PASS + '   (' + primary.name + ')');
  console.log('  Company access code:  joinus        (to test self-registration into ' + primary.name + ')');
  console.log('  Insight consent ON for: ' + biz.map((b) => b.name).join(', '));
  console.log('');
  await pool.end();
};

main().catch((e) => { console.error(e); process.exit(1); });
