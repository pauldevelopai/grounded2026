# GROUNDED — Full System Audit

*A code-grounded report on what the system does, what it has been directed to become, and what it makes possible. Based on a deep read across all eight repositories (tracker server + client, the shared runtime, the nodes front door, and five node repos). Written 2026-06-04.*

---

## Part 1 — The thesis, in one breath

**Grounded is newsroom-owned AI, by Develop AI.** It is not one app — it's three interlocking things sharing one domain (`grounded.developai.co.za`) and one login:

1. **A public AI-and-the-law tracker for journalists** — global AI lawsuits, regulations, real use-cases, ethics resources and the sources behind them, kept current by automated scrapers + AI triage.
2. **The Nodes** — small, single-purpose AI tools a newsroom can *download and run on its own laptop* (data never leaves) **or** use hosted behind the Grounded login — from one identical codebase.
3. **A private operations brain** (the admin app) — a full CRM/curriculum/fundraising/marketing/knowledge system Develop AI runs to support newsrooms, plus the **Pulse** feedback loop that turns how newsrooms use the Nodes back into improvements.

The throughline is **ownership and trust**: newsrooms keep their data, run the tools themselves if they want, and the system is built to learn from real use rather than guess.

---

## Part 2 — Architecture at a glance

| Repo | Role |
|---|---|
| `tracker` | The hub: Express + Postgres server, React/Vite SPA. Public site + admin app + Pulse + Nodes telemetry. |
| `grounded-node-runtime` | The shared engine every Node is built on (currently **v0.14.0**). Dual-mode: laptop or hosted, same code. |
| `nodes` | The front door (`/nodes/`), the `nodes.json` registry, and the deploy tooling. |
| `node-analytics`, `node-verifier`, `node-progress`, `node-aiready`, `node-podcasting` | The five Nodes. |
| `node-template` | The clean scaffold new Nodes are copied from. |

**The box** (Lightsail Ubuntu, eu-west-2): Caddy fronts everything; the tracker runs on pm2 (`tracker-server`); each hosted Node runs as its own pm2 process (`<slug>-hosted`) on its own port; one shared Postgres holds both the tracker's tables and every Node's per-newsroom tables; AIKit (a separate FastAPI app) is proxied under `/tools`.

**The defining design move** is the **host interface**. A Node never touches a filesystem, a database, or Express directly — it only calls a `host` object (`host.db`, `host.store`, `host.ai`, `host.profile`, `host.log`, `host.feedback`). The runtime swaps what's behind that interface: JSON files + the newsroom's own AI key on a laptop; scoped Postgres + the server's key when hosted. **Write once, run both ways.** This is what makes "downloadable AND online" real rather than aspirational.

---

## Part 3 — The tracker app (what it does today)

### 3.1 The public AI-Legal tracker (journalist-facing, no login)
Served under `/legal/*` from `public.js` + the public React pages:
- **Lawsuits** and **Regulations** trackers — searchable, filterable feeds with detail pages, timelines, jurisdictions, status lifecycles, sources.
- **Use cases** — how newsrooms/organisations actually use AI.
- **Ethics** resources + an **Ethics Policy Builder** (generate or gap-analyse a newsroom AI policy via Claude).
- **Sources** — full transparency on every RSS/HTML/Bluesky/Mastodon feed being watched.
- **Explore** — a force-graph visualisation of how cases and rules connect.
- **The `/legal/dashboard`** — the one-page journalist hub: all five trackers + "why this matters to your newsroom" + search/policy CTAs.
- A **public API** (`/api/v1` with OpenAPI docs + RSS/Atom feeds) so third parties can consume the data.

Behind it, a real **ingestion pipeline**: `legal-ingest/` dispatches scrapers (RSS, static HTML, Puppeteer for JS-heavy regulator sites, Bluesky, Mastodon, CourtListener), de-duplicates raw items, and runs them through an **AI triage classifier** that sorts them into lawsuits/regulations/use-cases, extracts metadata, builds litigation timelines, checks dead links, and syncs the result into a **RAG knowledge base** (pgvector embeddings via OpenAI `text-embedding-3-small`). A generic twin (`content-ingest/`) does the same for monetisation, ethics, data-security and tools domains.

