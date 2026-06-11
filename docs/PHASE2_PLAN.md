<!-- Created 2026-06-10. Design + execution plan for Phase 2 of GROUNDED_V3_BUILD_PLAN.md.
     Phase 2 = the FIRST backend/schema phase: re-introduce per-newsroom multi-tenancy
     (newsroom_id) + unify the node model. Local-first, additive + reversible migrations,
     tested on a copy of the box DB before anything ships. Governed by NO FAKE DATA. -->

# Phase 2 — multi-tenancy (`newsroom_id`) + node-model unification

> **Status: DESIGN signed off (2026-06-10). Implementing 2a (schema foundation) local-first.**

## Settled decisions (2026-06-10)
1. **Onboarding = admin-managed.** Develop AI (platform admins) create each newsroom and create/assign its users from the admin area. No open self-serve signup yet.
2. **Develop AI = operators + a dogfooding newsroom.** Staff are cross-newsroom **admins**, AND there is a dedicated **"Develop AI (office)" newsroom** they use to run/test the product exactly as a member would.
3. **"Newsroom #1" = the Develop AI office newsroom.** All existing per-newsroom data (it was created during Develop AI's own building/testing) backfills to it. Real partner newsrooms are created fresh via onboarding.
4. **Access:** `member` → own newsroom only; `admin` → cross-newsroom (a newsroom switcher, like today's sector selector), home newsroom = the office one.

## Why this is different from Phase 1
Phase 1 was cosmetic/routing with **zero backend changes** — it couldn't break anything.
Phase 2 changes the **database schema** and the **live data** on the box. So: every
migration is **additive + reversible**, developed **local-first** (`:5433` DB), tested
against a **copy of the box DB**, and only ever reaches the box on Paul's explicit
`deploy.sh` command.

**De-risking fact:** the schema was *adapted down* from a multi-newsroom platform — e.g.
`073_create_workflows.sql` says *"no multi-newsroom newsroom_id like the source platform."*
We are **re-introducing a known model**, not inventing one.

## The shape: multi-tenancy here is SELECTIVE
Not "newsroom_id on every table." Three buckets:

| Bucket | Tables (representative) | Change |
|---|---|---|
| **Global / public** — one shared copy for everyone | `ai_lawsuits`, `ai_regulations`, `ai_legal_usecases`, `ai_legal_sources`, `ai_legal_raw_items`, `ai_legal_*`, `tools` | **none** (stays shared) |
| **Per-newsroom** — isolated per tenant → gets `newsroom_id` | `newsroom_profile`, `workflows`, `workflow_runs`, `workflow_assignments`, `tool_outputs`, `uploaded_documents`, `feedback`, `user_questions`, `ai_interactions`, `ai_conversations`, `agent_conversations`, `notifications`, + the data-security (077) / ethics (078) / content (069) pipeline tables *(confirm per-table when writing 2a)* | **add `newsroom_id`** |
| **Develop AI internal / Studio** — single tenant (Develop AI's own ops) | `contacts`, `organisations`, `cohorts*`, `courses*`, `funders`, `funding_*`, `outreach_*`, `social_*`, `newsletter_*`, `industry_intelligence`, `knowledge_*`, `learning_*`, `service_*`/`engagement_*`, `assessment*`, `document_templates`, `generated_documents`, `gmail_tokens` | **none** (stays single-tenant) |
| **Auth** | `team_members` | **add `newsroom_id`** (the user's home newsroom) |

## Access model
- **`member`** → scoped to **their own** `newsroom_id`; sees only their newsroom's product data (profile, workflows, archive, feedback…).
- **`admin`** (Develop AI platform operators) → **cross-newsroom**: AdminArea + a newsroom switcher (same pattern as today's sector selector) to act inside any newsroom; Studio stays admin-only.
- **Global** legal-tracker data → visible to everyone (members + admins).

## Migration sequence — each step reversible, local-first, tested on a DB copy
- **2a · Schema foundation (additive, no behaviour change). ✅ DONE + verified locally (2026-06-10).** `server/db/migrations/080_phase2_newsrooms.sql`: created `newsrooms` (seeded "Develop AI (office)" = `00000000-0000-0000-0000-000000000001`); added nullable `newsroom_id` to 11 per-newsroom tables (team_members, newsroom_profile, workflows, workflow_runs, tool_outputs, uploaded_documents, user_questions, feedback, ai_interactions, ai_conversations, agent_conversations); backfilled all existing rows → office; added scoping indexes + a one-profile-per-newsroom partial unique index. Atomic (migrate.js BEGIN/COMMIT); manual rollback documented at the foot of the file. **Local DB was first brought up to date (068–079 had never been applied locally).** Nothing reads newsroom_id yet → app behaviour unchanged.
- **2b · Auth carries newsroom. ✅ DONE + verified (2026-06-10).** `newsroom_id` in the login/register JWT + response; `/api/auth/me` returns `newsroom_id` + joined `newsroom_name`/`newsroom_slug`. Self-registrations land in the office newsroom (preserves pre-tenancy behaviour; 2d revisits with invites). `server/lib/tenancy.js`: `OFFICE_NEWSROOM_ID`, `resolveNewsroomId(req)` (member→own, admin→`X-Newsroom-Id` header, legacy-token DB fallback so nobody re-logs-in).
- **2c · Scoping. ✅ DONE + verified (2026-06-11).** Scoped: `workflows.js` (CRUD + runs + run history), `newsroom-profile.js` (one profile per newsroom), `tools.js` (tool_outputs writes + history), and the **profile loader every agent grounds in** (`services/blocks/profile.js`) via **ambient tenancy** (`AsyncLocalStorage` — `runWithNewsroom()` wraps workflow/tool execution so no block signature changed). `feedback` writes tagged with newsroom (reads stay cross-newsroom — it's a platform ops queue by design). Classified as NOT needing scoping: `user-questions` (platform-wide by design), `ai-conversations` + `agent-conversations` (Studio bucket, single-tenant). **Verified with a live two-newsroom test** (second newsroom + member user, since removed): member sees zero office workflows, cross-newsroom id access 404s, per-newsroom profiles separate, admin `X-Newsroom-Id` switcher works, and the header is ignored for members (no privilege escalation).
- **2d · Onboarding UI.** AdminArea → **Newsrooms**: create a newsroom (name/slug) + create/assign its users.
- **2e · Enforce.** After backfill + scoping verified, make `newsroom_id` `NOT NULL` + add FKs/indexes.
- **2f · Node-model unification.** One "functions/nodes" directory (largely done in Phase 1 step 6); finish unifying Builder blocks ↔ hosted Nodes.

## Reversibility / safety
- Columns added **nullable**, backfilled, only later enforced — so every intermediate state is valid and the **down-migration is a clean drop**.
- Developed and tested on the **local `:5433` DB** and a **dump/restore copy of the box DB** before the box sees it.
- The box runs migrations only via `deploy.sh`, only when Paul says so.

## Remaining to confirm during 2a (technical, not blocking)
- Confirm the exact per-newsroom table list against the live DB (esp. the 069/077/078 pipeline tables, and verify all migrations are applied locally).
