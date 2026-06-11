# BE AI READY — build status

> Business-facing door (beaiready.developai.co.za) into the same infrastructure that runs Grounded. Spec: `BEAIREADY_FOR_CLAUDE_CODE.txt` (Paul's Desktop). Built on branch `phase-1-ia-restructure`. **No fake data; additive; Grounded host unchanged.**

## Done + verified locally (committed a33416b)
- **Part A — tenancy.** Migration `082_beaiready_tenants.sql` (additive, reversible): `newsrooms.kind` (default `newsroom`) + `organisation_id`; a `Business` sector; **L2B seeded as tenant zero** (org `Leads 2 Business` / l2b.co.za + business tenant `slug=l2b`, idempotent). `/api/auth/me` returns `newsroom_kind`. Local L2B test login `l2b-dev@l2b.co.za` (dev pw — local DB only) verified scoped to its tenant.
- **Part B — subdomain + landing.** `pages/beaiready/{BeAIReadyHome,BeAIReadyLayout,BeAIReadyRedirect}.jsx` + CSS append. Host switch in `App.jsx` (`IS_BEAIREADY = hostname.startsWith('beaiready')`). `PublicChatbot` `audience` prop → server branches the system prompt (`claude.js`). Verified: landing renders with **real** 53/22/21 stats (tools = published-array length, not a fabricated `.total`), chatbot business voice, **Grounded host byte-for-byte unchanged**.

## ▶ BOX STEPS to open the public door (Paul — Lightsail SSH + DNS)
1. **Deploy the code** (box is on `phase-1-ia-restructure`): `cd /home/ubuntu/tracker && bash deploy.sh` (runs migration 082 → seeds L2B).
2. **DNS** (developai.co.za control panel): add `beaiready` → A record to the box IP `52.56.143.231` (or CNAME → grounded.developai.co.za).
3. **Caddy** — add a host block so the subdomain serves the same app (one app, two doors). In `/etc/caddy/sites/ailegal.co.za.caddy`, copy the `grounded.developai.co.za { … }` block and change only the hostname to `beaiready.developai.co.za` (same reverse_proxy to :3001; HTTPS auto). Then `sudo systemctl restart caddy` (NOT reload — `admin off`).
4. **Real L2B user** (not committed): create one member user, `newsroom_id` = the L2B tenant, temp password Paul hands over. Easiest: the AdminArea → Newsrooms UI once it supports business tenants (Part C), or a one-off bcrypt insert (mirror `082`'s note).
5. **Test on a phone**: `https://beaiready.developai.co.za` renders with HTTPS; `grounded.developai.co.za` unchanged; `grounded.developai.co.za/beaiready` reroutes.

## Done + verified locally (Part C — committed 17d909d)
- Migrations `083_recommendations` + `084_business_metrics` (reversible). `routes/beaiready.js` (`/api/beaiready`, requireAuth, every read scoped to the caller's own tenant): recommendations, the five metrics (latest per metric), trainings read-only over `service_engagements`+`engagement_sessions` by the tenant's org, training materials (final courses in the tenant's sector). Admin-only writes for recs + metrics.
- `pages/beaiready/BusinessDashboard.jsx` at `/dashboard`: five-metric row (em-dash until entered), three pillar cards (Governance → policy builder + live legal trackers; Visibility/Security → the audit's recommendations), upcoming/past trainings, materials, intake summary, toolbox link, BetterBoss roadmap-only.
- **Route gate**: on the beaiready host the ONLY authed surface is `/dashboard` (newsroom product/admin/studio routes aren't mounted there); Login lands business clients on `/dashboard`. Verified: honest empty states for L2B; a seeded rec + metric rendered + isolated per tenant (office sees none; admin switcher sees L2B); test data removed.

## Done + verified locally (Part D — committed ac449e3)
- Migration `085_beaiready_intake.sql`: `intake_forms` + `intake_responses` (idempotent per-tenant upsert) + registers the hourly `forms_sheet_sync` job. `services/forms-sync.js` fetches each form's published CSV (no Google keys), parses it, upserts by sha256 row-hash. `/api/beaiready/intake` + dashboard summary. Verified end-to-end via a `data:` URL (2 rows, idempotent re-run, timestamps parsed); test data removed.

## Part E — Pulse for business: DEFERRED (honest finding, not a prompt tweak)
The spec assumed Pulse was AI-generated questions where you "branch the prompt copy." The **actual** Pulse (`server/pulse/*`, `routes/pulse*.js`) is a deep **Airtable-backed, Node-install + newsroom-matching** system: it requires `AIRTABLE_API_KEY`/`AIRTABLE_BASE_ID`, generates questions about *which Node a newsroom installed*, fuzzy-matches free-text newsroom names to Airtable records, and runs a generate→plan→report cycle. A "business" tenant (L2B) installs no Nodes and isn't in that Airtable model, so branching the prompt alone would produce nonsense (asking L2B which Node they installed) — a real business-Pulse needs its **own question model + delivery**, which is a separate design, not a safe edit. Per the governing rules (no fake data, break nothing), I did **not** bolt a broken branch onto the working newsroom Pulse.
- **No breakage risk today**: businesses aren't auto-enrolled in Pulse (it's an admin/Airtable action), so nothing exposes business users to newsroom Pulse copy.
- **The business input channel is Part D** (Forms intake) — which matches the spec's own line: *"Google Forms remains fallback only."*
- **To build a real business-Pulse later**: a business question set (the 3-pillar SME questions), tenant-kind-aware generation, and delivery via the existing `/pulse/:token` page + an in-Postgres store (not the newsroom Airtable). Flagged for Paul to decide.

## Handover checklist (before emailing L2B the URL + login)
Per the spec's HANDOVER CHECKLIST. The box steps above (deploy + DNS + Caddy + real L2B user) open the door; then verify on a phone, confirm Grounded unchanged, L2B login → BusinessDashboard sees only its own data, BetterBoss "coming soon", no fake numbers.
