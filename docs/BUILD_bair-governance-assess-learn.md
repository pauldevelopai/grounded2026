# BUILD — BAIR Governance: Assessment + Learning (git-driven) — rev. 2026-07-01

> **Status:** PART 0 (discovery) is **DONE** and reconciled against the live repo. This
> document has been revised from the original brief to reflect two decisions Paul made
> after discovery (see "PART 0 — outcome" below). The biggest change: **Feature A
> EXTENDS the existing `bair.audits` engine — it does NOT build parallel assessment
> tables.** Everything else is faithful to the original brief.

> **What this builds.** Two linked features in BAIR's existing Governance pillar:
> - **Feature A — Governance Assessment:** a business self-assesses whether it is "up to
>   scratch," scored across the four AIGP governance domains, producing a scorecard with
>   gaps. Anchored to the free AIGP four-domain structure now; ISO 42001 readiness is a
>   **premium layer added later**. **Implemented by extending the existing six-pillar
>   `bair.audits` engine** (the four domains model as a sub-structure of its `governance`
>   pillar), NOT as new parallel tables.
> - **Feature B — Governance Learning:** a four-unit course teaching staff the ins and
>   outs of governance, same four-domain skeleton. **New tables** (`bair.gov_learning_*`).
>
> They are **side-by-side features, lightly linked**: the assessment scorecard points
> staff to the relevant learning units; completing learning feeds back into re-assessing.
> Two doors, one house — not one fused flow.
>
> **How to use.** Hand Claude Code ONE part at a time. Open each session with:
> *"Read `docs/BUILD_bair-governance-assess-learn.md`. Do PART N only. Begin with its
> DISCOVER step, reconcile against the live repo, then act. Stop at the checkpoint and
> report — do not continue."*
>
> Order: **0 discovery (DONE) → 1 schema → 2 assessment scoring (extend engine) →
> 3 assessment UI + scorecard → 4 learning content model → 5 learning UI + progress →
> 6 the link (gaps ↔ units) → 7 ISO 42001 premium layer (later, gated).**

---

## STANDING CONTEXT (every part)

**Repo & placement.** `pauldevelopai/grounded2026` (local: `grounded2026/`). Both features
live in the **existing Governance pillar** of BAIR — two new entries in the
`governance.features` **base block** at `client/src/pages/beaiready/pillars.js:55–64`
(shape `{ name, status, dash, slug, what }`), with their own pages following the
`hub-band` pattern (see `BusinessGovernance.jsx`).

**The Governance pillar as it stands (verified 2026-07-01)** — the two new features join
these and REUSE them as assessment evidence. All are `public` schema, flat-named `ai_*`,
`newsroom_id`-scoped, served from `server/routes/beaiready.js`:
- Legal-source feed (AI lawsuits + regulations, daily) — `/tracker`.
- "Build your AI policy" (`/dashboard/governance`, slug `ai-policy`) — table `ai_policies`.
- "Controls Library" (`/dashboard/governance/controls`, slug `controls-library`) — tables
  `ai_controls` + `ai_system_controls`.
- "Roles & Review" (`/dashboard/governance/review`, slug `roles-review`) — tables
  `ai_governance_profile`, `ai_reviews`, `ai_incidents`.
- AI System Register & Risk (`/dashboard/security`, slug `ai-tools-log`) — table
  `ai_tool_inventory` (has `risk_tier`, `acceptability`, `purpose`, `owner_person`,
  `lifecycle_status`).
- Evidence trail — `ai_evidence(entity_type, entity_id, kind, url|upload_id)`, enum
  `['ai_policy','ai_control','ai_review','ai_system']`.

**The existing BAIR audit engine (Feature A extends THIS).** In the **`bair` schema**
(migration 090), currently **dormant — `bair.audits` has 0 live rows**:
- `bair.audits` — an AI-readiness audit per `organisation_id`/`sector_id`/`contact_id`,
  `status` (`intake`|`in_review`|`delivered`|`rechecked`), `readiness_score NUMERIC(5,2)`.
