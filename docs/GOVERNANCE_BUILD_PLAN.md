# AI Governance — build plan (one integrated program)

> Turns the **AI Governance Delivery Manual** (Develop AI internal methodology v1, June 2026)
> into the in-product Governance pillar of BE AI READY — **and** the continuously-updated
> **AI-governance knowledge engine** that grounds it. The manual is tool-agnostic by design;
> this plan makes **BAIR the tool** (Part 6 Option A — "productise the organisational layer").
>
> **This is ONE build, not two.** Document/governance ingestion is **woven through every phase**,
> not a separate Phase 0 prelude. Each phase: **Ingest** the governance material it needs →
> **Build** its operational piece → **Ground & cite** its AI outputs from that corpus. The shared
> ingestion capability is bootstrapped in Phase 1 and deepened every phase after.
>
> **Governing rules (unchanged):** additive + reversible migrations (ROLLBACK comment on each);
> every read scoped to the caller's tenant (`newsroom_id`); admin-only cross-client writes;
> **no fake data — honest empty states only**; Grounded newsroom host byte-for-byte unchanged;
> reuse over rebuild. Next free migration number: **122** (verified against code 2026-06-29).
>
> **Two rules specific to the knowledge engine:**
> - **Never fabricate a citation.** When the corpus has relevant material, ground the output and show
>   the `knowledgeIds` as sources. When it doesn't, still produce the output but **flag it "based on
>   general principles — not yet backed by a cited source; verify"** — never invent a citation, never
>   refuse to help. (The rule is *no fake sources*, not *no answer without a source*.)
> - **Not legal advice.** Every AI-generated governance artifact (policy, risk ruling, control
>   suggestion) carries a standing *"generated guidance, not legal advice — verify with counsel"*
>   line. The manual stresses this repeatedly; it is real liability, and it reads as more credible, not less.

---

## What already exists (reuse, don't rebuild)

**The operational/assessment machinery:**

| Manual phase/component | Existing machinery | Status |
|---|---|---|
| Phase 0/5 — engagement container | `bair.audits` (090): lifecycle `intake→in_review→delivered→rechecked`, `is_baseline`, `readiness_score`. `/api/bair/audits` | reuse |
| Phase 3 — gap analysis | `bair.findings` (typed: `pillar`, `finding_type`, `severity`, `consent_scope`, `data_class`) + `bair-score.js` + `bair.score_weights` | reuse + **link to systems/controls** |
| Phase 4 — to-do list | `recommendations` (083): per-pillar, priority, status | upgrade → Controls Library |
| Phase 1 / Component 1 | `ai_tool_inventory` (088) + `BusinessSecurity.jsx` | extend → full Register (Phase 1) |
| Component 4 — AI Policy | `ai_policies` (086) + `BusinessGovernance.jsx` | **rebuild** generic → derived+grounded (Phase 4) |
| Phase 5 — measure + cross-client | `business_metrics`, `bair_goals` (119), `bair_insights` + `corpus_findings` view (k-anonymity) | reuse |
| Part 5 — runtime enforcement | — | correctly absent at SME scale |

**The knowledge-engine machinery (the big accelerant):**

| Capability | Existing machinery |
|---|---|
| Pluggable ingestion | `ai_legal_sources` (`rss|html|api_json|puppeteer|…`, per-source cadence, LLM triage) + `ai_legal_raw_items` (dedup `UNIQUE(source_id, external_id)`) |
| Scheduler + curation gate | `background_jobs`/`scheduler.js` (node-cron) + the `auto_added → review_status='kept'` review queue (`tracker-review`) |
| RAG store | `knowledge_entries` with local `vector(384)` (all-MiniLM-L6-v2, **zero API cost**), HNSW cosine + full-text GIN |
| Retrieval (firewalled) | `getRelevantKnowledge` (60% vector + 20% text + quality) with the `private`/`global`/`pattern` visibility firewall |
| Grounding hook + citations | `buildEnrichedSystemPrompt` / `callClaudeWithKnowledge` — enrich any function, **returns `knowledgeIds`** (citations already trackable) |
| AI plumbing | `callClaude` (`claude-sonnet-4-6`) + `lib/models.js` per-function provider/model config |
| Evidence | `uploaded_documents` pipeline + `entity_type` convention + `extractText` (PDF/HTML) |

**Four load-bearing facts that shape everything below (verified against code 2026-06-29):**
1. **Connective tissue is the real gap.** Findings attach to an *audit*, not to specific AI systems.
   The spine of the build is the LINK chain **finding → register system → control → recommendation →
   score**, so a gap traces to a system, is closed by adopting a control, and the score reflects it.
