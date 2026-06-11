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

## Remaining (local code — can build next)
- **Part C** — `BusinessDashboard.jsx` at `/dashboard` (kind=business): 3 pillar cards, trainings read-only over `service_engagements`+`engagement_sessions` (by org), training materials scoped, toolbox link. Migrations `083_recommendations` + `084_business_metrics`. Em-dash where no data. **Plus the kind-based route gate** (business users → /dashboard, never the newsroom UI).
- **Part D** — `intake_forms` + `intake_responses` + `forms_sheet_sync` hourly job (CSV → upsert by row-hash).
- **Part E** — extend Pulse to `kind=business` tenants (branch newsroom-specific prompt copy).
- **Handover checklist** — see the spec's HANDOVER CHECKLIST before Paul emails L2B the URL + login.