- `bair.findings` — typed findings per audit, `pillar` ∈
  {`visibility`,`governance`,`security`,`productivity`,`capability`,`usage`},
  `finding_type`, `severity` (1–5), `source` (`consultant`|`self_serve`|`automated`),
  `consent_scope`.
- `bair.questions` — questionnaire rows: `pillar`, `sector_id` (NULL = global),
  `options` JSONB (authored **best→worst**, index 0 = clean), `maps_to_finding`.
- `bair.score_weights` — per-pillar/finding_type weights (sector-specific beats global;
  `learned` beats `prior`).
- Scoring: `server/routes/bair-score.js` — per-pillar penalty model → `readiness_score`.
- Self-serve intake pattern: `server/routes/bair-intake.js` — answers → `bair.findings`
  (`source='self_serve'`, idempotent replace). **NB:** the existing intake is
  **token-scoped** (`participant_tokens`); Feature A adds a **logged-in `resolveTenant`**
  entry alongside it.

**Tenancy (mandatory, opposite of Justice AI).** BAIR is tenant-scoped per client
business. The guard is middleware **`resolveTenant`** (`server/middleware/resolve-tenant.js`)
→ `resolveNewsroomId(req)` → attaches **`req._newsroomId`**; mounted `requireAuth,
resolveTenant` on `/api/beaiready/*` (`server/index.js:335`). The tenant column everywhere
is **`newsroom_id`** UUID FK → `newsrooms(id)`. BAIR tenants are
`newsrooms.kind='business'` and **carry an `organisation_id`** (verified: Leads 2 Business,
Yo Yo) — this is the bridge `newsroom → organisation → bair.audit`. NEVER cross-tenant.

**Self-serve + admin attestation.** The client self-serves both the assessment and the
learning. Any authoritative sign-off is an **admin action** (`requireRole('admin')`,
`server/middleware/auth.js:17`), mirroring KnowHow promotion. For Feature A, attestation
marks the audit (`bair.audits.attested_by/attested_at`).

**Anchoring & honesty (state in the UI).**
- The assessment scores against the **four AIGP governance domains**. It is a governance
  self-assessment aligned to a recognised structure — NOT an accredited certification.
- The learning teaches those four domains **in Develop AI's own words**, using the AIGP
  structure as a skeleton — it does NOT reproduce IAPP's copyrighted materials, and
  completing it is professional development, NOT the AIGP credential.
- The **ISO 42001 premium layer (Part 7)** is a *readiness* assessment — NOT an ISO 42001
  certificate. Gated on Paul acquiring the standard + Lead Implementer knowledge; do NOT
  reproduce ISO's copyrighted clause text.

**The four domains (the shared skeleton for BOTH features):**
1. **Foundations of AI governance** — what AI is, its risks, responsible-AI principles,
   roles, org expectations, lifecycle policies.
2. **Laws, standards & frameworks** — data-privacy law applied to AI (POPIA anchor for SA),
   other laws (IP, non-discrimination, consumer, liability), AI-specific law (risk tiers,
   oversight, EU AI Act), frameworks (OECD, NIST AI RMF, ISO incl. 42001).
3. **Governing AI development** — design/build governance, data governance in
   training/testing, release/monitoring/maintenance.
4. **Governing AI deployment & use** — deploy decisions, assessing a system (incl.
   third-party/vendor risk), governing AI in production.

**House rules.** One branch per part; migrations additive + reversible, numbered above the
true current highest (**126 → next free is 127**; re-verify in each part); reuse existing
BAIR patterns; test locally before pushing; if discovery contradicts this brief, STOP and
report.

---

# PART 0 — Discovery (READ-ONLY) — **DONE (2026-07-01)**

**Outcome / decisions locked (these drove the revisions in this document):**
1. **Highest migration = 126 → Part 1 starts at 127.** Additive/reversible, `IF NOT
   EXISTS`, rollback SQL in comments, tracked by filename (`server/db/migrate.js`).
