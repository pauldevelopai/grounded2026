# Consolidation Build Plan — one platform for businesses **and** newsrooms

> **Goal (Paul, 2026-07-19):** BE AI READY becomes the **primary platform for both
> businesses and newsrooms**. Grounded is then **retired**. Nothing important on
> Grounded may be lost by omission — every surface must be consciously *ported*,
> *already-present*, *kept as internal admin*, or *retired*.
>
> This plan is the master inventory + sequence. It supersedes the "port 3–4
> features" framing: the real job is a **consolidation**, not a feature port.

---

## 0. The one fact that reframes everything

Grounded and BE AI READY are **already one codebase, one Postgres DB, one auth
system, two host-switched doors**:

- One repo (`grounded2026`, `pauldevelopai/tracker`), one Vite build. `App.jsx`
  branches on `IS_BEAIREADY` (hostname starts with `beaiready`).
- One shared Postgres `tracker` DB backs the tracker **and** every hosted Node.
- One JWT cookie `tracker_token` (+ `JWT_SECRET`) unifies the tracker, the hosted
  Nodes, and (via a bridge) AIKit.
- **Tenants already carry `newsrooms.kind = 'newsroom' | 'business'`** (migration
  082). A "business" is a `newsrooms` row + a linked `organisations` row. The
  multi-audience data model is **already live** (tenant zero business = L2B).

So "migration" = **re-home the `!IS_BEAIREADY` newsroom surface onto the surviving
door, unify branding/tenancy, preserve the infra spine, retire the Grounded-only
shells.** Very little code *moves*; a lot of code gets *un-gated, re-scoped, and
re-branded*.

---

## 1. Decisions that change scope (need Paul)

The plan below assumes the **recommended** default for each. Flag any you want to
change — each is delimited so a different choice only touches its own workstream.