2. **Tenant-keying mismatch — resolve, don't ignore.** `bair.audits`/`bair.findings` are keyed by
   **`organisation_id`** (no `newsroom_id`); the register/controls/policy are keyed by **`newsroom_id`**.
   The link chain must resolve `newsrooms.organisation_id` to cross the two, guard that a control's
   newsroom-org matches the finding's audit-org (tenant isolation), and recompute score **per-audit**.
   Business tenants are effectively 1 org : 1 newsroom (admin/clients creates them together) — but the
   code must not assume it; resolve explicitly.
3. **"Any org" is already solved by the visibility firewall.** The governance corpus ingests with
   `organisationId: null` → `createKnowledgeEntry` defaults `visibility='global'` (one shared, current
   body of understanding for every tenant); each org's register/context stays `private`. The engine
   reasons over *global governance knowledge* + *this org's private context* together. No new isolation work.
4. **Distinctions to never conflate:** `acceptability` (is this tool safe to put our data in?) ≠
   `risk_tier` (EU AI Act: how much harm if it fails?). Scoring pillars
   (`visibility/governance/security/productivity/capability/usage`) ≠ client pillars
   (`knowledge/training/governance/tools/strategy/measurement`) — `recommendations` already bridges
   both; governance findings use `pillar IN ('governance','security')` and roll up into the client
   "Governance" pillar.

---

## The continuous spine: Ingestion & Grounding (built incrementally, used by every phase)

Not a phase — a capability that grows through the build. Four source channels (all selected):

- **Automated feeds + scrapers** — seed `ai_legal_sources` with regulator/standards feeds (reuse the
  TechieRay Puppeteer + RSS patterns).
- **Allow-listed web search + fetch** — daily query against a curated governance allow-list, fetch +
  extract full documents (reuse the AI-news credibility guard: allow-list → silence, never open-web).
- **Admin-uploaded documents** — curators drop in framework PDFs/reports; chunk + embed (reuse the
  uploads pipeline + `extractText`).
- **Expand the existing tracker** — widen TechieRay/CourtListener/newsletters with governance sources.

What the spine adds to the existing plumbing, deepened each phase:
- **A new chunking consumer (not pure reuse).** The existing pipeline promotes raw items →
  lawsuits/regulations tables (one-row sync). Governance docs need a **new** path: source/upload →
  `extractText` → **chunk → one `createKnowledgeEntry` per chunk**. The ingestion *framework* (sources,
  scheduler, triage, curation gate) is reused; the promotion *target* is new.
