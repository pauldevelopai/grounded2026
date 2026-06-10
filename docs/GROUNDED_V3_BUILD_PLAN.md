<!-- Created 2026-06-09. Phased plan to evolve the live grounded2026 platform toward the
     GROUNDED V3 concept note ("DNTF V3, June 9"). Source of truth for current architecture
     is ../CLAUDE.md; product spec is AGENTS.md. This plan is additive and reversible. -->

# GROUNDED V3 — Build Plan (concept note → reality)

This maps the **GROUNDED DNTF V3** concept note onto what is **actually built** in `grounded2026` today, and sequences the work in phases: **UX / structure first**, then each feature built out **thoroughly, one at a time**.

## Governing rule — NO FAKE DATA, EVER

Non-negotiable, applies to every phase and every surface:

- **No mock, demo, lorem, seeded-placeholder, or fabricated content** in any UI or API response.
- A surface either shows **real data** (really ingested, really earned, really computed) or an **honest empty/"in development" state** that says so plainly.
- "Real reference data we loaded" (e.g. the real AI lawsuits in `ai_lawsuits`, the real jurisdiction packs in `server/config/`) is **fine** — these are real facts, not fabrications. The line is: *did this come from the real world or did we invent it to fill space?* If invented, it does not ship.
- When a feature in the concept note has no real data yet (e.g. Sector Intelligence, Open Newsroom dashboards, Observatory), we ship the **shell + empty state + the pipeline that fills it with real data**, never a screenshot-friendly fake.
- Every metric, count, or chart must trace to a real row. No "demo numbers."

---

## Where we are vs. the concept note (gap map)

Status legend: **✅ real** · **🟡 partial/shell** · **🔴 not built**

### 1. Content Production (the journalism agents + nodes)
| Concept note | Status | Notes |
|---|---|---|
| Builder canvas (drag nodes → workflows) | ✅ | `pages/builder/BuilderPage.jsx` + `services/workflows/runner.js` — React Flow, save, test-run, describe-&-build all real |
| User mode (Run from dashboard) | ✅ | `pages/builder/RunPage.jsx` |
| Verifier, Researcher, Copywriter, Digital News Gatherer, Social Media Listener | ✅ | `services/blocks/agents.js` — 5 live, real Claude-backed handlers |
| Archivist (semantic archive search) | 🟡 | Agent is "coming soon", but the **embeddings/RAG infra is real** (`services/embeddings.js`, `knowledge.js`, pgvector). Gap = wire the agent to a real per-newsroom archive index |
| Translator (EN ↔ African languages) | 🔴 | "coming soon"; needs translation pipeline + glossary |
| Audio & Video Producer | 🟡 | Agent "coming soon" in-app, but **Podcast Studio node exists** (`node-podcasting`). Gap = unify + finish |
| Hosted Nodes: Audience Signal, Election Watch, Progress Tracker, AI Ready Archive, Podcast Studio | ✅ | live in `Nodes/` + `nodes.json` |
| WhatsApp user-mode (trigger workflows over WhatsApp) | 🔴 | web only today |

### 2. Sustainability (business-of-journalism)
| Concept note | Status | Notes |
|---|---|---|
| Audience Analytics / Audience Signal | ✅ | `node-analytics` |
| Fundraiser (funder library, grant drafting) | 🟡 | Develop AI's **internal** fundraising CRM exists (`routes/funders.js`, funding-*); not yet a newsroom-facing Fundraiser node. **Risk: real funder data only — no invented funders** |
| Operations Manager | 🔴 | not built as a newsroom node |
| Future of distribution / AI-ready content | ✅🟡 | `node-aiready` (AI Ready Archive) covers crawler-control / llms.txt; "liquid news"/MCP/payment = Blue Sky |

