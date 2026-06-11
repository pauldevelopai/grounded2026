# Grounded — tracker (this repo)

> This file is auto-loaded by Claude Code. It's the orientation map for the whole
> Grounded system. Read it before changing things. Keep it updated when the
> architecture changes.

## What Grounded is

**Grounded** = newsroom-owned AI, by **Develop AI**. Three parts, one domain
(`grounded.developai.co.za`):

1. **AI Legal tracker** — public site: global AI lawsuits + regulations + use-cases. (This repo.)
2. **Nodes** — small AI tools newsrooms run/own/adapt (e.g. *Audience Signal* = `node-analytics`, *Podcast Studio* = `node-podcasting`). Each downloads with one command AND can run online.
3. **Tools** — AIKit (a FastAPI app proxied under `/tools`).

The public wordmark everywhere is **"Grounded"** (subtitle "Newsroom-owned AI · by Develop AI"). It was formerly "holly" then "Tracker" then "Grounded: AI Legal" — don't reintroduce those.

## This repo (the tracker)

- **`server/`** — Express + Postgres. Entry `server/index.js`. Routes in `server/routes/*`, mounted: public/open ones first, then an admin router (`requireAuth` + `requireRole('admin')`) at `/api`.
- **`client/`** — React + Vite SPA. Page components live in `pages/*`; the **shells** (the chrome that wraps them) live in `ui/*` and the IA is concept-note-led (see `docs/GROUNDED_V3_BUILD_PLAN.md` + `RESUME.md`). Four shells:
  - **`pages/public/PublicLayout`** — the logged-out public site; its home is the GROUNDED Hub (`pages/public/PublicHome.jsx`, the 5 sections + 3 layers + foundation story).
  - **`ui/ProductShell`** — the authed newsroom product (light top-bar): the five-section nav → `/sections` + `/sections/:key` (`ui/SectionsOverview` + `ui/SectionRoute`, both rendering `ui/SectionLanding` whose tiles are `ui/NodeCard`), the functions directory `/functions` (`ui/FunctionsDirectory`), Builder/Run/Awareness/Tracker/Pulse/Profile, and (admins only) "Admin" + "Studio" entries. IA source of truth = `ui/sections.js`.
  - **`ui/AdminArea`** — GROUNDED platform admin (dark, blue badge): command centre, tracker ingestion, Nodes, feedback, users, reference data, jobs, policy docs.
  - **`ui/StudioShell`** — Develop AI's back-office (dark, amber badge): CRM, fundraising, curriculum, mentoring, outreach, intelligence, database, etc.
  - The operator shells share `ui/SectorSelect`. (The old `components/Sidebar.jsx` + `components/Layout.jsx` admin shell was retired in the Phase-1 restructure.)
- **Auth**: JWT in an httpOnly cookie named **`tracker_token`** (set/read in `routes/auth.js` + `middleware/auth.js`), secret = `config.jwtSecret` (loaded from `/home/ubuntu/tracker/.env`, `dotenv override:true`). Users live in **`team_members`** (roles `'admin'`/`'member'`; `last_login` tracked). Self-registration → role `'member'`.
- **DB migrations**: numbered SQL in `server/db/migrations/NNN_*.sql`, run by `node server/db/migrate.js` (tracked in a `migrations` table). NB there's a duplicate `066_*` (harmless — tracked by full filename).

### Grounded-specific surfaces added on top of the CRM
- `routes/nodes.js` → `POST /api/nodes/beacon` (public; local-install telemetry) + `GET /api/nodes/admin/overview` (admin). Reads `node_<slug>_*` tables the hosted Nodes write.
- `routes/admin.js` → `GET /api/admin/overview` (admin command-centre data: users + feedback + legal counts). Page: `pages/admin/AdminOverview.jsx` at **`/admin`** (the command centre, top of `ui/AdminArea`).
- `routes/feedback.js` + `components/FeedbackBubble.jsx` + `pages/feedback/FeedbackList.jsx` — feedback from any logged-in user (public site, admin, AND inside hosted Nodes) lands here.
- Nodes admin page: `pages/nodes/NodesAdmin.jsx` at **`/node-admin`** (NOT `/nodes` — `/nodes/*` is the Caddy-served front door).

## Local dev — the WHOLE platform runs locally

