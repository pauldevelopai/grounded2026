# Pulse — operating guide (for Paul)

**Pulse** is a cadenced feedback loop between newsrooms and the Grounded Nodes they
run. You trigger a cycle for a newsroom when you want; Pulse generates tailored
questions, you vet them, the newsroom answers via a link you send, and Pulse
drafts a node change you can ship with Claude Code — then a report-back closes the
loop. It lives inside the Grounded admin and is **node-agnostic** (it reads the
node's live code; nothing is hard-coded per node).

> **Status (29 May 2026):** Phases 1–3 built, committed, and deployed to the box on
> branch `pulse-system` with `PULSE_ENABLED=true`. Backend + all integrations
> (Airtable, GitHub, Anthropic) are verified live. Phases 4–6 (public answer page
> polish, prompt tuning, final flag/docs wiring) are still to come.

---

## Where it lives

- **Admin:** `grounded.developai.co.za/admin` → **Pulse** (under the GROUNDED nav
  group). Only visible to admins, and only when the feature flag is on.
- **Public answer page (per cycle):** `grounded.developai.co.za/pulse/<token>` — an
  unguessable link you send to the newsroom. No login; mobile-friendly.

## The lifecycle of a cycle

Each cycle moves through these statuses. The overview page always tells you what's
blocking and gives you the one button that unblocks it.

| Status | What it means | Your action |
|---|---|---|
| **Draft** | Questions generated, not yet vetted | Vet questions → mark vetted |
| **Vetted** | You approved the questions | Generate send copy (gives WhatsApp/email + link) |
| **Sent** | You sent the link | Wait for the newsroom |
| **Responded** | Newsroom answered | Draft plan |
| **Plan drafted** | A change plan exists | Approve or reject the plan |
| **Plan approved** | Plan approved; briefing generated | Run Claude Code on the node, then mark shipped |
| **Shipped** | Change is live | Generate report-back |
| **Reported back** | Newsroom told what changed | Done (read-only history) |
| **Cancelled** | Abandoned | — |

## How to run a cycle (step by step)

1. **Trigger.** Pulse → **Trigger new cycle**. Pick a node install (it pre-fills the
   fuzzy-matched newsroom for you to confirm) or pick a newsroom + node slug
   directly. Pulse reads the node's current code from GitHub, the newsroom's
   MediaMap record, prior Pulse answers, and the tag library, then asks Claude
   (Opus) for **3 multiple-choice questions + 1 tip**. You land on the cycle page.

2. **Vet.** Edit any question inline (wording, options, values, tag) and the tip.
   Your edits preserve the AI's original wording (kept on the record). Click
   **Approve all and mark vetted**.

3. **Send.** Click **Generate send copy**. You get the public link plus
   ready-to-paste **WhatsApp** and **email** bodies. **You send them manually** —
   Pulse never sends anything itself.

4. **Newsroom answers** on their phone via the link: 3 questions + an open
   "anything else?" box (+ optional name/role). On submit they see your tip and a
   link to their node.

5. **Draft plan.** Once responded, click **Draft plan**. Claude reads their answers
   + the node code and proposes the smallest meaningful change (or says "no change
   warranted"). It tags risks (e.g. *Election-sensitive* — Capital FM has elections
   in Aug 2026, flagged automatically).

6. **Approve.** Review the plan → **Approve** (or reject with a reason). On approve,
   Pulse generates a **Claude Code briefing prompt**.

7. **Ship.** Open the node repo in VS Code, paste the briefing prompt into Claude
   Code, review the diff, commit + push. Back in Pulse, paste the commit link and
   (optional) new version → **Mark as shipped**.

8. **Report back.** Click **Generate report** → ready-to-paste WhatsApp + email
   explaining what they told you, what changed, and what to check. Send manually.

## The newsroom view (`/admin/pulse/newsrooms/<id>`)

Click a newsroom card on the overview to see its full Pulse history: **every
open-text answer** (prominent — this is the gold), a tag-frequency view, the node
version, and a timeline of all its cycles.

## Turning Pulse on/off

Controlled by `PULSE_ENABLED` in the box's `.env` (`/home/ubuntu/tracker/.env`).
`true` shows everything; anything else hides the nav item and 404s every Pulse
route. After changing it: `pm2 restart tracker-server`.

## If something errors

- **A page won't load / "Something went wrong":** almost always a token problem.
  The Airtable and GitHub tokens live in the box `.env` (`AIRTABLE_API_KEY`,
  `GITHUB_TOKEN`). If a token is revoked/expired, reads and writes fail. See
  `server/pulse/README.md` → *Troubleshooting* for the exact one-line tests.
- **Questions don't generate:** the Anthropic key (`ANTHROPIC_API_KEY`) or the node
  repo couldn't be read. The cycle page will show the error message.

## Security note

The Airtable, GitHub, and Anthropic tokens are secrets, kept only in the box
`.env` (git-ignored). The tokens pasted during the build are in the chat
transcript — **rotate them** once Pulse is stable.

---

For the technical details (architecture, data model, endpoints, deploy, gotchas,
what's left to build), see **`server/pulse/README.md`**.