### 3.2 The newsroom toolkit (login, public chrome)
- **Builder / Run / Tools-Hub / Tool Workspace** — a drag-and-drop **workflow engine**: blocks for AI calls, Nodes, the newsroom profile, references and tools, wired on a canvas, saved and executed. This is the connective tissue that can *compose* Nodes and AI steps into newsroom-specific automations.

### 3.3 The Develop AI operations layer (admin only)
A genuinely large internal product, grouped in the sidebar under "Develop AI":
- **CRM** — contacts, organisations, cohorts, assessments, leads (with AI lead-mining + drafted outreach).
- **Curriculum & delivery** — courses, modules, learning outcomes, training materials, mentoring, learning journeys, participant portal.
- **Marketing** — campaigns, social content (AI-drafted).
- **Fundraising** — funders, opportunities, applications, reports, a Kanban pipeline.
- **AI agents** — Curriculum Builder, Lead Finder, Implementation Coach.
- **Knowledge / Intelligence / Newsletter** — the RAG base, auto-discovered industry intelligence, daily digests.
- **A 25-job background scheduler** (cron) running all the scraping, triage, embedding backfill, digests, lead mining and health checks.
- **Database editor, documents generator, settings** (sectors, team, Gmail OAuth, newsroom profile, reference data, background jobs).

### 3.4 The data + integration backbone
~**79 migrations** define the data model (AI-legal tables, CRM, curriculum, fundraising, marketing, knowledge_entries with vectors, feedback, user_questions, node_beacons, content pipelines). **Auth** is a JWT in an httpOnly `tracker_token` cookie; roles are `admin`/`member`. **Integrations:** Anthropic (`claude-sonnet-4-6` mainline, `claude-opus-4-8` for Pulse), OpenAI (embeddings), Groq + Ollama (cheap/local triage backends, switchable via `LLM_BACKEND`), Gmail OAuth, GitHub, Airtable (Pulse only), CourtListener, and the scraper stack (cheerio/puppeteer).

---

## Part 4 — The Nodes ecosystem

