# RESUME — where the GROUNDED V3 build is up to

> Pick-up point for Paul + Claude. Read this first; it links to everything else.
> **Last updated: 2026-06-10.**

## One-line state
Building the **GROUNDED V3 concept note** into the live `grounded2026` app, **local-first**. **Phase 1 COMPLETE. 🎉 PHASE 2 COMPLETE (2a–2f)** — full multi-tenancy: schema + auth + scoping + the Newsrooms onboarding UI + admin switcher + enforced constraints + node-model unification (17 clickable function cards; every live function opens its real workspace). Full record: [`PHASE2_PLAN.md`](PHASE2_PLAN.md). **Named follow-up (start of Phase 3): unify the hosted-Node runtime's tenancy** (currently keys by user id — `tenantOf` in `grounded-node-runtime` — switch to `newsroom_id` + re-key node rows; cross-repo, deliberately NOT in this deploy). **Next: deploy to the box** (runbook below), then Phase 3 feature build-out (Archivist first).

## How to resume in one command
```bash
bash "grounded2026/start.sh"
```
Starts the local servers (if not already running) and prints this state. Then open:
- **App:** http://localhost:5173/
- **Product (new IA):** http://localhost:5173/sections  ← the real ProductShell + five-section nav (login required). `/_preview` redirects here.

To resume with Claude, just say: **"Pick up the GROUNDED V3 plan"** (memory + this file orient it).

## The plan
- Strategy + gap map + phases → [`GROUNDED_V3_BUILD_PLAN.md`](GROUNDED_V3_BUILD_PLAN.md)
- Phase 1 execution detail (route-migration table, steps) → [`PHASE1_CHECKLIST.md`](PHASE1_CHECKLIST.md)
- **Governing rule:** NO FAKE DATA — real data or honest empty states only.

## Settled decisions
1. Multi-tenancy (`newsroom_id`) → built in **Phase 2**.
2. Develop AI back-office → separated into a **`/studio`** shell, same codebase.
3. Newsroom-product IA → **concept-note-led** (the 5 sections are the top-level nav).
4. Three buckets: **Product** / **Platform-admin (stays in product)** / **`/studio`**. *(proposed — confirm)*
5. Model routing (sensitivity-based) → **Phase 4** target; retired "Haiku-only" rule does NOT apply.