- **Chunk size is bounded by the embedding model.** all-MiniLM-L6-v2 only encodes the **first ~256
  tokens** (`MAX_CHARS=4000` is just an input cap — anything past ~200 words is silently dropped from
  the vector; this is also a latent bug in today's long-content sync). So chunk to **~150–220 words
  (≤256 tokens) with light overlap**, one row each. Migration 123 adds `parent_document_id` +
  `chunk_index` so chunks group back to their source document; `source_description` carries the source URL.
- **Governance taxonomy + the category that retrieval actually uses.** Retrieval (`getRelevantKnowledge`)
  filters by **`category`**, not `source_type` — so ingest must set **`category='ai_governance'`** (and
  `source_type='ai_governance'`, `organisationId: null` → global). Tag each chunk by **framework**
  (NIST function / ISO 42001 Annex A / EU AI Act article + risk tier), **jurisdiction**, topic
  (via `knowledge_tags` + small `framework`/`jurisdiction` columns for fast filtering).
- **Grounding + citations via data, not code.** Register each governance function
  (`governance_risk_classify`, `governance_controls_suggest`, `governance_policy`, `governance_finding`)
  as a **`prompt_templates` row** (`knowledge_query = {categories:['ai_governance'], max_entries}`) —
  additive, no edit to the hardcoded `categoryMap`. `callClaudeWithKnowledge` returns `knowledgeIds`;
  **surface them as visible sources**. If nothing is retrieved, produce the output but flag it unverified
  (per the governing rule) — never fabricate a citation.
- **Curation gate** — reuse `auto_added`/review so a human vets governance material before it grounds
  client-facing outputs or is marked verified/high-confidence.

Bootstrapped in **Phase 1** (chunking + admin-upload + first governance sources + the EU AI Act),
extended in each later phase with the material that phase needs.

---

## Phase 1 — Ingestion spine + AI System Register + risk tiering
*Manual Phase 1+2 / Components 1+2. The first integrated slice: stand up the corpus AND the register, and make risk tiers cite the EU AI Act.*

- **Ingest:** build the chunking consumer (≤256-token chunks); add the admin-upload + first 2–3 automated
  governance sources; ingest the **EU AI Act** + a starter framework set, `category='ai_governance'`,
  tagged by article + risk tier. Reuse the curation gate.
- **Discovery reuse (manual Phase 1.1–1.6):** the register is *populated*, not just typed. Reuse the
  existing **`intake_forms`/`intake_responses`** survey system as the staff "what AI do you use" discovery
  that surfaces shadow AI, and let admins seed register rows from those responses — don't build a new survey.
- **Build — Migration 122** (extend `ai_tool_inventory`, all nullable): `purpose`, `owner_person`,
  `paid_free`, `status`, `risk_tier` (unacceptable|high|limited|minimal|unclassified), `risk_rationale`,
  `last_reviewed`. **Migration 123** — corpus support: `knowledge_entries.parent_document_id` +
  `chunk_index` + `framework`/`jurisdiction` columns; register the governance ingest job(s) in
  `background_jobs`; seed governance sources into `ai_legal_sources`; seed the `prompt_templates` rows
  for the governance functions (`categories:['ai_governance']`).
- **Ground & cite:** new `POST /governance/inventory/:id/classify` — `callClaudeWithKnowledge`
  (`functionName:'governance_risk_classify'`) suggests a `risk_tier` + rationale grounded in the ingested
  EU AI Act material, **citing the articles used** (or flagged unverified if the corpus lacks coverage);
  human confirms (never auto-applied). An **`unacceptable`** result is not a passive row — it raises a
  prominent stop/alert and auto-creates a `bair.findings` row (the manual: unacceptable AI gets *stopped*).
- **Client:** upgrade `BusinessSecurity.jsx` → **"AI System Register & Risk"** — new fields, risk-tier
  badge + classify action (citations shown, disclaimer line), filter-by-risk view. `pillars.js`: promote register.
- **Verify:** classify a system → tier + rationale + EU-AI-Act citations persisted; corpus-thin case →
  unverified flag (no fake citation); unacceptable → stop + finding; filter returns only high; ingested
  chunks retrievable + embedded (≤256-token); tenant isolation holds; honest empty states.

## Phase 2 — Controls Library (seeded + grounded from frameworks)
*Manual Component 3 / Phase 4. Turns the flat list into a governance system; closes findings.*

- **Ingest:** ingest **NIST AI RMF** subcategories + **ISO/IEC 42001 Annex A** control catalogs into the
  corpus, tagged to control concepts + risk tiers.
- **Build — Migration 124** — `ai_controls` (newsroom_id, title, description, applies_to_tier,
  owner_person, status, **`framework_ref`** for provenance, **`closes_finding_id` → `bair.findings(id)`**,
  cross-schema FK is valid) + `ai_system_controls` join (control ↔ system, many-to-many). Adopting a
  control marks its finding closed and triggers a `bair-score` recompute — the **finding → system →
  control → score** chain.
- **Resolve the keying mismatch (fact 2).** A control is newsroom-keyed; a finding is org/audit-keyed.
  When linking, resolve `newsrooms.organisation_id` and **guard** that the finding's `audit.organisation_id`
  equals the control's newsroom-org (reject cross-tenant links). Score recompute runs **per-audit** for
  that org's current audit (resolve newsroom → org → latest audit; if none, surface "no audit yet" rather
  than failing).
- **Ground & cite:** `POST /governance/controls/suggest` — grounded in ingested frameworks, proposes
  controls for a given high-risk system, each **citing its framework origin**. The manual's six starter
  controls ship as a framework-cited reference template the client *adopts by choice* (no auto-seed).
- **Client:** new `BusinessControls.jsx` `/dashboard/governance/controls`; from a register row, see + link
  + suggest controls. `pillars.js`: add "Controls library".
- **Verify:** suggest → adopt a control on a high-risk system → linked both sides + finding closed + score
  moves; suggestions carry citations; isolation.

## Phase 3 — Roles, Review Routine & Incidents
*Manual Components 5+7 / Phase 5. The named owner + the heartbeat that stops the register going stale.*

- **Ingest:** light — incident-response + review-cadence good practice (so review agendas/escalation
  suggestions are grounded).
- **Build — Migration 125** — `ai_governance_profile` (one row/tenant: accountable_owner, owner_role,
  review_cadence default quarterly, next_review_date, incident_escalation_path) + `ai_reviews` (date,
  attendees, what_checked, actions) + `ai_incidents` (occurred_at, what_happened, who_told, action_taken,
  status). Empty at first by design — existence is part of the system.