### 3. AI Training
| Concept note | Status | Notes |
|---|---|---|
| Pulse (daily WhatsApp check-ins + dataset) | ✅ | `pulse/` — real, Airtable-backed, feature-flagged. (Currently web answer page; WhatsApp delivery = later) |
| Manuals & video courses ("largest AI newsroom training in Africa") | 🟡 | A Develop-AI-internal curriculum/courses CRM exists; **no newsroom-facing training library** yet |
| BetterBoss (clone an editor's expertise to train juniors) | 🔴 | not built (`node-salesrep` may be the seed — The Informer sales case) |

### 4. AI Governance
| Concept note | Status | Notes |
|---|---|---|
| AI legal, ethics & regulation tracker | ✅ | strongest surface in the app — `routes/lawsuits/regulations/usecases/public`, `services/legal-ingest/`, public browsing, connections graph |
| Policy builder (newsroom-specific frameworks) | 🟡 | `EthicsPolicyBuilder` exists; extend from ethics → full AI-governance framework grounded in the newsroom's actual implementations |
| Digital Security Audit (jurisdiction-scored) | 🟡 | **Jurisdiction packs now imported** (`server/config/jurisdiction-packs.yaml`); `Awareness` page exists; the **audit tool/node itself is not built in grounded2026** (it lived in the retired monorepo) |
| Activism / M20 submissions | 🔴 | not built |
| Cyber-crime node (shared attack patterns) | 🔴 | not built |

### 5. African languages
| Concept note | Status | Notes |
|---|---|---|
| LoRA adapters per language, translation pipelines, style adapters, cross-cohort language data | 🔴 | none built; depends on Translator + federated infra |

### Three strategic layers
| Concept note | Status | Notes |
|---|---|---|
| 1. Newsroom Workflow view (team map: where AI helps per role) | 🔴 | not built |
| 2. Knowledge Library & Sector Intelligence (reports, newsroom intelligence, builder intelligence) | 🟡 | internal `knowledge` base exists; the **sector-intelligence directory is not built** |
| 3. Open Newsroom (funder dashboards, process transparency, production economics) | 🔴 | internal fundraising CRM ≠ newsroom→funder dashboards |

### Foundation & cross-cutting
| Concept note | Status | Notes |
|---|---|---|
| **Per-newsroom multi-tenancy** | 🔴 **(biggest gap)** | core app is single-team (`team_members`, no `newsroom_id`); Nodes are per-newsroom isolated, the app is not |
| Federated architecture / local appliance / nightly sync | 🔴 | cloud-only; retired monorepo had an appliance protocol stub |
| Sensitivity-based model routing (sensitive→local OSS, else→best frontier) | 🟡 | `claude.js` routes by `LLM_BACKEND` env, not per-task sensitivity |
| Observatory (structured learning capture) | 🟡 | `workflow_runs` traces + `ai_interactions` log exist; **no Observatory surface/analysis** |
| Contribution/token incentives; cross-network sharing library | 🔴 | `workflows.is_shared` + git Node registry are the seeds; no cohort sharing surface or tokens |
| Africa AI in Media Index (annual report) | 🔴 | downstream of Observatory + Pulse data |

---

## The phases

Principle: **structure first, then one feature at a time, each fully real before moving on.** Each phase ends in a reviewable commit (the repo's "step → Paul confirms → next step" rule).

### Phase 1 — Information architecture & cosmetic restructure  *(UX first; little/no new backend)*

Reorganise the app around the concept note's mental model and apply one consistent GROUNDED identity. Presentational + navigational only: it wires **existing real surfaces** into the new shape and shows honest "in development" states where a section has no real feature yet. No new data, no new backend logic.

**1a. Two shells, cleanly separated.**
- **The GROUNDED product** (what a newsroom sees) — the IA below.
- **`/studio` — Develop AI back-office** (admin-role only): the existing CRM, fundraising pipeline, outreach, curriculum, mentoring, newsletter, intelligence, database editor. Same codebase, distinct shell + entry, not interleaved with the newsroom nav. (Formalises today's collapsed "Develop AI" sidebar section.)

**1b. Newsroom-product IA — CONCEPT-NOTE-LED (settled 2026-06-09).** Top-level nav *is* the concept note's five sections + three strategic layers; the Build/Run spine lives inside Content Production. Each item maps to existing real surfaces; "in development" = honest empty state, never fake data.

```
GROUNDED
  Home                     — newsroom overview (real counts only) + Run a workflow
  Content Production ▸     — Builder ✅ · Run ✅ · Verifier ✅ · Researcher ✅ · Copywriter ✅
                             · Digital News Gatherer ✅ · Social Media Listener ✅
                             · Archivist 🟡 · Translator 🔴 · Audio & Video Producer 🟡
  Sustainability ▸         — Audience Signal ✅ · Fundraiser 🟡 · Operations 🔴 · AI-Ready/distribution ✅
  AI Training ▸            — Courses/manuals library 🔴 · Pulse ✅(flagged) · BetterBoss 🔴
  AI Governance ▸          — Legal/Ethics/Regulation Tracker ✅ · Policy Builder 🟡
                             · Digital Security Audit 🟡 · Awareness ✅
  African Languages ▸      — 🔴 explainer now; real once Translator/infra land
  ──────────────────
  Knowledge & Sector       — internal knowledge base 🟡; sector-intelligence directory 🔴
  Open Newsroom            — 🔴 funder dashboards (real outputs only when built)
  Profile                  — Newsroom profile ✅
```

The federated / data-sovereignty "foundation" surfaces as an explainer (within Profile/Home) until the appliance work in Phase 4. **Node-model unification (decision 3) is implied by this IA**: the section sub-items are one directory of "functions/nodes," each marked online-or-local — not two separate systems.

**1c. Hub / front door.** A single landing presenting the 5 sections + 3 strategic layers + the foundation story, replacing the current public Builder/AI-Policies/Awareness/Training split. Public marketing pages re-home under it.

**1d. Cosmetic system.** One GROUNDED identity: wordmark, type scale, spacing, colour tokens, section iconography, shared page/empty-state components. Applied consistently across both shells.

**1e. Page-map + honest empty states.** Every existing route gets an explicit destination in the new IA (a migration table, not guesswork); each not-yet-built section ships a reusable "in development" component — clearly labelled, no fake data.

**Deliverable:** new nav + Hub + `/studio` split + cosmetic system; every current real feature reachable in the new IA; honest empty states everywhere else; zero fabricated content.

**Settled:** concept-note-led IA (above). **Open for refinement before we start:** the `/studio` path/name, the cosmetic/brand direction (current wordmark = "Grounded · Newsroom-owned AI · by Develop AI"), and exactly what the **Home** overview shows (real counts only).

**→ Execution detail: [`PHASE1_CHECKLIST.md`](PHASE1_CHECKLIST.md)** — the full route-migration table (every current route → its new home), the three-bucket model (Product / Platform-admin / Studio), shared components, the `/studio` split mechanics, and the 7-step commit sequence.

### Phase 2 — The workspace spine: unify the node model (+ decide multi-tenancy)

- **Unify "blocks" and "Nodes" into one coherent node concept.** Today Builder has in-app blocks (agents/tools) and there's a separate hosted-Nodes ecosystem. Present them as one directory ("all the AI functions"), runnable in Builder, online or local — exactly the concept note's framing.
- **Make the Decision on multi-tenancy** (see Decisions) and, if chosen, implement the `newsroom_id` foundation: a `newsrooms` table, scoping middleware, per-newsroom profile/archive/workflows. Everything downstream (real per-newsroom archive, Open Newsroom, Observatory) depends on this.
- **Deliverable**: one node directory; Builder/Run as the spine; multi-tenancy foundation (or an explicit, written decision to stay single-newsroom for the current pilot with the upgrade path documented).

### Phase 3 — Feature build-out, one at a time (each real-data-only)

Sequenced by leverage × readiness. Each is its own mini-project with a real data pipeline and an honest empty state until that data exists.

1. **Archivist** — wire the real embeddings/RAG infra to a per-newsroom archive (ingest → pgvector → cited answers). Highest leverage; infra already exists.
2. **Digital Security Audit** — build the audit node using the **already-imported** jurisdiction packs; inventory external tools, score against the newsroom's jurisdiction, real prioritised fix list.
3. **Policy builder** — extend `EthicsPolicyBuilder` into a full AI-governance framework grounded in the newsroom's real implementations.
4. **Translator + African-languages groundwork** — translation pipeline + per-newsroom glossary; begin the language-data capture loop.
5. **Audio & Video Producer** — unify the in-app agent with `node-podcasting`; finish video path.
6. **Fundraiser (newsroom-facing)** — real funder library only; grant-draft scaffolding. **No invented funders/donors.**
7. **Operations Manager** — editorial calendar / freelancer / logistics node.
8. **Strategic layers** — Newsroom Workflow team-map; Knowledge & Sector Intelligence directory (real entries only); **Open Newsroom** donor dashboards (real outputs/economics only — empty until real).
9. **Observatory** — surface structured learning from real `workflow_runs` + `ai_interactions` (which prompts catch errors, which drafts kept, where workflows abandoned).
10. **AI Training library + BetterBoss** — newsroom-facing course/manual home; editor-knowledge clone (seed from `node-salesrep`/The Informer).

### Phase 4 — Heavy infrastructure & Blue Sky *(later; large, sequenced last)*

- **Federated appliance**: per-newsroom local OSS model + nightly sync + private retrieval layer; **sensitivity-based routing** (sensitive→local, else→best frontier).
- **WhatsApp user-mode**: trigger workflows + Pulse over WhatsApp.
- **Contribution/token system** + cohort-wide sharing library (one newsroom's node/workflow/language-data → everyone).
- **Africa AI in Media Index** pipeline from Observatory + Pulse.
- **Blue Sky (Tranche 3)**: liquid news — atomise content for AI interfaces (MCP), permissioned serving + payment gateways.

---

## Decisions

**Settled (2026-06-09):**
1. **Multi-tenancy → Phase 2.** We build the `newsroom_id` foundation (a `newsrooms` table + scoping) in Phase 2, because Archivist / Open Newsroom / Observatory all depend on per-newsroom isolation.
2. **Back-office → separated, kept in app.** Develop AI's internal CRM/fundraising/outreach/curriculum/mentoring stays in the same codebase but moves behind a **clearly separate admin shell**, so GROUNDED reads cleanly as the newsroom product. (The current sidebar already has a collapsed admin-only "Develop AI" section — Phase 1 formalises that into a distinct area, e.g. `/studio`.)

**Still open (confirm during refinement):**
3. **Node-model unification.** Present in-app agents/tools and standalone Nodes as **one** "nodes/functions" directory (concept-note framing), with "online or local" as a property — not two separate systems. *(Proposed: yes.)*
4. **Model routing.** Target = sensitivity-based routing (sensitive→local OSS, else→best frontier), replacing the env-flag backend switch; the retired "Haiku-only" rule does **not** apply here. *(Proposed: adopt as the Phase-4 target; no change in Phase 1.)*

---

## What we explicitly will NOT do
- No fabricated newsrooms, funders, metrics, or sample content to make a section "look done."
- No rewrites of working surfaces (the legal tracker, Builder, Pulse, Nodes telemetry stay; we build around them).
- No pulling Phase-4 infrastructure (appliance, WhatsApp, tokens) forward ahead of the real-data features that justify it.
