# Consolidation Audit — evidence behind the build plan

> Companion to [`CONSOLIDATION_BUILD_PLAN.md`](./CONSOLIDATION_BUILD_PLAN.md).
> This is the raw inventory from the 2026-07-19 five-dimension scan of Grounded,
> captured so we never have to re-run it. The plan cites these findings; this doc
> is the "show your work". Sections: (1) routes, (2) jobs/schedulers/integrations,
> (3) DB tenancy, (4) newsroom product / Nodes / AIKit, (5) current BE AI READY.

Anchor fact: **one repo (`grounded2026`), one Postgres `tracker` DB, one auth
cookie `tracker_token` (+`JWT_SECRET`), two host-switched doors** (`App.jsx`
branches on `IS_BEAIREADY`). No server-side host gating — tenancy is
`resolveNewsroomId` (per-newsroom) / `sector_id` (global-by-sector) / none (global).

---

## 1. Server routes (by bucket)

**NEWSROOM-PRODUCT** (per-`newsroom_id`, carry to platform):
`workflows.js` (`/api/workflows`, Builder engine) · `tools.js` (`/api/tool-kit`,
single-block ToolWorkspace runs) · `newsroom-profile.js` (grounding, 1 row/tenant)
· `references.js` (per-tool reference library) · `prompts.js` (`/api`, model-aware
prompt library, org-scoped + per-user variants) · `ai-assistant.js` · `pulse.js` +
`pulse-public.js` (Airtable, feature-flagged `PULSE_ENABLED`) · `knowhow.js` +
`knowhow-public.js` (`knowhow.*` schema) · `user-questions.js` · `toolkit-admin.js`
+ `toolkit-social.js` (the shared AI toolbox catalogue — beaiready-branded but
shared).

**DAI-BACK-OFFICE** (`sector_id`-scoped single-tenant → keep INTERNAL):
`contacts` · `organisations` · `cohorts` (+`cohort-participants`,`-sessions`) ·
`courses` (+`course-modules`,`ai-conversations`) · `needs-assessments` ·
`assessment-questions` · `document-templates` · `generated-documents` ·
`service-engagements` (+`engagement-sessions`,`-milestones`) · `outreach-campaigns`
· `outreach-messages` · `social-posts` · `gmail` · `funders` ·
`funding-opportunities` (+`funding-applications`,`-reports`) · `dashboard` ·
`intelligence` (industry_intelligence) · `knowledge` (knowledge_entries) ·
`newsletter` · `briefings` · `learning-journeys` (+`-outcomes`,`-tasks`) ·
`participant-tokens` + `participant-portal` · `agent-conversations` +
`agent-actions` (Studio AI over CRM) · `notifications`.

**PLATFORM-PLUMBING** (carry into internal admin + preserve as spine):
`auth` (JWT `tracker_token` + AIKit SSO bridge) · `team-members` · `newsrooms`
(tenant registry) · `admin` (command centre) · `feedback` · `background-jobs` ·
`legal-sources` + `content-sources` (ingestion) · `tracker-review` · `sectors` ·
`nodes` (beacon + admin overview) · `uploads`.

**BEAIREADY-SPECIFIC** (per-tenant via `resolveTenant`):
`beaiready.js` (dashboard API) · `beaiready-training.js` · `beaiready-workspace.js`
· `beaiready-insights.js` (k-anon cross-business) · `beaiready-knowhow.js` ·
`beaiready-leadfinder.js` (`leadfinder.*`) · `bair-audits`/`bair-findings`/
`bair-score`/`bair-intake` (`bair.*`).

**SHARED/PUBLIC** (global corpus, both doors — must survive):
`public.js` (`/api/public` + versioned `/api/v1`) · `public-html.js` (SSR OG meta)
· `lawsuits.js` · `regulations.js` · `usecases.js`.

Note: only `beaiready-*` uses `resolveTenant`; newsroom-product rolls its own
`resolveNewsroomId`/`X-Newsroom-Id`; CRM uses `sector_id`/`sectorFilter`. **Three
tenancy mechanisms in one codebase** — unify in F2/F3.

---

## 2. Background jobs, schedulers, integrations

**Two schedulers (both must be re-homed at cutover):**
1. In-process `node-cron` (`services/scheduler.js`, started in `index.js`, tz
   Europe/London) — **DB-driven**: reads `background_jobs WHERE is_enabled`, cron in
   the row. Only 5 jobs seeded with default crons (`db/seed.js`): `follow_up_monitor`
   (6h), `content_generator` (06:00), `industry_researcher` (Mon 05:00),
   `business_digest` (07:00), `curriculum_health_check` (Sun 20:00). The other ~20
   registry jobs only run if an admin enables a row.
2. **OS-cron on the box** (scripts in `server/db/scripts/`, only in the Lightsail
   crontab): `leadfinder-nightly.js` (03:00, per-newsroom), `triage-nightly.js`
   (02:30), `scrape-only.js` (02:00), `send_digest.js`.