- **Ground & cite:** review-agenda + escalation-path suggestions grounded + cited.
- **Client:** new `BusinessReview.jsx` `/dashboard/governance/review`; due-for-review flag from
  `next_review_date`. `pillars.js`: add "Roles & review".
- **Verify:** set owner + cadence, log a review + incident; due-for-review flips on a past date.

## Phase 4 — AI Policy, derived + grounded + cited
*Manual Component 4 / Phase 4.1. **Depends on Phases 1–3.** Replaces the generic builder.*

- **Ingest:** ensure current law/framework material for the tenant's jurisdiction(s) is in the corpus
  (POPIA, EU AI Act, sector guidance).
- **Build (no new migration):** rewrite `/policy/generate` to assemble from the tenant's **real
  operational layer** — register systems + risk tiers (P1), adopted controls (P2), accountable owner +
  cadence + incident path (P3) — **and** ground in the ingested current-law corpus via
  `callClaudeWithKnowledge`. Rules populated from real rows; brief drops to optional sector colour.
- **Ground & cite:** the generated policy **cites the frameworks/laws it rests on**. This is what makes
  it non-generic (the original complaint): grounded in current frameworks, not a 4-field brief.
- **Enforce the method (no fake data):** empty register / no controls → honest state ("build your
  register and adopt controls first; your policy is generated from them"), not boilerplate.
- **Client:** keep the review/edit/own/save flow; replace the brief form with "generate from your
  governance data + current frameworks" + a preview of what it drew on (N systems, M controls, K sources).
- **Verify:** populated tenant → policy names real systems/tiers/controls + cites frameworks; empty → honest state.

## Phase 5 — Evidence Trail
*Manual Component 6. The "show us how you control your AI" folder.*

- **Build — Migration 126** — `ai_evidence` (entity_type ai_policy|ai_control|ai_review|ai_system,
  entity_id, kind upload|link, upload_id → `uploaded_documents` OR url, label). Mirrors the
  `entity_type='training_agenda'` pattern; reuse the uploads pipeline + external links.
- **Client:** an "Evidence" affordance on policy/control/review rows (upload a file or paste a link).
- **Verify:** attach a PDF + a link to a control, download 200, list scoped to tenant.

## Phase 6 — Close the loop: findings grounding, monitoring & engagement runner
*Manual Phase 3/5 + Part 7. Makes the whole engine self-sustaining and current.*

- **Ground findings:** wire `bair.findings` writing to the corpus — a finding cites the standard it
  violates; governance findings set `consent_scope='anonymised_corpus_ok'` to feed the cross-client
  insight engine (free, via the existing firewall).
- **Monitoring = the continuous ingest:** the daily governance ingest + tracker IS the manual's
  "monitoring" phase — new rules/reports surface, re-trigger review flags. Deepen all four source channels.
- **Engagement runner (admin):** surface the manual's phases (Scope→Discovery→Classify→Gap→Controls→
  Monitor) as a per-client progress flow over `bair.audits` — the delivery manual *becomes* the workflow.
- **Client-facing L2B proposal** (Part 7's other open decision) — plain-language, no-jargon.

---

## Cross-cutting checklist (every phase)
- **Ingest · Build · Ground & cite** — each phase ingests its material, builds its piece, and grounds
  its AI outputs from the corpus with visible citations.
- Migration additive + ROLLBACK comment; bump from 122 in order.
- Every query filtered by `newsroom_id`; admin cross-client writes via `X-Newsroom-Id`.
- **No fake data, applied to reasoning:** honest empty states; no seeded tenant rows; **never fabricate
  a citation** — ground + cite when the corpus has material, otherwise flag the output unverified.
- **Disclaimer** on every AI-generated governance artifact: "generated guidance, not legal advice —
  verify with counsel."
- **Keying:** resolve `newsrooms.organisation_id` whenever the client layer (newsroom) meets the
  assessment layer (org/audit); guard against cross-tenant links.
- Reuse `ai_legal_sources`/`raw_items` (ingest), `knowledge_entries`+`getRelevantKnowledge` (RAG),
  `callClaudeWithKnowledge` (ground+cite), the uploads pipeline (evidence), `bair.*` (scoring).
- Grounded newsroom host untouched; new surfaces under the beaiready `/dashboard/governance/*` gate.
- Deploy = `bash deploy.sh` on the box (migration + bundle rebuild).

## Sequencing
1 (ingestion spine + register/risk) → 2 (controls) → 3 (roles/review) → 4 (policy, needs 1–3) →
5 (evidence) → 6 (loop/monitor/runner). The ingestion spine starts in Phase 1 and is extended in every
phase with the material that phase grounds against. Each phase is independently shippable and leaves the
product in a working, honest, cited state.
