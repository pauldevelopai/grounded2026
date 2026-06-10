# DB rename runbook — `holly` → `tracker` (live box)

> **✅ EXECUTED 2026-06-09.** The live database is now `tracker`; `holly` no longer exists;
> `.env` `DATABASE_URL` points at `tracker`; all pm2 apps online and reading correctly
> (verified: `/api/public/lawsuits` → 200, 53 lawsuits). The role/owner was deliberately
> left as `holly`. Kept below for history / rollback reference.

The **last** legacy-name hold-out. The app code already defaults to `tracker`
(`server/config.js`); only the live Postgres **database name** and the box's
`.env` `DATABASE_URL` still say `holly`. This must be done **on the box** — it's a
production op, not a repo change.

- **Box:** Lightsail Ubuntu-1, `52.56.143.231` (eu-west-2). Access via **Lightsail
  browser SSH** (the old SSH key was leaked — don't paste a key into chat).
- **App dir:** `/home/ubuntu/tracker` · **env:** `/home/ubuntu/tracker/.env`
- **Postgres:** `127.0.0.1:5432`, current db `holly`, owner role `holly`
- **Who connects to this DB:** `tracker-server` **and** every hosted Node
  (`<slug>-hosted`, e.g. `audience-signal`) — they share `DATABASE_URL`. `aikit-server`
  is a separate FastAPI app; only stop it if it also reads this DB.

You **cannot rename a database with active connections**, so the app processes
come down for the ~30 seconds the rename takes.

---

## 0. Fresh backup first (also replaces the stale `holly.sql` we removed)

```bash
cd /home/ubuntu/tracker
pg_dump "$DATABASE_URL" -Fc -f "/home/ubuntu/backups/grounded_$(date +%F).dump"
# verify it's non-empty
ls -lh /home/ubuntu/backups/grounded_*.dump
```

## 1. Stop everything holding a connection

```bash
pm2 stop tracker-server
pm2 list   # note every "<slug>-hosted" process, then:
pm2 stop audience-signal        # + any other <slug>-hosted nodes shown
```

## 2. Rename the database (run as the postgres superuser, connected to a *different* db)

```bash
sudo -u postgres psql -d postgres -c "ALTER DATABASE holly RENAME TO tracker;"
# kill any lingering backends first if it errors with "is being accessed by other users":
sudo -u postgres psql -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='holly';"
# then re-run the ALTER DATABASE above.
```

> **Role rename is OPTIONAL and riskier — skip unless you want a full scrub.** The
> role `holly` (table owner) can stay as-is; only the *database* name is user-visible.
> If you do want it gone: `ALTER ROLE holly RENAME TO tracker;` — but note a password
> set with the old name may need re-setting (`ALTER ROLE tracker WITH PASSWORD '…';`),
> and `pg_hba.conf` / the `DATABASE_URL` user must be updated to match. Lower risk:
> leave the role `holly`, rename only the database.

## 3. Point the app at the new name

Edit `/home/ubuntu/tracker/.env` — change the **database** segment of `DATABASE_URL`:

```
# before: postgresql://holly:<pw>@127.0.0.1:5432/holly
# after:  postgresql://holly:<pw>@127.0.0.1:5432/tracker
```

(Only `/holly` → `/tracker` at the end. Keep the user `holly` unless you also did the
optional role rename above.)

## 4. Restart and verify

```bash
pm2 restart tracker-server audience-signal   # + any other <slug>-hosted nodes
pm2 logs tracker-server --lines 40           # confirm it connected, no DB errors
```

Smoke test:
```bash
sudo -u postgres psql -d tracker -c "\dt" | head        # tables present under new name
curl -s -o /dev/null -w "%{http_code}\n" https://grounded.developai.co.za/   # expect 200
# log into the admin app + open a hosted Node (e.g. Audience Signal) to confirm reads/writes
```

## 5. After it's confirmed green

- Flip [`../CLAUDE.md`](../CLAUDE.md) line ~46 from `db holly` to `db tracker` and drop
  the "rename pending" note.
- The old `/home/ubuntu/holly` migration block in `deploy/LIGHTSAIL_SETUP.sh` can stay
  (it only matters for the original dir-rename cut-over) or be removed — harmless either way.

## Rollback

If anything fails before step 4 verifies:
```bash
sudo -u postgres psql -d postgres -c "ALTER DATABASE tracker RENAME TO holly;"
# revert .env DATABASE_URL back to /holly, then pm2 restart the processes.
```
Worst case, restore from the step-0 dump:
`pg_restore -d holly -c /home/ubuntu/backups/grounded_<date>.dump`.
