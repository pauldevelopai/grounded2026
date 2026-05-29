# Pulse — technical reference (for developers / Claude Code)

A cadenced feedback loop between newsrooms and their Grounded Nodes, built inside
the **tracker** repo. **Additive and feature-flagged**: when `PULSE_ENABLED` is not
`true`, no Pulse code path runs, the nav item is hidden, and every `/api/pulse/*`
route 404s. Nothing in the existing tracker was modified beyond additive mounts in
`server/index.js`, additive keys in `server/config.js`, additive routes in
`client/src/App.jsx`, and one conditional nav item in `client/src/components/Sidebar.jsx`.

The user-facing operating guide is `../../PULSE_GUIDE.md`.

---

## Build status (29 May 2026)

| Phase | Scope | State |
|---|---|---|
| 0 | Investigation | ✅ done |
| 1 | Airtable schema (4 tables) | ✅ done |
| 2 | Server routes + Airtable/GitHub/Anthropic plumbing + prompts | ✅ done |
| 3 | Admin UI (overview, cycle detail, newsroom detail) | ✅ done |
| 4 | Public mobile answer page at `/pulse/:token` | ⏳ TODO |
| 5 | Prompt refinement | ⏳ functional drafts exist; refine |
| 6 | Final flag wiring: `.env.example`, root `CLAUDE.md` section, verify both states | ⏳ TODO (client flag already wired) |

**Deployed:** branch `pulse-system` is checked out on the box with `PULSE_ENABLED=true`.
All integrations verified live (Airtable R/W, GitHub introspection, Anthropic
`claude-opus-4-8`). A full end-to-end cycle creation via the authed UI had not yet
been run as of this writing.

---

## Architecture / data flow

```
Admin UI (client/src/pages/pulse/*)
        │  fetch /api/pulse/*  (cookie auth, admin role)
        ▼
routes/pulse.js  ──────────────► server/pulse/*  ──► Airtable REST  (4 Pulse tables R/W; Newsrooms/Installs R)
routes/pulse-public.js (no auth) ─┘                ├► GitHub API     (node source, read)
        ▲                                          └► Anthropic SDK  (Opus: gen / plan / briefing / report)
        │  /pulse/:token (public answer page — Phase 4)
   Newsroom (phone)
```

**Storage decision:** Pulse persists to **Airtable** (MediaMap base
`app4FVlF4AAy8Q8s2`), not Postgres — this is the *first and only* Airtable
integration in the tracker (the rest of the app is Postgres). No DB migrations are
added by Pulse.

**Node code source:** fetched from `github.com/<org>/node-<slug>` at cycle time
(decision: over the network, so it works on the box; no local checkout). Repo name
is resolved by convention (`node-<slug>`) with a `PULSE_NODE_REPOS` JSON override.

**Newsroom resolution:** Node Installs has no link to Newsrooms (its `newsroom`
field is free text), so `newsroom-match.js` fuzzy-matches and the admin confirms;
the chosen Newsroom is stored on the Cycle as text + record-id (NOT an Airtable
link — a link would add a reverse column to the protected Newsrooms table).

---

## Files

### Server (`server/`)
- `config.js` — adds `pulseEnabled, airtableApiKey, airtableBaseId, githubToken, githubOrg, pulseNodeRepos, publicBaseUrl` (additive).
- `index.js` — additive mounts (before the generic `/api` admin router):
  - `GET /api/pulse/status` (ungated probe: `{enabled}`)
  - `/api/pulse/public` → `requirePulse` + `pulsePublicRoutes`
  - `/api/pulse` → `requirePulse` + `requireAuth` + `requireRole('admin')` + `pulseRoutes`