### 4.1 The runtime (the engine)
`grounded-node-runtime` exposes `createServer`+`createLiteHost` (laptop) and `createHostedServer`+`createPgHost` (online). The host interface every Node targets:
- `host.db` — a relational store, but the laptop version is a **deliberately tiny JSON "SQL" engine** that only understands `WHERE newsroom_id=$1`, simple inserts, and narrow deletes — **no JOINs, no UPDATE.** This forces a discipline: all joining/aggregation happens in JS, so the same code runs against Postgres or JSON files.
- `host.store` — per-newsroom key/value collections (idempotent upserts; works identically both modes).
- `host.ai` — provider-flexible chat (Anthropic default `claude-haiku-4-5`, or OpenAI), with optional web search + citations.
- `host.profile` — **a shared, cross-Node newsroom profile** (location, audience, beats, about), seeded from the tracker's Newsroom Profile. *Every Node reads it to ground its AI; some write learnings back.* This is the quiet keystone of the whole vision (more in Part 8).
- `host.log` / `host.feedback` — sanitised activity + error logs and newsroom feedback.
- Injected **chrome** (`/nodes/chrome.js`) gives every hosted Node the same nav, feedback bubble and "run it locally" footer, editable in one place.
- **Telemetry** (`telemetry.js`) can fire install/usage/feedback events to a Cloudflare→Airtable collector — *but only if `GROUNDED_TELEMETRY_URL` is set* (it currently isn't wired).

### 4.2 The front door + deploy machine
`/nodes/` renders cards from `nodes.json`. A generic Caddy rule turns `/nodes/<slug>/{mac,windows}` into the right installer for any slug with no per-node config. `deploy-node.sh <slug> <port>` clones, writes `.env` from shared secrets, installs, and starts the pm2 process. Adding a Node is a documented recipe (`ADD_A_NODE.md`), and the `/node` command now encodes the hard-won lessons.

### 4.3 The five Nodes

| Node | What it does for a newsroom | Status |
|---|---|---|
| **Audience Signal** (`analytics`) | Upload your published-stories matrix → see what the audience actually rewards: engagement **rate** by beat/format/headline-shape/time, "word signal" (which words lift engagement), sentiment, hidden-gems-vs-duds quadrants, and a headline **score predictor** for drafts. Statistically careful (Wilson intervals, Mann-Whitney). | Live, local + hosted |
| **Election Watch** (`verifier`) | Two modes: **Verify** a suspect claim against a corpus of past election misinformation; **Listen** — origin-analysis of suspect Facebook posts (where content came from, not just what it says), coordination detection, weekly briefs. Hosted enrichment via Apify/BrightData/Ad Library; logged-off public data only. | Live, local + hosted (Zambian-elections pilot) |
| **Progress Tracker** (`progress`) | A manager's accountability view of what every reporter publishes across FB/web/TikTok/WhatsApp vs targets — by **day/week/month/year** with per-reporter drill-down. Reporters self-report via a no-login submit link **or email**; performance numbers via manual entry **or pluggable connectors** (Facebook first). | Live, local + hosted |
| **AI Ready Archive** (`aiready`) | Turn an archive into AI-discoverable formats (`llms.txt`, clean markdown, JSON-LD) with **article-by-article editorial control** over what's exposed to crawlers/LLMs. The manifest *is* the product; one `isPublishable()` gate guards every output. | Live local; hosted pending keys |
| **Podcast Studio** (`podcasting`) | Train a journalist's voice (ElevenLabs) and turn a transcript into an audio podcast in that voice. | Local only (hosting needs blob storage) |

---

## Part 5 — The learning loop (how the system improves)

Five interlocking input paths, all verified in code:

1. **Pulse** — the deliberate, human-in-the-loop improvement engine. You trigger a cycle for a newsroom; it reads that Node's *actual current code from GitHub* + the newsroom's profile + prior answers, and Claude (Opus) generates 3 tailored multiple-choice questions + a tip; you vet them; the newsroom answers on a phone-friendly public page; Claude drafts a concrete change plan (flagging risks like "election-sensitive"); you approve; it generates a **Claude Code briefing prompt** you paste to ship the change; then a report-back closes the loop. Backed by four Airtable tables. **Phases 1–4 are live; 5 (prompt tuning) and 6 (flag/docs) remain.**
2. **Activity telemetry** — every hosted Node writes a sanitised `node_<slug>_activity` log (ops, counts, errors — never story content); the admin discovers these tables dynamically.
3. **Feedback** — the bubble inside every Node and on the site; admin can batch feedback into a Claude Code prompt.
4. **User Questions** — outbound multiple-choice questions you pose to logged-in users (the third bubble), tallied for profiling.
5. **Shared newsroom profile** — the context that flows between Nodes via `host.profile`.

All five surface on the **Insights** admin page, which also shows the audience-questions tallies. **Honest caveat:** this is observability + a human-driven loop, *not* automated self-improvement — and local-install telemetry isn't flowing yet because the collector URL isn't configured.

---

## Part 6 — What it has been prompted to become

This is the part code alone doesn't show: the **directorial decisions** that shaped the system.

- **"Newsroom-owned" taken literally.** Nodes must run on a laptop with the newsroom's own key, not just as hosted SaaS. That one requirement is the reason the entire dual-mode host interface exists.
- **Ship downloadable + online from one codebase.** Maintaining two versions was rejected — hence the runtime abstraction and the "same handlers, two boots" rule.
- **De-brand from "lawyers" to "journalists."** Repeatedly — the legal dashboard reframe, "Election Watch" not "Capital FM Verifier," "Audience Signal" not "MakanDay analytics." The language keeps being pulled toward the newsroom and away from the institutional/legal register.
- **Human-in-the-loop, never autonomous.** Pulse *drafts* and *proposes* but never sends or ships on its own; every question is vetted and every change approved. That's a stated philosophy, encoded in the state machine.
- **Privacy as a default, not a setting.** Sanitised activity logs; opt-in/off-by-default telemetry; the archive Node's `isPublishable()` gate; "logged-off public data only" for Facebook. The privacy-preserving path is chosen even when it's less capable.
- **One-word slugs, consistent naming.** The slug convention (`progress`, not `progress-tracker`) standardised across URL/repo/data — treating this as a long-lived platform, not a prototype.
- **Pragmatic v1s.** Manual metrics before auto-connectors; submit-link before email infrastructure; "build the connector for the token, wire the token later." Repeatedly choosing the shippable version that proves the loop, then deepening it.
- **Make the system legible.** The Insights page, this audit, the `/node` command capturing lessons — continued investment in *seeing and reproducing* the system, not just extending it.

The trajectory: from a single legal tracker → to a family of owned tools → to a platform with a feedback loop that learns which tools to improve. The direction is **a newsroom operating system that newsrooms control.**

---

## Part 7 — Honest state: solid / half-built / not wired

- **Solid & live:** the public legal tracker + ingestion, three fully-hosted Nodes, the runtime, the front door + deploy machine, Pulse phases 1–4, Insights, feedback, user-questions, the admin operations suite.
- **Half-built:** Pulse 5–6; Progress's email intake + Facebook connector (built, awaiting a real mail route + Meta token); scheduled connector sync.
- **Not yet wired:** local-install telemetry (collector URL unset → only *hosted* usage is visible); AI Ready Archive hosting (needs box keys); Podcast Studio hosting (needs blob storage); runtime version drift (Progress on v0.10.0 while the runtime is v0.14.0); the Progress live AI-parse test still unwitnessed on production.

---

## Part 8 — Speculation: what becomes possible (separate, forward-looking)

*Deliberately speculative — grounded in the primitives that already exist, but describing futures, not current behaviour.*

**1. The newsroom profile becomes a shared "newsroom brain."** `host.profile` already lets one Node's learning flow to another. Pushed further: Audience Signal learns which beats and headline shapes win → that grounds Election Watch's framing, Progress Tracker's targets, the Archive's summaries, the Podcast's tone. The newsroom teaches the platform once; every tool gets smarter. The highest-leverage thing the architecture already makes possible.

**2. Pulse closes into a genuine self-improving loop.** Today Pulse reads code + asks humans + drafts changes you ship by hand. The pieces exist to let it detect *from telemetry* which features are unused or erroring, propose the cycle itself, and — with Claude Code in the loop — open a PR you review. The leap: from "Paul triggers cycles" to "the system surfaces where each newsroom is stuck and proposes the fix." Kept human-approved, this is realistic within the current design.

**3. The workflow Builder turns Nodes into composable building blocks.** The block registry already includes Nodes, AI, profile, references and tools. Newsroom-specific automations become assemblable: *"every morning, pull Progress Tracker's output → run Audience Signal on it → draft a social post in our voice → queue it."* Nodes stop being islands — the difference between five apps and a platform.

**4. Cross-newsroom intelligence (privacy-preserving).** Because every Node logs sanitised, per-newsroom activity in a shared schema, aggregate patterns are computable without exposing any newsroom's content: "headlines framed this way lift engagement across 30 African newsrooms," "this misinformation narrative is appearing in five countries at once." Election Watch especially could become a *network* sensor — coordinated-campaign detection across the cohort.

**5. A real Node marketplace.** The `/node` command + template + generic deploy rule mean a new Node is a recipe, not a project. Plausible next step: third parties (or newsrooms) authoring Nodes against the host interface — a catalogue of owned tools, each installable in one command, each inheriting chrome, profile, feedback and the Pulse loop for free.

**6. The legal tracker becomes a live advisor, not a library.** It already has RAG + the newsroom profile. Connect them: instead of browsing lawsuits, a newsroom asks *"given what we publish and where we operate, what AI legal risk should we worry about this month?"* and gets a grounded, cited answer — a reference site turned standing legal-risk co-pilot.

**7. Inbound everywhere.** Progress Tracker's email-ingest pattern (provider-agnostic webhook + per-newsroom token) generalises to WhatsApp, Slack, SMS. The same primitive that lets reporters email their day could let any Node accept input from wherever newsrooms already work.

**The honest frame:** none of this requires re-architecting. The hard part — the host interface, the dual-mode model, the shared profile, the feedback loop, the deploy machine — is *built*. What's speculative is whether the loops get *closed* (telemetry → Pulse → ship) and whether the shared brain gets *used*. The system is currently a strong set of tools with the wiring for intelligence latent in it. The next phase is making that latent wiring carry signal.

---

*Methodology note: grounded in a direct read of the actual code across all eight repos (≈79 migrations, ≈55 server route files, 25 scheduled jobs, the full runtime, and five Nodes), not from documentation alone. Where something is built-but-not-wired, it is said so rather than describing intent as reality.*
