# grounded2026 docs

Durable reference brought across on 2026-06-09 from the **retired `groundedai`
monorepo** (now in `PYTHON RETIRED/`). That Next.js monorepo — with its Hub shell,
host facade, and submodule plan — is **abandoned**; this Express app (`grounded2026`)
is the going-forward platform. Only architecture-independent *value* was imported;
everything monorepo-specific was left behind. The live orientation map is
[`../CLAUDE.md`](../CLAUDE.md).

| Doc | What it is | Status |
|---|---|---|
| [AGENTS.md](AGENTS.md) | Canonical product spec — the 8 agents + 4 tools + the Tracker pillar (scopes, wording, the agent-vs-tool split). | **Authoritative** (product). Code-path notes at the bottom are historical. |
| [ROADMAP.md](ROADMAP.md) | Forward view from the retired build — jurisdiction-pack deepening table, 8 locked post-pilot deferrals, product "locked rules". | Historical build state; durable parts flagged in its header. |
| [ONBOARDING.md](ONBOARDING.md) | Pilot-newsroom onboarding flow (profile → archive → invite → builder → cost/privacy). | Durable UX; verify paths + the "11 agents" framing against this repo. |

## Reference / seed data (also brought across)

Curated, research-backed data — not code — now under [`../server/config/`](../server/config/):

- `jurisdiction-packs.yaml` — Digital Security Audit scoring packs. ZA is deep-researched with primary-source citations (POPIA / RISAA / Garante); ZW/ZM/KE/TZ/UG/GH/NG/EU/US are light packs pending deep research (see the ROADMAP table).
- `trusted_sources.default.yml` — pan-African trusted-source allowlist (Researcher).
- `topic_tags.default.yml` — pan-African topic taxonomy (Copywriter relevance signal).

These are **defaults**; the product model is "pan-African default ⊕ per-newsroom override."