2. **Tenant guard = `resolveTenant` → `req._newsroomId`; tenant column `newsroom_id`.**
3. **Table naming: `bair.gov_*` in the `bair` schema** (Paul's call) — for the *new*
   Feature B learning tables. Feature A adds columns to existing `bair.*` tables.
4. **Feature A EXTENDS the existing `bair.audits` engine** (Paul's call) — reuse
   `bair.audits`/`bair.findings`/`bair.questions`/`bair.score_weights` + `bair-score.js`;
   the four AIGP domains model as a sub-structure of the `governance` pillar. The engine
   is dormant (0 audits) → no legacy conflict; the dashboard flow is its first real user.
5. **Learning unit catalogue is GLOBAL** (no `newsroom_id`); only progress + assessment
   data are tenant-scoped.
6. Evidence reuse = **auto-answer** governance questions from the pillar's own `ai_*`
   data (see Part 2.2) — no `evidence_ref` column needed.

**CHECKPOINT 0: PASSED.** → Part 1.

---

# PART 1 — Schema (migration 127, additive + reversible)

New migration `server/db/migrations/127_gov_assessment_learning.sql`, additive, above 126.

**Feature A — extend the existing engine (ALTERs, no new assessment tables):**
- `ALTER TABLE bair.questions  ADD COLUMN IF NOT EXISTS domain SMALLINT;` — 1–4 for
  governance questions; NULL for all existing/other-pillar questions.
- `ALTER TABLE bair.findings   ADD COLUMN IF NOT EXISTS domain SMALLINT;` — carried from
  the answered question when a governance finding is created; NULL otherwise.
- `ALTER TABLE bair.audits     ADD COLUMN IF NOT EXISTS attested_by UUID,
                               ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;` — admin
  attestation of the governance result.
- Index: `CREATE INDEX IF NOT EXISTS idx_bair_findings_domain ON bair.findings(audit_id, domain);`

**Feature B — new learning tables (in `bair` schema):**
- `bair.gov_learning_unit` — **GLOBAL catalogue** (no `newsroom_id`): `unit_no` SMALLINT
  (1–4, UNIQUE), `title`, `domain` SMALLINT, `summary`. Content itself lives in-repo
  (markdown/structured); this tracks the catalogue.
- `bair.gov_learning_progress` — per-person: `id`, `newsroom_id` UUID NOT NULL REFERENCES
  `newsrooms(id)`, `user_id` UUID (team member), `unit_no` SMALLINT, `status`
  (`not_started`|`in_progress`|`complete`), `completed_at`, UNIQUE(`newsroom_id`,`user_id`,`unit_no`).
- Index on `(newsroom_id, user_id)`.

Rollback SQL in comments (DROP the two learning tables; DROP the added columns/index).

**CHECKPOINT 1:** Migration applies cleanly + reverses; governance domain columns present
on `bair.questions`/`bair.findings`; `bair.audits` has attestation columns; learning
tables per-tenant (progress) + global (catalogue). → Part 2.

---

# PART 2 — Assessment scoring (extend the engine, AIGP four-domain)

2.1 — **Author + seed the governance questions** into `bair.questions` (a seed migration
`128_gov_assessment_seed.sql`, `ON CONFLICT DO NOTHING`, mirroring `092_bair_seed.sql`):
`pillar='governance'`, `sector_id=NULL` (global — same four domains for everyone),
`domain` 1–4, `options` authored **best→worst** (index 0 = clean), `maps_to_finding` a
domain-namespaced `finding_type` (e.g. `gov_d1_no_policy`, `gov_d2_untiered_systems`,
`gov_d3_no_controls`, `gov_d4_no_reviews`). These are ORIGINAL questions operationalising
governance practice — NOT copied from AIGP/IAPP text. Also seed matching
`bair.score_weights` rows for the new `finding_type`s.

2.2 — **Evidence auto-answer:** before showing a question, check whether the Governance
pillar already answers it, and pre-select the clean/appropriate option:
- D1 "approved AI-use policy?" → `ai_policies` row exists.
- D1 "accountable owner / escalation?" → `ai_governance_profile.accountable_owner` /
  `.incident_escalation_path`.
- D2 "systems risk-tiered (EU AI Act)?" → `ai_tool_inventory.risk_tier` populated.
- D3 "framework-backed controls, linked to systems?" → `ai_controls` (+ `ai_system_controls`).
- D4 "per-tool acceptability ruling?" → `ai_tool_inventory.acceptability`.
- D4 "review cadence + logged reviews / incident log?" → `ai_governance_profile.review_cadence`
  + `ai_reviews` / `ai_incidents`.
The client can override; evidence just removes redundancy and makes it feel connected.

2.3 — **Scoring:** on submit, resolve `newsroom → organisation → find-or-create the org's
`bair.audit``, then write governance `bair.findings` (`source='self_serve'`, carrying
`domain`), idempotent-replacing prior self_serve governance findings (per `bair-intake.js`
pattern). Compute a **per-domain** governance score by grouping governance findings by
`domain` (reuse the `bair-score.js` severity×weight philosophy) and an overall governance
readiness level. `bair-score.js` continues to roll governance into the whole-business
`readiness_score` unchanged.

2.4 — **Honest gaps:** each low-scoring domain yields a gap summary (used in Part 6 to
point at learning units).

**CHECKPOINT 2:** A logged-in tenant completes the assessment; governance findings written
against their org's audit; per-domain + overall governance scores compute; existing
governance data auto-answers where present; gaps recorded. → Part 3.

---

# PART 3 — Assessment UI + scorecard (Governance feature)

3.1 — Add a `governance.features` base-block entry (`pillars.js:55–64`):
`{ name: 'Governance Assessment', status: 'live', dash: '/dashboard/governance/assessment',
slug: 'gov-assessment', what: 'Self-assess whether your business is up to scratch on AI
governance — scored across four domains, with a clear picture of your gaps.' }`.
3.2 — Route + page `client/src/pages/beaiready/BusinessGovAssessment.jsx` under
`IS_BEAIREADY → ProtectedRoute → BeAIReadyLayout` (`App.jsx:324–332`), `hub-band` pattern,
`apiFetch('/beaiready/...')`. Question flow → **scorecard**: overall level + four domain
scores, strengths + gaps, rendered like the pillar's existing cited/structured output.
3.3 — **New logged-in endpoints** in `server/routes/beaiready.js` (alongside the existing
`/beaiready/governance/*`):
  - `GET  /beaiready/governance/assessment` → resolve/create audit; return domain-grouped
    questions + current answers/findings + evidence pre-fill.
  - `POST /beaiready/governance/assessment/answers` → write findings + recompute.
  - `GET  /beaiready/governance/assessment/scorecard` → per-domain + overall + gaps.
  - `POST /beaiready/governance/assessment/attest` → `requireRole('admin')` → set
    `bair.audits.attested_by/attested_at`.
3.4 — Honest framing in the UI: governance self-assessment aligned to a recognised
four-domain structure, not an accredited certification.

**CHECKPOINT 3:** Client can run the assessment and see a four-domain scorecard with gaps;
per-tenant (via `newsroom → org → audit`); admin can attest; honest framing present. → Part 4.

---

# PART 4 — Learning content model (four units)

4.1 — Seed the four `bair.gov_learning_unit` rows (Foundations; Laws/Standards/Frameworks
incl. POPIA; Governing Development; Governing Deployment/Use) via the Part 2 seed migration
or a sibling, `ON CONFLICT (unit_no) DO NOTHING`.
4.2 — Author unit CONTENT in Develop AI's own words (markdown/structured content in-repo,
e.g. `client/src/pages/beaiready/govLearningContent.js` or `docs/`), using the four-domain
skeleton — applied/translation-focused, NOT IAPP text. POPIA thread inside Unit 2.
4.3 — Each unit: content + a short optional check-for-understanding, structured so
completion can be tracked.

**CHECKPOINT 4:** Four units exist with original applied content; POPIA in Unit 2; nothing
reproduces IAPP material. → Part 5.

---

# PART 5 — Learning UI + progress (Governance feature)

5.1 — Add a `governance.features` entry:
`{ name: 'Governance Learning', status: 'live', dash: '/dashboard/governance/learning',
slug: 'gov-learning', what: 'A four-part course teaching your staff the ins and outs of AI
governance — foundations, the rules, building it in, and governing AI in use.' }`.
5.2 — Route + page `BusinessGovLearning.jsx`, `hub-band` pattern: the four units,
self-serve, per-person progress + completion tracked in `bair.gov_learning_progress`
(scoped by `req._newsroomId` + `req.user.id`). Endpoints in `beaiready.js`:
`GET /beaiready/governance/learning` (units + this user's progress),
`POST /beaiready/governance/learning/:unitNo/progress`.
5.3 — Honest framing: professional development in AI governance, not the AIGP credential.

**CHECKPOINT 5:** Staff can work through the four units self-serve; progress/completion
tracked per person, per tenant. → Part 6.

---

# PART 6 — The link (assessment gaps ↔ learning units)

6.1 — On the assessment scorecard, each domain gap surfaces a pointer to the matching
learning unit ("Weak on governing deployment? → Unit 4"). The mapping is domain-number →
`unit_no` (both keyed 1–4). Light link, not a forced flow.
6.2 — Optionally, on unit completion, prompt a re-assessment of that domain — closing the
assess → learn → improve → re-assess loop (re-running the assessment writes fresh
`source='self_serve'` findings, idempotent).
6.3 — Keep them as two features that talk to each other — not merged into one flow.

**CHECKPOINT 6:** Scorecard gaps link to the right units; optional re-assess prompt after
learning; two connected-but-distinct features. → Part 7 (later).

---

# PART 7 — ISO 42001 readiness (PREMIUM LAYER — gated, build later)

> Do NOT build until Paul has the ISO 42001 standard + Lead Implementer knowledge. Gated
> on acquiring the (paid, copyrighted) standard; must NOT reproduce ISO clause text.

7.1 — Add an ISO 42001 **readiness** mode to the Governance Assessment: a deeper set of
`bair.questions` (governance pillar, flagged as the premium tier — e.g. a `tier` marker or
a distinct `domain`/`finding_type` namespace) operationalising ISO 42001's management-
system requirements (Clauses 4–10 + Annex A control areas), phrased in Develop AI's own
words, assessing readiness for a real ISO 42001 audit.
7.2 — Positioned as the **premium tier** above the free AIGP-domain assessment (free →
premium ladder).
7.3 — Honest framing (critical): "ISO 42001 Readiness Assessment" — how ready you are +
your gaps. NOT an ISO 42001 certificate; only an accredited body issues that.
7.4 — Attestation carries more weight once Paul holds the ISO 42001 Lead Implementer
credential.

**CHECKPOINT 7:** ISO 42001 readiness mode assesses against the standard's requirements in
original wording; positioned as premium; honestly framed as readiness not certification. → Done.

---

## GROUND RULES (whole brief)
1. Order 0→7; each checkpoint gates the next. Part 7 is gated on the ISO 42001 knowledge
   and built last.
2. **Per-tenant isolation is mandatory** (opposite of Justice AI): assessment results
   (via `newsroom → org → bair.audit`) + learning progress belong to one business; never
   cross-tenant; use `resolveTenant`/`req._newsroomId` on every logged-in read/write.
3. **Reuse, don't duplicate.** Feature A EXTENDS `bair.audits`/`findings`/`questions`/
   `score_weights` + `bair-score.js`; the assessment READS the existing `ai_*` governance
   data as evidence (auto-answer). New tables only for Feature B learning.
4. **Anchoring:** both features on the free AIGP four-domain structure now; ISO 42001 as
   the premium layer later.
5. **Honesty everywhere:** self-assessment aligned to a recognised structure (not
   accredited certification); learning is professional development (not the AIGP
   credential); ISO layer is readiness (not an ISO certificate). Original wording only —
   never reproduce AIGP or ISO copyrighted text.
6. **Self-serve + admin attestation** — client does the work; admin holds any
   authoritative stamp (`bair.audits.attested_by/attested_at`).
7. Migrations additive, reversible, above the true current highest (126 → 127); one branch
   per part.