- `middleware/pulse-flag.js` — `requirePulse` (404 when flag off).
- `routes/pulse.js` — admin endpoints.
- `routes/pulse-public.js` — public (token-validated) endpoints.
- `pulse/airtable.js` — REST client. **Writes hard-guarded to the 4 Pulse table IDs**; reads Newsrooms/Installs/Events; Meta API for the tag library; `cycleByToken`.
- `pulse/github.js` — `resolveRepo(slug)` + raw file/dir fetch.
- `pulse/introspect.js` — `assembleNodeContext(slug)` → token-budgeted code summary + version/runtime.
- `pulse/newsroom-match.js` — `matchNewsroom(query, newsrooms)` fuzzy ranking.
- `pulse/generate.js` — Anthropic calls: `generateQuestions / draftPlan / generateBriefing / generateReport` (model `claude-opus-4-8`, prompt-cached, tolerant JSON parse).
- `pulse/prompts.js` — runtime `.md` loader + `{{placeholder}}` render.
- `pulse/format.js` — record → prompt-text formatters.
- `pulse/ids.js` — `shortId(prefix)` for text-primary IDs, `publicToken()`.
- `pulse/prompts/{generate,plan,claudecode-briefing,report}.md` — editable at runtime.

### Client (`client/src/`)
- `hooks/usePulseEnabled.js` — module-cached fetch of `/api/pulse/status`.
- `pages/pulse/PulseGate.jsx` — route wrapper; renders "Not found" when off.
- `pages/pulse/PulseOverview.jsx` — `/admin/pulse` (metrics, active table, cohort grid, trigger modal).
- `pages/pulse/PulseCycleDetail.jsx` — `/admin/pulse/cycles/:id` (per-status workhorse).
- `pages/pulse/PulseNewsroomDetail.jsx` — `/admin/pulse/newsrooms/:id`.
- `pages/pulse/pulseUi.jsx` — `StatusBadge, CopyBlock, sendJson, fmtDate, muted, STATUS_COLOR`.
- `App.jsx` — 3 routes wrapped in `<PulseGate>` (additive).
- `components/Sidebar.jsx` — adds one "Pulse" item under GROUNDED when enabled (additive).

---

## Airtable schema (base `app4FVlF4AAy8Q8s2`)

Every Pulse field description starts with `🔄`. Table IDs:

| Table | ID | Primary | Notes |
|---|---|---|---|
| Pulse — Cycles | `tblqJM6HuyZRjcCTU` | Cycle ID | + `AI tip`; links Questions/Response/Change Plan; Newsroom/Node Install as **text refs** (+ `… record ID`) |
| Pulse — Questions | `tblq6wSC8Ilq417GQ` | Question ID | reverse link `Cycle`; `Tag` singleSelect (curated, grows) |
| Pulse — Responses | `tblEWg58SenX8taon` | Response ID | reverse link `Cycle` |
| Pulse — Change Plans | `tblrc65g0eoM1n2bP` | Plan ID | reverse link `Cycle`; `Risk flags` multiSelect |

Read-only sources: Newsrooms `tblUCJtQvYFcSIdxP`, Node Installs `tbl14KQxvb6HUUzcs`,
Node Events `tblJhlmbK5yYmsRs6`.

**Schema deviations (forced by Airtable, intentional):**
1. Primaries are `singleLineText` (app-populated via `shortId`), not Autonumber —
   the Airtable API can't create autonumber fields and they can't be primary anyway.
2. Newsroom / Node Install are text refs, not links — a link would add a reverse
   column onto the protected source tables.
