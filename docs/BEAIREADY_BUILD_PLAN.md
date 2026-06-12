# BE AI READY — infrastructure build plan

> The six-pillar product is now **reflected** on the site (`pillars.js`), each sub-feature flagged Live / In&nbsp;progress / In&nbsp;development. This doc is the honest map of **what actually has to be built** behind it — reuse-first, per the governing rules (additive, no fake data).
> **Note for Paul:** you said "five pillars" but listed **six** — built all six; tell me if two should merge (e.g. Data Security under Governance, or Strategy folded in).

## Legend
🟢 **Live** = real today · 🟡 **Partial** = exists but limited / data-entry only · 🔴 **Build** = genuinely new.

## The map — per pillar × sub-feature

### 1. Visibility
| Sub-feature | Now | Reuse | New build | Effort |
|---|---|---|---|---|
| How AI sees your business | 🔴 | Claude SDK, the job scheduler, per-tenant storage pattern | A **visibility-scan engine**: query the major assistants ("who leads in <sector/city>?", "what do you know about <business>?"), capture answers, score presence/accuracy/sentiment, store per-tenant over time, dashboard trend. **Needs OpenAI + Google API keys** (today only Anthropic + Groq). | **L** |
| Your data, structured for AI | 🔴 | `node-aiready` already turns an archive into AI-discoverable formats (markdown / schema / llms.txt) | A business-oriented version of that, or keep it consultant-delivered in v1 | M |

### 2. Governance — *closest to done*
| Sub-feature | Now | Reuse | New build | Effort |
|---|---|---|---|---|
| Legal, Ethics & Regulation tracker | 🟢 | The whole live tracker (`ai_lawsuits`/`ai_regulations`, public pages) | nothing — done | — |
| Build your AI policy | 🟡 | `EthicsPolicyBuilder` (`/legal/ethics-builder`) exists | Re-frame newsroom→business + **save output per tenant** into the dashboard | S–M |

### 3. Data Security — *best new-build bet (high value, mostly reuse)*
| Sub-feature | Now | Reuse | New build | Effort |
|---|---|---|---|---|
| Log your company's AI tools | 🔴 | `ai_legal_tools` (the assessed-tools DB with strengths/limits/data-safety), the per-tenant pattern, the dashboard input pattern | A **per-tenant AI-tool inventory**: table + a client UI to log each tool (who uses it, what data) + auto-match to the assessed-tools DB | M |
| What's acceptable, what isn't | 🔴 | toolbox data-safety scores + their policy | An **acceptability ruling** per logged tool + a prioritised fix list, surfaced in the dashboard | M |

### 4. Productivity
| Sub-feature | Now | Reuse | New build | Effort |
|---|---|---|---|---|
| AI Toolbox | 🟢 | `/toolbox` + `/api/public/tools` | (optional) map tools to the client's functions | — |
| Track employee productivity | 🟡 | `business_metrics` table + dashboard (entered-only) | A **client input UI** for the five measures + baselines/targets (manual/aggregate by design — "no surveillance") | S |
| BetterBoss | 🔴 | **`node-salesrep` is literally this** — it captures a senior person's playbook and coaches juniors | Generalise that pattern from ad-sales to any manager/role | M–L |

### 5. Training
| Sub-feature | Now | Reuse | New build | Effort |
|---|---|---|---|---|
| One-day team training | 🟢 | the service + the `/training` offer page | nothing — done | — |
| Course materials past & upcoming | 🟡 | `service_engagements`+`engagement_sessions`+`courses` and the dashboard trainings view | scope materials to the client + link content | S–M |
| Staff AI-competency | 🟡 | the **Forms intake (Part D)** already syncs form CSVs per tenant | a competency **summary/score** over the intake responses + a structured competency form | S–M |

### 6. Your AI Strategy — *most open-ended; consultant-led in v1*
| Sub-feature | Now | Reuse | New build | Effort |
|---|---|---|---|---|
| Goals & workflow map | 🔴 | Claude for analysis; the `recommendations` per-tenant pattern as the storage shape | A **business-process capture** (consultant-entered in v1) stored as a dashboard artifact | M (v1) |
| Automation opportunities, prioritised | 🔴 | same | An **automation-opportunity analysis** over that map — sized by effort/payoff | M |

## Cross-cutting infrastructure these need
1. **A client-side INPUT layer.** Today the dashboard is read-only for clients (admin writes the findings). Data Security (log tools), Productivity (enter metrics) and Training (competency) need the **client** to enter data → a small set of authed client forms.
2. **Per-tenant tables** to add: `ai_tool_inventory`, `visibility_scans`, `competency_responses`/scoring, `strategy_map`. (`recommendations` + `business_metrics` already exist.)
3. **Multi-model keys** (OpenAI + Google) — only for the Visibility scan.
4. **An admin/consultant entry surface** to record each pillar's audit findings per tenant (extends the existing recommendations admin).

## Proposed build order (value × readiness)
1. **Finish the reuse wins** (days, not weeks): Governance fully wired (tracker live + policy-builder business-framed + saved per tenant); Productivity toolbox (live) + client metric entry. → the dashboard stops being empty.
2. **Data Security tool** — the AI-tool inventory + acceptability. Genuinely useful, clients *log in and use it*, mostly reuses the toolbox data. Strong, buildable differentiator.
3. **Training surfacing** — materials + competency-from-forms (Part D already feeds it).
4. **Visibility scan** — the headline selling point but the heaviest new infra (needs OpenAI/Google keys + a scoring engine). Do after the quick wins, unless it's THE thing to lead with.
5. **BetterBoss** (generalise `node-salesrep`) + **Strategy** (consultant artifact, then tooling) — last.

## Open questions for Paul (these shape the build)
1. **Five or six pillars?** (you said five, listed six).
2. **Visibility scan** — which assistants to query (cost), how often, and what does "appearing as the answer" mean concretely enough to score?
3. **Data Security** — should clients self-log tools, or does the consultant enter them from the audit? (changes whether we build a client form now)
4. **BetterBoss** — reuse `node-salesrep` directly, or build fresh for business roles?
5. **Strategy** — tool-assisted or purely consultant-delivered in v1?
6. **Which pillar do you want to lead the build with?** (my rec: Governance to "fill" the dashboard fast, then Data Security as the flagship new tool.)