**JOB_REGISTRY (25 jobs)** — notable: `newsletter_digest` (Gmail → classify →
digest, feeds home briefings) · `industry_researcher` (sector scrape →
industry_intelligence + knowledge) · `lawsuit_tracker` + the `legal_*` suite
(global tracker corpus, CourtListener) · `governance_today`/`regulation_today`/
`ai_news_today_digest` (the 3 home briefings) · `techieray_harvest` (weekly reg
scrape) · `claims_reverify` (per-newsroom, node-verifier) · `lead_miner`/
`web_prospector` (Gmail/web → contacts, DAI ops) · `embedding_backfill` (384-dim
local vectors incl. encrypted newsroom chunks).

**External integrations + env:**
- **Claude/Groq/Ollama** (`services/claude.js`, `LLM_BACKEND`; prod uses Groq
  `openai/gpt-oss-120b` for cheap triage; `ANTHROPIC_API_KEY`, model
  `claude-sonnet-4-6`).
- **Local embeddings** (`services/embeddings.js`, `@xenova/transformers`
  all-MiniLM-L6-v2, no external key).
- **Gmail/Google OAuth** (`services/gmail.js`; single account = Paul's; newsletter
  + lead mining). **Google Drive API** (`GOOGLE_API_KEY`, KnowHow bulk ingest).
- **Web scraping** (`web-scraper.js` `SECTOR_SOURCES`; legal-ingest rss/html/
  puppeteer/bluesky/mastodon/techieray).
- **CourtListener API** (`COURTLISTENER_TOKEN`, optional).
- **eTenders SA OCDS** (`ocds-api.etenders.gov.za`, no auth; LeadFinder).
- **AIKit** (`services/aikit-bridge.js`, separate `AIKIT_DATABASE_URL` pool,
  `tracker_token`→`session` cookie by email).
- **Email send** (`services/email/providers.js`: console/postmark/resend/ses).
- **Airtable** (Pulse only, `AIRTABLE_*`, feature-flagged). **GitHub**
  (`GITHUB_TOKEN`, Pulse node automation). **Nodes registry**
  (`node-catalogue.js`, `NODES_REGISTRY_FILE/_URL`). **AES-256-GCM** encryption at
  rest (`services/crypto.js`, per-newsroom HKDF from `KNOWLEDGE_ENCRYPTION_KEY`).
- **None:** image-generation, WhatsApp API (only share-text strings).

---

## 3. DB tenancy (three generations)

Tenant key = **`newsroom_id`** (`server/lib/tenancy.js`, office tenant
`00000000-0000-0000-0000-000000000001`). `resolveNewsroomId` pins user →
`req.user.newsroom_id`, admin overrides via `X-Newsroom-Id`, fails closed (403)
for non-admin with no tenant.

**Tenants = `newsrooms`** (mig 080/082): `id`, `slug`, `is_active`, **`kind`
('newsroom'|'business')**, `organisation_id` (→ CRM org for businesses). Business
tenant zero = L2B (`kind='business'`, two linked rows). **Users = `team_members`**:
`newsroom_id NOT NULL` (the tenant pin), `role`, `sector_ids[]`.
**Parallel registries needing reconciliation:** `bair.bb_tenants` (no newsroom
bridge) and `knowhow.tenants` (bridged via `newsroom_id` in mig 118, only
`product='bair'` auto-linked).

**Bucket 1 — already `newsroom_id` (survive as-is):** newsrooms, team_members,
newsroom_profile, workflows/workflow_runs, tool_outputs, uploaded_documents,
user_questions, feedback, ai_interactions(+sector), ai_conversations,
agent_conversations, recommendations, business_metrics, intake_forms/_responses,
ai_policies, visibility_checks, ai_tool_inventory, training_agendas/_materials/
_outcomes/_strategy_items, prompts (nullable=global seed), beaiready_company_sources,
bair_interactions, bair_goals, ai_controls/_governance_profile/_reviews/_incidents/
_evidence, beaiready_source_chunks, beaiready_team_analysis, beaiready_knowhow_settings,
beaiready_newsroom_nodes, beaiready_client_tools, beaiready_claim_* , leadfinder.*,
knowhow.* (via tenant_id→newsroom bridge).

**Bucket 2 — global-by-`sector_id` (DAI single-tenant → INTERNAL):** organisations,
contacts, cohorts/cohort_*, needs_assessments, assessment_questions, courses/
course_modules, document_templates, generated_documents, service_engagements/
engagement_sessions, outreach_campaigns/_messages, social_posts, funding_*,
knowledge_entries, industry_intelligence, learning_journeys/_outcomes/_tasks,
bair.audits/questions/score_weights (NULL=global default), bair_insights.