3. `AI tip` field added to Cycles (brief only had the tip on Responses, but it's
   generated at creation and editable during vetting, so it must live on the cycle
   until submission, then copies to the response's `AI tip sent`).

---

## API surface (all under `/api/pulse`, gated by `requirePulse`)

Ungated: `GET /status` → `{enabled}`.

**Admin** (auth + admin role):
- `GET /newsrooms`, `GET /node-installs` (with fuzzy `newsroomMatches`), `GET /tags`
- `POST /cycles` `{newsroomId|newsroomName, nodeInstallId|nodeSlug}` → generate + create
- `GET /cycles` (filter `?newsroom=&status=`), `GET /cycles/:id`, `PATCH /cycles/:id` (`{notes,tip}`)
- `PATCH /questions/:id` (vetting edits; preserves original, marks edited)
- `POST /cycles/:id/vet | /send | /mark-responded | /draft-plan | /mark-shipped | /send-report`
- `POST /plans/:id/approve` (generates briefing) `| /plans/:id/reject` (`{reason}`)

**Public** (token only, no auth):
- `GET /public/cycle/:token` → questions only (no scoring values, no admin data)
- `POST /public/submit` `{token, answers[], openFeedback, name, role}` → writes Response, returns `{tip, nodeUrl}`

---

## Environment (box `.env`, git-ignored)

```
PULSE_ENABLED=true
AIRTABLE_API_KEY=pat...        # scopes: data.records:read + data.records:write + schema.bases:read; GRANT base app4FVlF4AAy8Q8s2
AIRTABLE_BASE_ID=app4FVlF4AAy8Q8s2
GITHUB_TOKEN=github_pat_...     # fine-grained: Contents:Read on the pauldevelopai node repos (or classic `repo`)
# optional:
PULSE_GITHUB_ORG=pauldevelopai
PULSE_NODE_REPOS={"verifier":"node-capitalfm-verifier"}   # slug→repo overrides
PULSE_MODEL=claude-opus-4-8
PUBLIC_BASE_URL=https://grounded.developai.co.za
```
Reuses the existing `ANTHROPIC_API_KEY`.

---

## Deploy (the actual reality)

- The box (`52.56.143.231`, eu-west-2) is reached over SSH with
  `~/.ssh/lightsail-grounded.pem` — the **safe** key. **Do NOT use
  `LightsailDefaultKey-eu-west-2.pem`** (the leaked default, pending rotation).
- `node_modules` lives in **`server/`** and **`client/`**, not the repo root —
  run node one-liners from those dirs (the SDK/dotenv won't resolve from root).
- `deploy.sh` does `git stash` → `git pull --ff-only` **on the box's current
  branch** → server `npm install` → `node server/db/migrate.js` (Pulse adds no
  migrations) → **client build** → `pm2 restart tracker-server`.
- The server reads `.env` via `dotenv` (`override:true`) at startup, so a plain
  `pm2 restart` picks up new `.env` values (pm2's own env cache is bypassed).
- **Branch test deploy:** box was on `main`; we `git checkout pulse-system` then
  ran `deploy.sh`. To finish: merge `pulse-system` → `main`, push, then on the box
  `git checkout main && bash deploy.sh`.

---

## Troubleshooting (run from `/home/ubuntu/tracker`)

```bash
# Airtable token (expect HTTP 200; 403/401 = wrong scopes / no base grant / bad token)
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://api.airtable.com/v0/app4FVlF4AAy8Q8s2/tblUCJtQvYFcSIdxP?maxRecords=1" \
  -H "Authorization: Bearer $(grep ^AIRTABLE_API_KEY= .env | cut -d= -f2)"

# GitHub token (expect 200; 401 = bad token, 404 = repo not granted)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $(grep ^GITHUB_TOKEN= .env | cut -d= -f2)" \
  -H "User-Agent: grounded-pulse" https://api.github.com/user

# Live module tests (read .env directly; run from server/ for the SDK)
node --input-type=module -e "import('./server/pulse/airtable.js').then(async at=>{console.log((await at.listNewsrooms()).length,'newsrooms')})"
node --input-type=module -e "import('./server/pulse/introspect.js').then(async m=>{const r=await m.assembleNodeContext('analytics');console.log(r.repo,r.version,r.summary.length)})"

# End-to-end HTTP
curl -s https://grounded.developai.co.za/api/pulse/status        # {"enabled":true}
curl -s -o /dev/null -w "%{http_code}\n" https://grounded.developai.co.za/api/pulse/cycles   # 401
```

UI errors that say "Something went wrong" or fail to load data are almost always a
rejected Airtable/GitHub token — check the two curls above first.

---

## What's left (Phases 4–6)

- **Phase 4:** public answer page at `/pulse/:cycleToken` — a new unauthenticated
  React route (under `PublicLayout` or bare), mobile-first, no admin chrome, using
  the existing `GET /public/cycle/:token` + `POST /public/submit`. Render 3 MCQs as
  radio groups + open textarea + optional name/role; on success show the tip + a
  "check your node" CTA.
- **Phase 5:** refine the four prompt `.md` files against real cycles.
- **Phase 6:** add `PULSE_ENABLED=false` to `.env.example` with a comment; add a
  Pulse section to the root `CLAUDE.md`; verify both flag states. (The client-side
  flag gating is already wired via `usePulseEnabled` + `/api/pulse/status`.)