## Done so far (Phase 1 · steps 1–7 — COMPLETE) — additive / re-homing only, no logic or data changes
**Step 1** (design system + honest empty state):
- `client/src/ui/sections.js` — single source of truth for the IA (5 sections + 3 layers + every function's real status + live routes).
- `client/src/ui/InDevelopment.jsx` — honest empty-state component.
- `client/src/ui/SectionLanding.jsx` — reusable section page; cards link to the live route when one exists, else stay non-interactive (no dead links).
- `client/src/index.css` — GROUNDED design tokens (section accents, status colours, spacing) + component classes (now incl. ProductShell + clickable-card styles).

**Step 2** (ProductShell + concept-note nav):
- `client/src/ui/ProductShell.jsx` — the product shell: wordmark + the five coloured section tabs + Profile + sign-out + feedback/question bubbles.
- `client/src/ui/SectionsOverview.jsx` — the product front door at **/sections** (real replacement for the throwaway preview): all 5 sections rendered as card grids + the 3 strategic layers as cards.
- `client/src/ui/SectionRoute.jsx` — renders one section's landing from `/sections/:key` (unknown key → /sections).
- `client/src/App.jsx` — new auth-gated ProductShell route tree: `/sections`, `/sections/:key`, and **Builder, Run, Awareness re-homed into ProductShell** (lifted out of PublicLayout, same paths). `/_preview` now redirects to `/sections`; `SectionsPreview.jsx` deleted.
- **Verified:** clean `vite build`; rendered + screenshotted via the Preview tool (5 tabs, 24 function cards, exactly 5 live-routed cards clickable, 3 layer cards, layer landings show the in-dev state). Accent colours: teal / emerald / amber / blue / violet (Content / Sustainability / Training / Governance / Languages).

**Partially routed (deliberately, to avoid destabilising other shells):** Tracker (`/lawsuits`), Pulse (`/admin/pulse`) and Profile (`/settings/newsroom-profile`) are *reached from* the section pages but still render in their current admin shell. They get folded fully into ProductShell / AdminArea in steps 4–5.

**Step 3** (public Hub front door):
- `client/src/pages/public/PublicHome.jsx` — **rebuilt** as the GROUNDED Hub: hero (concept-note framing) + the real stats row (kept) + the 5 sections as accent-keyed cards (each links to its public front-door, or says "in development · sign in to follow" where none exists — African Languages) + the 3 strategic layers as in-development cards + a data-sovereignty "foundation" story. Reads labels/blurbs/accents/links from `ui/sections.js`.
- `client/src/ui/sections.js` — added a `hub` field (public front-door link) to the 4 sections that have a public page; African Languages omits it on purpose.
- `client/src/index.css` — `.hub-*` styles (hero, stats, section/layer cards, foundation).
- **Verified:** clean `vite build` + Preview screenshot of `/` (5 section cards with per-section accent CTAs, 3 layer cards, real stats 53/22/10, nodes "—" because `/nodes/nodes.json` is Caddy-served in prod not locally — honest empty state, not a fake number).

**Deferred from step 3 (deliberate):** the public top-nav menu (Builder / AI Policies / Training dropdowns in `PublicLayout`) still reflects the OLD 3-part grouping. It's driven by `server/config/publicNav.js` (single source of truth *shared with the Nodes front door*), so aligning it to the 5 sections is a cross-surface change worth doing deliberately — candidate for the step-7 polish pass or its own commit.

**Step 4** (`/studio` split — Develop AI back-office):
- `client/src/ui/StudioShell.jsx` — a distinct dark back-office shell (amber **STUDIO** badge, "Develop AI back-office" title, "← Back to Grounded admin" link, its own grouped nav: Overview/CRM/Curriculum/Delivery/Outreach/Fundraising/AI tools/Data/Settings) + AiAssistantPanel + FeedbackBubble.
- `client/src/App.jsx` — the ~35 back-office routes (Dashboard, Contacts, Organisations, Cohorts, Assessments, Leads, Curriculum, Mentoring, Services, Campaigns, Social, Fundraising pipeline+funders, Intelligence, Knowledge, Newsletter, Database, Learning, Agents, Sectors, Gmail — incl. all `:id` detail routes) **moved out of the admin `Layout` block into a new admin-gated `StudioShell` block.** Same component code, **same paths** (so every internal link + bookmark survives — no redirects needed), only the wrapping shell changed.
- `client/src/components/Sidebar.jsx` — removed the `developAiItems` array + the collapsible "Develop AI" section; replaced with a single **"Open Studio →"** entry (→ `/dashboard`) at the foot of the Grounded admin sidebar. The admin sidebar now lists Grounded/platform-admin items only.
- **Stayed in the admin Layout (not Studio):** `/documents*` (product · AI Governance), `/settings/newsroom-profile` (product · Profile), `/settings/reference-data` + `/settings/team` + `/settings/jobs` + `/feedback` + `/node-admin` + `/scraper-dashboard` + `/ingestion` + `/admin*` + `/insights` + `/admin/pulse*` (platform-admin, gathered into AdminArea in step 5).
- **Verified:** clean `vite build` + Preview screenshot of the StudioShell chrome (all 23 nav items, 9 groups, the STUDIO badge + back link).
- **Deferred (deliberate):** the literal **`/studio/*` URL prefix.** Keeping the existing paths avoided rewriting ~12 param-route internal links / adding fragile redirect wrappers. The *shell* split (the substance) is done; moving the URLs under `/studio` is a separable follow-up if Paul wants the namespace in the address bar.

**Step 5** (AdminArea + completing the three-shell split — the old admin Layout/Sidebar is now retired):
- `client/src/ui/AdminArea.jsx` — the platform-admin operator shell (dark sidebar, blue **ADMIN** badge, "← Back to the product" → /sections, sector selector, grouped nav: Overview / AI Legal tracker / Nodes / Documents / People & access / System, + a Pulse shortcut when the flag is on). Routes gathered: `/admin`, `/insights`, `/admin/questions`, `/scraper-dashboard`, `/ingestion`, `/legal-sources`, `/use-cases-admin`, `/node-admin`, `/documents*`, `/feedback`, `/settings/team`, `/settings/reference-data`, `/settings/jobs`.
- `client/src/ui/SectorSelect.jsx` — extracted the Develop AI sector filter (was in the old Sidebar) so it survives in the operator shells; **added it to StudioShell** too (fixes a step-4 regression — CRM/fundraising/curriculum pages read `selectedSectorId`).
- `client/src/ui/ProductShell.jsx` — added admin-only **"Admin"** (→ /admin) + **"Studio"** (→ /dashboard) entries in the top-bar right cluster (the launchers that used to live in the old Sidebar). And folded the remaining product pages in: **Tracker** (`/lawsuits` + `/regulation-tracker`, all-authed) and (admin-gated, unchanged) **Pulse** (`/admin/pulse*`) + **Profile** (`/settings/newsroom-profile`).
- `client/src/App.jsx` — replaced the old `<Layout>` block with the AdminArea block; **`components/Layout.jsx` + `components/Sidebar.jsx` are now orphaned** (no importers — safe to delete in the step-7 polish, will need a CLAUDE.md note since CLAUDE.md still calls them the admin shell).
- **Two small permission/placement notes:** (1) `/legal-sources` + `/use-cases-admin` were all-authed before; they're now **admin-only** (AdminArea) per the IA's platform-admin bucket. (2) `/documents*` lives in **AdminArea** (it's sector-filtered, operator-ish) even though the route table earmarks it for the product AI-Governance section — move it when that section is built.
- **Verified:** clean `vite build` + Preview screenshot of the AdminArea chrome (13 nav items, 6 groups, blue ADMIN badge, sector selector, back link).

### The three shells now
- **ProductShell** (light top-bar): sections + Builder/Run/Awareness + Tracker + Pulse + Profile; admins also see "Admin" + "Studio" entries.
- **AdminArea** (dark, blue ADMIN badge): GROUNDED platform ops.
- **StudioShell** (dark, amber STUDIO badge): Develop AI back-office.

**Step 6** (Functions directory + `NodeCard`):
- `client/src/ui/NodeCard.jsx` — the ONE unified tile for any function (agent / tool / hosted Node): name + honest status + run badge + the right CTA (`to` → "Open →" internal Link; `href` → "Run online ↗" external `<a>`; neither → non-interactive). Exports `StatusPill` too. `SectionLanding` now renders `NodeCard` (deleted its private FunctionCard/StatusPill — one card, no drift).
- `client/src/ui/FunctionsDirectory.jsx` — the directory at **/functions** (in ProductShell): flattens all 5 sections' functions into NodeCards with **Section** + **Runs (online/local)** filter chips + a live count, then two pointer cards to the dynamic surfaces — the **Tools & Agents workspace** (`/tools-hub`, live `/api/tool-kit`) and the **Nodes front door** (`/nodes/`) — rather than re-listing them (no fabricated catalogue).
- `client/src/ui/sections.js` — gave the hosted-Node functions (Audience Signal, AI-Ready Archive, Audio & Video Producer) a real `href: '/nodes/'` so they show a "Run online ↗" CTA.
- `client/src/ui/ProductShell.jsx` — added a **"Functions"** nav entry; `SectionsOverview.jsx` got a "Browse the full functions directory →" link; `index.css` got the `.dir-*` filter-chip + live-card styles.
- **Verified:** clean `vite build` + Preview screenshot (24 functions, section + run-mode filters working — Run-local correctly narrows to the 9 local-capable functions across 3 sections; 3 hosted-node "Run online" cards).
- **Deliberately not done:** force-fitting the live `/api/tool-kit` tools into the 5 sections (they carry no section metadata — that'd be fabrication). The directory points to the live `/tools-hub` workspace instead; tagging each tool with a section is a real follow-up.

**Step 7** (polish pass — Phase 1 complete):
- **Deleted** the orphaned `components/Layout.jsx` + `components/Sidebar.jsx` (zero importers since step 5; `components/NotificationBell.jsx` is now also orphaned — left in place as a reusable component). Updated **`CLAUDE.md`** to describe the four-shell model (PublicLayout/Hub + ProductShell + AdminArea + StudioShell) instead of the retired Sidebar/Layout.
- **No-fake-data sweep:** grepped `pages/` + `ui/` for mock/dummy/sample/placeholder/fake data arrays — clean (the only hit is the honest "Nothing here is placeholder data" copy on the sections overview). New shells use real statuses from `sections.js` + real fetches; honest empty states everywhere.
- **Verified:** clean `vite build` after the deletions; Preview smoke-test of `/` (Hub renders, 5 section cards, correct CTAs, no console errors).

### Deliberately deferred (NOT Phase-1 polish — they need cross-surface coordination or a built feature)
- **Public top-nav menu alignment** → `server/config/publicNav.js` keys (`builder`/`tracker`/`training`) are a **contract shared with the Nodes front door** (`pauldevelopai/nodes` → `chrome.js`), and the dropdown labels are hardcoded in each consumer — realigning to the 5 sections breaks the Nodes front door unless both repos change together. Do this as a coordinated change (Phase 2-ish), not locally.
- Tag live `/api/tool-kit` tools with a section so they fold into `/functions`; move `/documents` into the product AI-Governance section once that section is built; the literal `/studio/*` URL prefix.

## Next up — Phase 2 (or commit/deploy Phase 1 first)
Phase 1 (IA + cosmetic restructure) is done and meets its definition of done: every real feature still works + is reachable in the new IA; three buckets (Product / Platform-admin / Studio); one visual identity; every unbuilt section shows `InDevelopment`; **zero fabricated data; no backend/schema/data changes.**

**Phase 2** = multi-tenancy: introduce `newsroom_id` so the core app serves 100s of isolated newsrooms (today the app is single-newsroom; only the Nodes are isolated) + confirm settled-decision #4's bucket model. This is the first phase that touches the backend/schema.

**Before Phase 2, two things for Paul:**
1. **Commit/deploy Phase 1?** All of steps 1–7 are local + uncommitted. Say "commit the GROUNDED work" to branch + commit + push (nothing deploys until you ask).
2. Eyeball the three shells (**/sections**, **/functions**, **/**, + admin-only **Admin**/**Studio**) — accent colours + groupings are still cheap to change (`index.css` + `sections.js`).

## Local environment — THE WHOLE PLATFORM runs locally (2026-06-10)
`bash grounded2026/start.sh` boots everything; anything already up is left alone.
- DB: local Postgres **:5433**, db `tracker`, real data (53 lawsuits) — no fakes. (AIKit's own db `toolkitrag` also on :5433.)
- Server: Express **:3001** (`grounded2026/server`). Client: Vite **:5173** (`grounded2026/client`).
- **Hosted Nodes (multi-tenant, local):** analytics :4101 · verifier :4102 · progress :4103 · aiready :4104 · salesrep :4105 — repos in `PYTHON 2026/Nodes/node-*`, started with the tracker's `JWT_SECRET` + `DATABASE_URL` + `PORT` injected at process start (their own `.env` files untouched; same contract as the box's `deploy-node.sh`). They write `node_<slug>_*` tables in the local db. Podcasting = local-lite only (hosted needs blob storage).
- **Nodes front door:** served at `/nodes/` from the local `PYTHON 2026/Nodes/nodes` repo by a tiny middleware in `client/vite.config.js`, which also mirrors Caddy's routing: `/nodes/<slug>/app/*` → that node's local port (prefix stripped), `/nodes/<slug>/mac|windows` → GitHub installer redirects.
- **AIKit (`/tools/`):** FastAPI on **:8000** — source `ONMAC/aikit_bundle/aikit_source`, venv `~/.venvs/aikit`, its `.env` written 2026-06-10 (db `toolkitrag` on :5433, **EMBEDDING_PROVIDER=local_stub** because there's no OPENAI_API_KEY on this machine — drop a real key into that `.env` + set `EMBEDDING_PROVIDER=openai` for real embedding search).
- Verified end-to-end in the browser: login → local front door → Audience Signal + Election Watch hosted apps authenticate via the `tracker_token` cookie ("RUNNING LOCALLY" banner) against the local DB.
- Env: `grounded2026/.env` (DATABASE_URL → :5433, keys present). **Local login works:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (`paul@developai.co.za` / the value in `.env`). The local user's `password_hash` was reset to the `.env` value on 2026-06-10 (the hash had drifted) — **local DB only; the box is untouched.** Verified: login → `/sections` (ProductShell) and `/admin` (AdminArea) both render with real data + the admin "Admin"/"Studio" entries.

## Deploying Phase 1+2 to the box — ✅ DONE & VERIFIED LIVE 2026-06-11

**The box is now running Phase 1+2** (branch `phase-1-ia-restructure`, head `5ffb174`; DB backed up to `~/tracker-backup-*.sql` on the box first). Verified on grounded.developai.co.za: `/api/newsrooms` → 401 (new route live), migrations 080+081 applied (deploy.sh `set -e` reached the pm2 restart), and the live JS bundle carries the Hub + Functions + AdminArea code. Future deploys: the box is now on the `phase-1-ia-restructure` branch, so `cd /home/ubuntu/tracker && bash deploy.sh` is enough.

<details><summary>Original runbook (kept for reference)</summary>

Branch **`phase-1-ia-restructure`** (head `9d0ba65`) is pushed and is a **superset of both `origin/main` and `origin/pulse-system`** (main was merged in — the Ask-For-Help polish + public-chat CORS), so deploying it loses nothing whichever branch the box was on. All steps via **Lightsail browser SSH** (the old SSH key is leaked/rotated — don't use a pasted key).

**Step 1 — back up the box DB first** (migrations 080+081 run during deploy; additive + reversible, but belt-and-braces):
```bash
pg_dump -U holly tracker > ~/tracker-backup-$(date +%Y%m%d-%H%M).sql && ls -la ~/tracker-backup-*.sql
```
**Step 2 — deploy** (checks out the superset branch + runs deploy.sh = pull → npm install → migrations 080+081 → client build → pm2 restart):
```bash
cd /home/ubuntu/tracker && git stash && git fetch origin && git checkout phase-1-ia-restructure && git pull --ff-only && bash deploy.sh
```
**Step 3 — smoke-test live**: `/` (Hub), `/sections` (product, login), `/newsrooms-admin` (admin → create a real newsroom), `/nodes/` + open a hosted Node (cookie still valid), and confirm existing workflows still list (they all backfilled to the office newsroom).

**Rollback if needed**: SQL at the foot of `server/db/migrations/080…sql` + `081…sql`, or restore the backup: `psql -U holly tracker < ~/tracker-backup-….sql`. To revert the code: `git checkout <old-branch> && bash deploy.sh`.

**Box notes:** no new env vars (office newsroom id is baked in); existing logins keep working (legacy-token DB fallback); the hosted Nodes are untouched by this deploy (their runtime tenancy unification is the Phase-3 opener below).
</details>

## ▶ NEXT SESSION — where we pick up

Resume anytime: `bash grounded2026/start.sh`, then tell Claude **"Pick up the GROUNDED V3 plan"**.

**First task of Phase 3 — unify the hosted-Node runtime's tenancy (cross-repo):**
- Today `grounded-node-runtime/src/server-hosted.js` sets `tenantOf = (u) => String(u.id)` — the hosted Nodes key their `node_<slug>_*` data by **user id**, not newsroom. Now that the tracker JWT carries a real `newsroom_id` (Phase 2b), change `tenantOf` to `(u) => u.newsroom_id || String(u.id)`.
- Then: bump + tag the runtime, `npm install` the new tag in each `node-*` repo, redeploy the hosted Nodes, and run a **one-time re-key** on the box mapping existing `node_*` rows from their user-id tenant key → the user's newsroom id (office for current data).
- It's its own deploy (separate repos + a data migration) — do NOT bundle with the Phase-1/2 deploy above.

Then the **Phase 3 feature build-out** (each real-data-only, see `GROUNDED_V3_BUILD_PLAN.md`): Archivist first (per-newsroom RAG — the multi-tenancy we just built is its prerequisite), then Digital Security Audit, Policy Builder, Translator, etc.
