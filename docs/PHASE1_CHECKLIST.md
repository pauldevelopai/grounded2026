<!-- Created 2026-06-09. Execution checklist for Phase 1 of GROUNDED_V3_BUILD_PLAN.md.
     Phase 1 = information-architecture + cosmetic restructure. Presentational/navigational
     only — no new backend logic, no new data, no fake data. Every current real feature keeps
     working and stays reachable; unbuilt sections show an honest "in development" state. -->

# Phase 1 — build checklist (IA + cosmetic restructure)

Scope: **re-home and restyle what already exists.** No backend logic changes, no schema changes, no new data, and (governing rule) **no fake data** — unbuilt sections get an honest "in development" state. Each step below is a self-contained, reviewable commit.

## The three buckets

The restructure sorts every surface into one of three shells:

1. **Product** — what a newsroom sees. The concept-note-led IA (5 sections + 3 strategic layers + Profile).
2. **Platform admin** — GROUNDED operations (admin-role): tracker ingestion, Nodes oversight, feedback, users, reference data. Stays in the product, behind an admin area — it runs the product.
3. **`/studio` (Develop AI back-office)** — Develop AI's own business ops: CRM, fundraising pipeline, outreach, curriculum, mentoring, newsletter, intelligence, database. Same codebase, separate shell, admin-gated.

## Route migration table

Legend — Bucket: **P** product · **A** platform-admin · **S** studio. Status of the destination feature: ✅ real today · 🟡 partial · 🔴 in-development shell.

### Product — newsroom-facing

| Current route | Component | New home (section) | Bucket | Feat |
|---|---|---|---|---|
| `/` (public) | PublicHome | **Hub** front door (5 sections + 3 layers) | P | rebuild |
| `/builder` | BuilderPage | Content Production → Builder | P | ✅ |
| `/run` | RunPage | **Home** (run a workflow) + Content Production | P | ✅ |
| `/tools-hub`, `/tool/:slug` | ToolsHub, ToolWorkspace | Content Production → Functions directory (grouped by section) | P | ✅ |
| agent workspaces (Verifier/Researcher/Copywriter/News Gatherer/Social) | via blocks/tool workspaces | Content Production | P | ✅ |
| Archivist / Translator / A&V Producer | blocks (coming-soon) | Content Production | P | 🟡/🔴 |
| `/nodes/` (Caddy front door), Audience Signal, AI-Ready | hosted Nodes | Sustainability / Content Production (by node) | P | ✅ |
| `/lawsuits` | LawsuitTracker | AI Governance → Tracker | P | ✅ |
| `/regulation-tracker` | RegulationTracker | AI Governance → Tracker | P | ✅ |
| `/legal/dashboard` | PublicLegalDashboard | AI Governance (public view) | P | ✅ |
| `/legal/lawsuits(/:id)`, `/legal/regulations(/:id)` | Public detail pages | AI Governance (public) | P | ✅ |
| `/legal/explore` | PublicExplore (connections) | AI Governance → Tracker | P | ✅ |
| `/legal/use-cases` | PublicUseCases | AI Governance | P | ✅ |
| `/legal/ethics` | PublicEthics | AI Governance | P | ✅ |
| `/legal/ethics-builder` | EthicsPolicyBuilder | AI Governance → **Policy Builder** | P | 🟡 |
| `/legal/sources` | PublicSources | AI Governance (public sources) | P | ✅ |
| `/awareness` | PublicAwareness | AI Governance → Awareness | P | ✅ |
| `/documents` | DocumentsList | AI Governance → Policies/Frameworks/Security | P | ✅ |
| `/monetisation` | PublicMonetisation | Sustainability → distribution | P | ✅ |
| `/training` | PublicTraining | AI Training | P | ✅ |
| `/open-source` | PublicToolsDirectory | Content Production → Functions (OSS tools) | P | ✅ |
| `/admin/pulse/*`, `/pulse/:token` | Pulse | AI Training → **Pulse** (rename off `/admin`) | P | ✅🟡 |
| `/settings/newsroom-profile` | NewsroomProfile | Profile | P | ✅ |
| — (new) | — | African Languages | P | 🔴 |
| — (new) | — | Knowledge & Sector Intelligence | P | 🔴 |
| — (new) | — | Open Newsroom | P | 🔴 |

### Platform admin (GROUNDED ops — admin area, stays in product)

| Current route | Component | New home | Bucket |
|---|---|---|---|
| `/admin` | AdminOverview | Platform admin → Command centre | A |
| `/scraper-dashboard` | ScraperDashboard | Platform admin → Tracker ingestion | A |
| `/ingestion` | IngestionPage | Platform admin → Tracker ingestion | A |
| `/legal-sources` | LegalSourcesPage | Platform admin → Tracker sources | A |
| `/use-cases-admin` | UseCasesAdmin | Platform admin → Tracker use-cases | A |
| `/node-admin` | NodesAdmin | Platform admin → Nodes | A |
| `/feedback` | FeedbackList | Platform admin → Feedback | A |
| `/admin/questions` | UserQuestions | Platform admin → Questions | A |
| `/settings/team` | TeamSettings | Platform admin → Team | A |
| `/settings/reference-data` | ReferenceData | Platform admin → Reference data | A |
| `/settings/jobs` | BackgroundJobs | Platform admin → Jobs | A |
| `/insights` | Insights | Platform admin → Insights | A |