**Bucket 3 — global / no tenancy (STAY GLOBAL):** newsletter_items/_digests,
ai_lawsuits/_events, ai_regulations/_events, all `ai_legal_*`, content_sources/
_raw_items/_source_runs/monetisation_items, data_security_items, ethics_items,
tools/oss_tools, reference_items, *_today_history, background_jobs/job_runs/
node_beacons/notifications/app_settings/api_keys/gmail_tokens/password_reset_tokens,
bair.bb_tenants/bb_decisions/findings.

**Would need re-scoping IF made client-facing** (else leave INTERNAL): CRM,
fundraising, curriculum/learning, outreach/social, knowledge_entries,
industry_intelligence, newsletter_*. Audit `ai_interactions` Tier-2 "default to
office" writers for silent leaks.

Key migrations: 080/081 (multi-tenancy retrofit + the authoritative
stay-global list), 082 (`newsrooms.kind` + org link), 131 (leadfinder), 109/118/120
(knowhow ↔ newsroom bridge).

---

## 4. Newsroom product / Nodes / AIKit

**Newsroom product** (IA in `ui/sections.js`, routes in the `!IS_BEAIREADY`
block): shells `ProductShell` / `AdminArea` / `StudioShell` / `BairShell`.
Features → Builder `/builder`, Run `/run`, journalism agents `/tool/agent-*`
(blocks in `services/blocks/agents.js`), Fundraiser/Operations/Security-Audit
`/tool/tool-*`, Tracker `/lawsuits` + `/regulation-tracker`, Awareness `/awareness`,
Pulse `/admin/pulse*` + `/pulse/:token`, KnowHow `/knowhow/*`, Newsroom Profile
`/settings/newsroom-profile`, sections/functions IA. African Languages + 3
strategic layers = all `soon`, unbuilt.

**Nodes** (registry `Nodes/nodes/nodes.json`, runtime
`@developai/grounded-node-runtime` v0.14.0, product-tagged grounded/bair): Audience
Signal (analytics, hosted), Podcast Studio (podcasting, **local-only**), Election
Watch (verifier, hosted, grounded+bair; slug stays `capitalfm-verifier`), Progress
Tracker (progress, hosted), AI Ready Archive (aiready, hosted), SalesRep (hosted),
Extract PDF (bair-extract, hosted, bair), Newsroom Voice (voice, hosted, bair),
LeadFinder (in-app builtin `/leadfinder`, bair). **One registry, shared by tag,
never copied.** BE AI READY reads the same `nodes.json` via
`services/node-catalogue.js`. **Migration risks:** hardcoded
`grounded.developai.co.za` Open/download URLs in `BeAIReadyNodes.jsx` + `nodes/*`;
`tracker_token`/`JWT_SECRET` must stay identical; `node_<slug>_*` tables + DB must
not be renamed; Caddy routing reproduced under new domain.

**AIKit** — separate FastAPI ("Tool Tracker"), NOT in repo (source at
`ONMAC/aikit_bundle/aikit_source`, own `toolkitrag` DB, :8000, pm2 `aikit-server`).
Proxied `/tools/* → :8000` via Caddy + `index.js` (HTML/Location rewriting). SSO by
`services/aikit-bridge.js` (email-keyed, sets AIKit `session` cookie on tracker
login). Most portable → **retire candidate** (nothing in React hard-links `/tools`
except AIKit's own chrome); or port the proxy block + bridge verbatim.

---

## 5. Current BE AI READY surface (do NOT rebuild — "HAVE")

**Pillars** (source `pages/beaiready/pillars.js`; nav order): Knowledge, Training,
Governance, Cyber Security, Tools, Strategy (+ non-nav Visibility, Measurement).
Feature statuses honest (live/partial/building).

**Client dashboard tools** (`/dashboard/*`, requireAuth): governance suite
(policy, controls, review, legal-framework, assessment, learning), security
register, visibility scan, productivity, strategy, staff-needs, KnowHow, workspace,
coach, extraction, prompts (+my-prompts), LeadFinder.

**Admin portal** (`/admin/*`, `BeAIReadyAdminShell`, 18 pages): Overview/Today,
Client (+ClientUserPanels), MediaMap, Tools, Nodes, Tracker review, Governance
corpus, Engagement runner, Training, Strategy, Insights, Prompts, Briefings,
KnowHow, Workspace, Data, Models, Vantage.

**Public:** Home (pillar map + Today-in-AI briefings), Toolbox (list/finder/
explore/ask/for-you/suggest/category/detail), Tracker, Nodes storefront, Training
(+book), About, `/pillar/:key`, `/feature/:slug` gateway.

**Branding coupling is shallow/cosmetic** — architecture is audience-neutral. Hard-
coded business framing lives in `brand.js`, `BeAIReadyLayout.jsx`, `Login.jsx`/
`ResetPassword.jsx`, and `pillars.js` copy; chatbot invoked with `audience="business"`.
Nav renders from the `pillars.js` array (a data change, not structural). Adding a
newsroom edition = parameterise brand + provide a newsroom pillar/copy set.