`bash start.sh` boots everything on this machine: Postgres check (:5433, db `tracker`), server :3001, client :5173, the five hosted Nodes (:4101–4105, against the local DB), and AIKit :8000. `client/vite.config.js` mirrors the box's Caddy routing (front door at `/nodes/`, per-slug app proxies, `/tools` → :8000). State + caveats: `docs/RESUME.md`.

## Deploying (CRITICAL — front-end changes don't show until you build)

On the box (`/home/ubuntu/tracker`), via **Lightsail browser SSH** (the old SSH key was leaked and must be rotated; don't use a chat-pasted key):

```bash
cd /home/ubuntu/tracker && bash deploy.sh
```

`deploy.sh` does: stash local edits → pull → server `npm install` → migrate → **client `npm run build`** → `pm2 restart tracker-server`. The client build is the step people forget — editing React source does nothing live until the Vite bundle is rebuilt.

## The box (shared host: Lightsail Ubuntu-1, 52.56.143.231, eu-west-2)

- **Caddy** fronts everything (auto-HTTPS), config `/etc/caddy/sites/ailegal.co.za.caddy`. **GOTCHA: Caddy has `admin off` → `systemctl reload` FAILS. Use `sudo systemctl restart caddy`.**
- Routing on `grounded.developai.co.za`: tracker SPA at `/` (server :3001); `/tools/*` → AIKit (FastAPI :8000, proxied); `/nodes/` → static front door (`/var/www/nodes`); `/nodes/<slug>/app/*` → that hosted Node's pm2 process.
- **pm2** processes: `tracker-server`, `aikit-server`, `audience-signal` (the hosted node-analytics), plus `<slug>-hosted` per hosted Node.
- **Postgres** on 127.0.0.1:5432 (db **`tracker`** — renamed from the legacy `holly` on 2026-06-09, the last legacy-name hold-out, now gone; role/owner is still `holly` by design. History: `docs/DB_RENAME_RUNBOOK.md`), shared by the tracker AND the hosted Nodes (which write `node_<slug>_*` tables).

## The Nodes system (how to add one)

Nodes are separate repos (`pauldevelopai/node-<slug>`) built on the shared runtime `@developai/grounded-node-runtime` (current tag **`v0.14.0`**):
- **Local** = `createServer({ slug, host: createLiteHost(...), handlers })` (index.js).
- **Hosted** = `createHostedServer({ slug, handlers, ensureSchema?, mountRoutes?, productName, staticDir })` (server-hosted.js) — verifies the `tracker_token` cookie, scopes a per-request Postgres host, injects the Grounded nav + feedback + "run locally" footer.
- **Two storage patterns:** Postgres tables via `ensureSchema` (node-analytics), or per-newsroom key/value via `host.store` + custom routes via `mountRoutes` (node-verifier). The latter (runtime v0.14.0) is how file-based Nodes go multi-tenant.

**To add a Node, see `pauldevelopai/nodes` → `HANDOVER.md` (whole-system map) then `ADD_A_NODE.md` (the recipe).** Short version: build the repo from the `node-analytics` or `node-verifier` pattern → add an entry to `nodes/nodes.json` (front door renders from it) → for hosting, run `nodes/deploy-node.sh <slug> <port>` on the box and paste the Caddy block it prints.

**GOTCHA (npm + github deps):** Nodes pin the runtime to a tag (`github:pauldevelopai/grounded-node-runtime#v0.14.0`). `npm install` can serve a STALE cached copy — if a Node runs old runtime code, force it: `rm -rf node_modules/@developai && npm install`.

## Repos
- `pauldevelopai/tracker` (this) — AI Legal site + admin + the Grounded shell.
- `pauldevelopai/nodes` — front door (`grounded.developai.co.za/nodes/`), registry, deploy tooling, `ADD_A_NODE.md`.
- `pauldevelopai/grounded-node-runtime` — shared `createServer` / `createHostedServer` / hosts. Versioned + tagged.
- `pauldevelopai/node-analytics` — Audience Signal (reference Node for the Postgres-table pattern; local + hosted).
- `pauldevelopai/node-verifier` — Election Watch (reference Node for the host.store + mountRoutes pattern; local + hosted). Internal slug stays `capitalfm-verifier` for data continuity; display name is de-branded.
- `pauldevelopai/node-podcasting` — Podcast Studio (download works; hosted not wired — audio app, still needs blob storage).