| # | Decision | Options | Recommended default |
|---|---|---|---|
| **D1** | How newsrooms are served on the surviving platform | (a) one door, **audience-switched** by `newsrooms.kind` / subdomain; (b) two subdomains, one platform; (c) one identical door for all | **(a/b hybrid)** one platform, an **audience "edition"** (brand + pillar set) chosen by host/tenant-kind. Branding coupling is shallow (see F1). |
| **D2** | Parent brand now that it serves newsrooms too | Keep "BE AI READY" for all; or a neutral parent brand with business/newsroom editions | Keep BE AI READY as the **business edition**; give newsrooms their **own edition brand** under the same platform (name TBD). Not a blocker to start. |
| **D3** | Fate of the Studio back-office (DAI's own CRM/fundraising/curriculum/mentoring/outreach/intelligence) | Keep as **internal admin** on the surviving platform; spin out; or retire | **Keep as internal admin.** DAI runs its business on it; it's `sector_id`-scoped single-tenant so it doesn't collide with multi-tenant data. Re-home behind an admin door; do **not** expose to clients. |
| **D4** | AIKit (`/tools` FastAPI) | Retire in favour of the BE AI READY Toolbox; or port the proxy + SSO bridge verbatim | **Retire** unless a specific AIKit tool has no Toolbox equivalent. Low blast radius (nothing in React hard-links `/tools` except AIKit's own injected chrome). Confirm no live dependency first. |
| **D5** | Sector-scoped client features (courses/journeys) — per-tenant or shared catalog? | Re-scope to `newsroom_id`; or keep global-by-sector as shared content | Decide per feature in F3. Default: **keep shared catalog global**, re-scope only what must be private per client. |

---

## 2. Target architecture

**One platform, editions by audience.**

- **Surviving door:** the beaiready door (rebranded per D2). The Grounded
  `PublicLayout` / `ProductShell` / `AdminArea` / `StudioShell` newsroom+public
  shells are retired *as public doors*; their still-needed features move onto the
  platform (see the inventory).
- **Editions:** a brand-config object keyed on host (or `newsrooms.kind`) selects
  wordmark, palette, home hero, and the **pillar/nav set**. Business edition =
  today's six pillars. Newsroom edition = a newsroom pillar set (derived from
  `ui/sections.js`). This is the F1 foundation.
- **Tenancy:** the single `newsroom_id` spine (`resolveNewsroomId` +
  `runWithNewsroom`) already serves both; `kind` drives edition + default pillar
  set. Reconcile the two parallel tenant registries (F2).
- **Internal admin:** DAI back-office (Studio) + platform ops (ingestion, triage,
  jobs, Nodes admin, feedback) live behind an admin-only area, not a public door.
- **Infra spine unchanged:** `tracker_token`/`JWT_SECRET`, the shared `tracker`
  DB + `node_<slug>_*` tables, Caddy routing, the two schedulers. Domain change is
  the main breakage risk (F6).

---

## 3. Master inventory — every Grounded surface, classified

Legend: **CARRY** = port onto the platform · **HAVE** = already on the beaiready
door · **INTERNAL** = keep, admin-only (D3) · **GLOBAL** = shared corpus, stays as
is · **RETIRE** = drop.

### 3a. Newsroom product (the `!IS_BEAIREADY` block)

| Feature | Route(s) | Tenancy today | Disposition | Notes |
|---|---|---|---|---|
| Builder | `/builder` | `newsroom_id` ✅ | **CARRY** (W2) | engine + API already tenant-scoped & host-agnostic; mount + palette only |
| Run | `/run` | `newsroom_id` ✅ | **CARRY** (W2) | |
| Journalism agents / tools | `/tool/:slug` (ToolWorkspace) | `newsroom_id` ✅ | **CARRY** (W3) | block registry shared; needs audience-filtered palette (F5) |
| Tools hub | `/tools-hub` | `newsroom_id` ✅ | **CARRY** (W3) | |
| AI-Legal Tracker (authed CRUD) | `/lawsuits`, `/regulation-tracker` | GLOBAL corpus | **CARRY** admin (W4) | public `/tracker` already **HAVE**; the authed edit/ingest side must move behind admin |
| Awareness | `/awareness` | GLOBAL content | **CARRY** (W7) | data-security essentials; complements Cyber Security pillar |
| Pulse | `/admin/pulse*`, `/pulse/:token` | `newsroom_id` ✅ (Airtable) | **CARRY** (W5) | admin-gated; per-newsroom check-ins; feature-flagged (`PULSE_ENABLED`) |
| KnowHow (capture) | `/knowhow/ask/:token`, `/knowhow/:token` | tenant ✅ | **HAVE** + unify (W6) | beaiready already has `BusinessKnowHow`; unify capture link surfaces |
| Newsroom Profile (grounding) | `/settings/newsroom-profile` | `newsroom_id` ✅ | **CARRY**/unify (W6) | newsroom analog of `beaiready_company_sources`; unify the grounding seam |
| Sections/Functions IA | `/sections`, `/functions` | — | **CARRY** as newsroom edition IA (W1) | becomes the newsroom pillar set |
| Ethics/Policy Builder | `/legal/ethics-builder` | GLOBAL | **HAVE** | beaiready "Build your AI policy" is the twin |
| Public legal site (explore/sources/monetisation/use-cases/tools) | `/legal/*`, `/monetisation`, `/open-source` | GLOBAL | **CARRY** public (W4) | decide which public marketing pages survive under the new brand |
| African Languages, 3 strategic layers | — | — | **RETIRE**/defer | all `status:'soon'`, unbuilt, concept-only |

### 3b. Studio — DAI back-office (all `sector_id`-scoped, single-tenant)

CRM (`contacts`, `organisations`), programmes (`cohorts`), curriculum (`courses`,
`course_modules`), assessments (`needs_assessments`), documents
(`document_templates`, `generated_documents`), services/mentoring
(`service_engagements`, learning journeys), fundraising (`funders`,
`funding_*`), marketing (`outreach_*`, `social_posts`), and the **intelligence
trio** (`industry_intelligence`, `knowledge_entries`, `newsletter_*`).

→ **INTERNAL (D3).** Keep as an admin-only area on the surviving platform. Not
client-facing. Two intelligence notes:
- The **digest pipeline** (`newsletter_digest` → `ai-news-today.js`/
  `governance-today.js`/`regulation-today.js`) already feeds the BE AI READY home
  briefings — **HAVE**, keep running.
- The **actionable market/competitor feed** (`industry_intelligence`) has **no
  business twin** → becomes the new per-tenant **Market Intelligence radar** (W9),
  built by forking the LeadFinder pattern, *not* by lifting the sector-scoped table.

### 3c. Platform plumbing

`auth`, `team-members`, `newsrooms`, `admin` overview, `feedback`,
`background-jobs`, `legal-sources`/`content-sources` ingestion, `tracker-review`,
`sectors`, `nodes` beacon, `uploads`. → **CARRY** into the internal admin +
preserve as spine (F6). All must survive or the platform stops working.

### 3d. Nodes (separate repos)

One registry (`nodes.json`), product-tagged (`grounded` / `bair`). 9 Nodes:
Audience Signal, Podcast Studio (local-only), Election Watch, Progress Tracker,
AI Ready Archive, SalesRep, Extract PDF, Newsroom Voice, LeadFinder (in-app).
→ **CARRY** (W8): re-tag grounded Nodes for the surviving storefront, repoint
hardcoded `grounded.developai.co.za` URLs, rebrand the `/nodes/` front door,
preserve cookie/DB/Caddy. Already-shared mechanism (add a tag, never copy).

### 3e. AIKit — **D4** (retire recommended).

### 3f. Already on the beaiready door (do NOT rebuild) — **HAVE**

Six pillars (Knowledge, Training, Governance, Cyber Security, Tools, Strategy) +
Visibility/Measurement; the full `/dashboard/*` client toolset (governance suite,
security register, visibility scan, productivity, strategy, staff-needs, KnowHow,
workspace, coach, extraction, prompts, LeadFinder); the `/admin/*` BE AI READY
admin portal (18 pages); public Toolbox, Tracker, Nodes storefront, Training,
About; the cross-business Insights engine; the daily briefings.

---

## 4. Shared foundations (build once; every workstream depends on these)

### F1 — Brand/audience editions
Extract a `brandConfig` keyed on host (and/or `newsrooms.kind`): wordmark, palette,
home hero, footer, chatbot `audience` prop, and the **pillar set**. Today these are
hard-coded in `beaiready/brand.js`, `BeAIReadyLayout.jsx`, `Login.jsx`,
`ResetPassword.jsx`, and `pillars.js`. Add a **newsroom edition** (pillars derived
from `ui/sections.js`). Deliverable: `pillars.js` becomes `pillars.business.js` +
`pillars.newsroom.js` selected by edition; layout/login read `brandConfig`.

### F2 — Tenant model unification
- `newsrooms.kind` already discriminates. Add edition resolution (kind → brand +
  pillar set).
- **Reconcile the parallel tenant registries:** `knowhow.tenants` has a
  `newsroom_id` bridge (mig 118) but only auto-links `product='bair'`;
  **`bair.bb_tenants` has no bridge at all.** Add a bridge + backfill so every
  tenant maps 1:1 across `newsrooms ↔ bb_tenants ↔ knowhow.tenants`.
- Onboarding: one flow creates the `newsrooms` (+ `organisations` for business)
  row and seeds the edition's default pillar roster.

### F3 — Tenancy re-scoping (the migration blocker)
Three tenancy generations coexist. Decide per table family (D5):
- **Already `newsroom_id`** (workflows, tool_outputs, newsroom_profile, prompts,
  governance register, KnowHow, LeadFinder, beaiready_*): survive as-is.
- **`sector_id` single-tenant** (CRM, curriculum, fundraising, outreach, learning,
  `industry_intelligence`, `knowledge_entries`): stay **INTERNAL** (D3) → no
  re-scope needed *unless* a given feature becomes client-facing (e.g. Market
  Intelligence → new `newsroom_id` schema in W9, not a re-scope of the old table).
- **Global corpus** (tracker, legal, content pipelines, tool directory, briefings,
  history tables): stay **GLOBAL**.
- **Audit `ai_interactions`** and other Tier-2 "default to office" writers to
  ensure per-tenant writes actually set `newsroom_id` (not collapsing into office).

### F4 — Grounding seam
Unify the two grounding sources: newsroom blocks ground via `newsroom_profile`
(`profile.js`); business blocks/tools should ground via `beaiready_company_sources`
(KnowHow). Make `loadProfile()` edition/tenant-aware so every block, tool, and the
Market Intelligence relevance filter ground in the right corpus.

### F5 — Block palette audience-filtering
`blocks.list()` returns everything. Add `audience: 'newsroom' | 'business' | 'both'`
to each block + filter by edition in `workflows.js` and `tools.js`. Curate a
business block pack (Copywriter/Researcher/Operations/Proposal-writer, prompts
re-framed) alongside the journalism agents.

### F6 — Infra spine preservation (the risk surface)
- **Auth cookie/domain:** `tracker_token` + `JWT_SECRET` identical across tracker,
  every hosted Node `.env`, and (if kept) AIKit. Domain change re-scopes the cookie
  — verify Nodes still authenticate.
- **Hardcoded `grounded.developai.co.za`** in `BeAIReadyNodes.jsx` (Open/download
  links) + `nodes/index.html` + `chrome.js` → repoint to the surviving domain or
  re-host Nodes same-origin.
- **Caddy** on the shared Lightsail box: reproduce `/`, `/tools`, `/nodes/`,
  per-slug Node routing under the new domain (`admin off` → `restart`, not reload).
- **Two schedulers:** the in-process DB-driven `node-cron` (reads
  `background_jobs`) **and** the OS-cron scripts on the box
  (`leadfinder-nightly`, `triage-nightly`, `scrape-only`, `send_digest`) — both
  must be re-homed/verified; the OS-cron ones live only in the box crontab.
- **Shared `tracker` DB + `node_<slug>_*` tables** must not be renamed (data
  continuity — cf. the sticky `capitalfm-verifier` slug); keep every Node's
  `DATABASE_URL` in sync.

---

## 5. Feature workstreams

Each is scoped; effort is relative (S/M/L). Shared foundations in **bold** are
prerequisites.

- **W1 — Newsroom edition shell.** Build the newsroom brand + pillar set; wire the
  edition switch. Deps: **F1, F2**. Size: **M**.
- **W2 — Builder + Run.** Mount BuilderPage/RunPage on the platform for both
  editions; nav entries. Deps: **F5, F4**. Size: **M** (engine already tenant-scoped).
- **W3 — Working Tools/agents.** Mount `/tool/:slug` + hub; business + newsroom
  palettes; door-aware chrome. Deps: **F5, F4**. Size: **S–M**. *(Do before W2 — its
  block pack is W2's palette.)*
- **W4 — Tracker full surface.** Public tracker already **HAVE**; move the authed
  lawsuits/regulations CRUD + ingestion (`legal-sources`, `content-sources`,
  `tracker-review`) behind internal admin; decide surviving public legal/marketing
  pages. Deps: F6. Size: **M**.
- **W5 — Pulse.** Re-home the per-newsroom check-in loop (admin + public answer +
  Airtable) into the newsroom edition. Deps: F2. Size: **M** (feature-flagged today).
- **W6 — KnowHow / Profile unification.** One grounding substrate across newsroom
  (`newsroom_profile`) and business (`beaiready_company_sources`); unify capture
  link surfaces. Deps: **F4**. Size: **M**.
- **W7 — Awareness.** Port the data-security essentials module; slot into the Cyber
  Security pillar (business) / Governance section (newsroom). Size: **S**.
- **W8 — Nodes consolidation.** Re-tag, repoint URLs, rebrand front door, preserve
  spine. Deps: **F6**. Size: **M**.
- **W9 — Market Intelligence radar** *(new capability)*. Fork the LeadFinder pattern
  (`leadfinder.*` schema, per-tenant nightly scrape→classify→review→learn) into a
  `marketwatch.*` schema: per-client sources + competitor watchlist → scrape
  (reuse `scrapeSectorNews` + Claude classify incl. `competitor_move`) → per-tenant
  signal feed with keep/dismiss. Surface on the Visibility pillar ("What's moving in
  your market"). Deps: **F4**. Size: **M**. *Reuses ~70% of LeadFinder plumbing.*
- **W10 — Studio → internal admin (D3).** Re-home the DAI back-office behind an
  admin-only door on the surviving platform; strip its public/newsroom shell.
  Keep the digest pipeline running. Size: **M** (mostly re-shelling, not rebuild).
- **W11 — AIKit decision (D4).** Retire `/tools` (remove proxy + bridge) or port
  verbatim. Confirm no live dependency first. Size: **S** (retire) / **M** (port).
- **W12 — Cutover.** DNS/redirects `grounded.* → beaiready.*` (301 the surviving
  public pages, redirect the rest), Caddy under the new domain, verify Nodes +
  schedulers + auth end-to-end, then retire the Grounded door. Deps: **F6**.
  Size: **M**, must be last.

---

## 6. Suggested phasing

1. **Phase 0 — Foundations:** F1, F2, F3 (decisions), F4, F5, F6 (plan). Nothing
   ships to users; everything else depends on these.
2. **Phase 1 — Newsroom edition stands up:** W1, then W3 → W2 (tools then builder),
   W6, W7. Newsrooms can log into the platform and use the core product.
3. **Phase 2 — Newsroom-specific + new value:** W4 (tracker admin), W5 (Pulse),
   W8 (Nodes), W9 (Market Intelligence).
4. **Phase 3 — Internalise + cut over:** W10 (Studio → admin), W11 (AIKit), W12
   (cutover + retire Grounded door).

---

## 7. Risk register

| Risk | Where | Mitigation |
|---|---|---|
| Hosted Nodes 502 on domain/cookie change | `tracker_token`/`JWT_SECRET`, cookie domain, Node `.env` | Verify auth end-to-end per Node before cutover; keep DB + slugs unchanged (F6) |
| Hardcoded grounded URLs break Node Open/download | `BeAIReadyNodes.jsx`, `nodes/*` | Repoint or re-host same-origin (W8/F6) |
| Silent tenancy leak (sector→newsroom) | `ai_interactions` Tier-2 default-office writers; CRM if ever client-facing | Audit writers; keep CRM INTERNAL (F3) |
| Parallel tenant registries drift | `bair.bb_tenants`, `knowhow.tenants` vs `newsrooms` | Bridge + backfill before onboarding (F2) |
| Scheduler loss | OS-cron scripts live only in box crontab | Inventory + re-home both schedulers (F6) |
| Losing DAI ops when Grounded retires | Studio back-office | Keep as INTERNAL admin (D3/W10) |
| Front-end changes invisible | Vite build step | `npm run build` / `deploy.sh` (repo hard rule) |

**Hard rule preserved throughout:** no fake data — real data or honest empty
states only.

---

*Open the decisions in §1 first; they gate Phase 0. This doc is the source of
truth for the consolidation — keep it updated as workstreams land.*