### `/studio` — Develop AI back-office (separate shell)

| Current route | Component | Bucket |
|---|---|---|
| `/dashboard` | Dashboard (DevAI stats) | S |
| `/contacts(/:id)`, `/organisations(/:id)` | CRM | S |
| `/programmes(/:id)` (cohorts), `/assessments(/:id)`, `/leads` | CRM/cohorts | S |
| `/training-materials`, `/course-builder`, `/curriculum(/:id)` | Curriculum | S |
| `/mentoring`, `/services(/:id)` | Delivery | S |
| `/marketing/campaigns(/:id)`, `/marketing/social` | Outreach | S |
| `/fundraising`, `/fundraising/funders(/:id)`, `/fundraising/opportunities/:id` | Fundraising pipeline | S |
| `/newsletter`, `/intelligence`, `/knowledge` | DevAI AI tools | S |
| `/database` | DatabaseEditor | S |
| `/settings/sectors`, `/settings/gmail` | DevAI settings | S |
| `/learning(/:contactId)`, `/agents/*` | Learning/agents (DevAI) | S |

> Note the name clashes to keep straight during the move: the **newsroom-facing Fundraiser** (Sustainability, 🔴) is a *different* surface from Develop AI's internal **`/fundraising` pipeline** (Studio). Same for the newsroom **AI Training library** (🔴) vs Develop AI's internal **`/curriculum`** (Studio), and **Knowledge & Sector Intelligence** (🔴) vs the internal **`/knowledge`** base (Studio). Phase 1 only relocates the existing internal ones into Studio; the newsroom versions are built in Phase 3.

## Shared components / system to build

- **`theme` / design tokens** — colours, type scale, spacing, radii, section iconography. One source, applied to all three shells. (Anchor to the existing "Grounded · Newsroom-owned AI · by Develop AI" wordmark.)
- **`ProductShell`** — newsroom nav (the 5 sections + 3 layers + Profile) + topbar. Replaces the current Sidebar for product routes.
- **`StudioShell`** — back-office nav, admin-gated, visually distinct from the product.
- **`AdminArea`** — platform-admin nav (can live inside ProductShell behind an "Admin" entry, admin-role only).
- **`SectionLanding`** — a reusable section page (e.g. AI Governance) that lists its functions/nodes with online-or-local badges.
- **`InDevelopment`** — the honest empty-state component (clear "in development", what it will do, no fake data). Used by African Languages, Knowledge & Sector, Open Newsroom, and the 🔴/🟡 functions.
- **`Hub`** — public front door presenting the 5 sections + 3 layers + the data-sovereignty foundation story.
- **`NodeCard` / function tile** — unified card for any function/node (agent, tool, or hosted Node), with run online / run local affordances.

## `/studio` split mechanics

- Add a **`StudioShell`** layout + a top-level entry (e.g. an "Open Studio" link visible only to admins).
- **Re-home, don't break:** mount the Studio-bucket components under the StudioShell. Keep their existing component code unchanged; only the wrapping layout + nav placement change. Add redirects from any old top-level path the product nav used to expose, so bookmarks survive.
- **Role gate:** Studio + Platform-admin routes stay behind `requireRole('admin')` (server already enforces this on the APIs; mirror it on the client routes).
- **Reversible:** this is layout/routing only — no component rewrites, no API changes, no schema changes.

## Step sequence (each = one reviewable commit)

1. **Design tokens + `InDevelopment` + `SectionLanding` skeleton** — the cosmetic system and the honest empty-state, with nothing moved yet.
2. **`ProductShell` + the concept-note-led nav** — the five sections + three layers + Profile; route the *already-real* product pages into it (Builder, Run, Tracker, Awareness, Profile, Pulse). 🔴 sections render `InDevelopment`.
3. **Hub front door** — rebuild `/` around the 5 sections + 3 layers + foundation story; re-home public marketing pages under it.
4. **`StudioShell` + move the back-office** — relocate the Studio-bucket routes; add the admin-only entry + redirects.
5. **`AdminArea`** — gather the platform-admin routes (ingestion, Nodes, feedback, users, reference data) into one admin area inside the product.
6. **Functions directory + `NodeCard`** — unify in-app agents/tools and hosted Nodes into one directory, grouped by the 5 sections, online-or-local badges.
7. **Polish pass** — consistent headers/empty states/loading across all three shells; kill any leftover hardcoded sample arrays in the public pages (replace with live fetch or honest empty state).

## Definition of done (Phase 1)

- Every current real feature still works and is reachable in the new IA.
- The product reads as the concept note's five sections + three strategic layers; Develop AI's back-office is behind `/studio`; platform-admin is its own admin area.
- One consistent visual identity across all shells.
- Every unbuilt section shows `InDevelopment` — **zero fabricated data anywhere.**
- No backend logic, schema, or data changes in this phase.
