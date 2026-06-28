# Run BE AI READY locally to test (before deploying)

A fast loop to click through the whole BE AI READY experience on your machine, against
the local Postgres, before pushing to the box.

## One command

```bash
bash test-local.sh
```

It applies migrations, seeds local test logins + sample data, prints how to get in,
then starts the server (`:3001`) and client (`:5173`). `Ctrl-C` stops both.

> Needs: local Postgres running (the same DB the app already uses) and
> `ANTHROPIC_API_KEY` set in `.env` (it already is) so the AI features — the Team AI
> workspace, briefings, insight derivation — actually answer. Embeddings are local
> (no key needed).

## Get in

Open the **client door**:

- **http://beaiready.localhost:5173** — loads straight into BE AI READY mode.
- If that host won't resolve, use **http://localhost:5173**, then run once in the
  browser console: `sessionStorage.beaiready='1'; location.reload()`.

## Test logins (local only)

| Who | Email | Password | Lands on |
|-----|-------|----------|----------|
| Consultant (admin) | `admin@local` | `localtest123` | the admin console |
| Client teammate | `member@local` | `localtest123` | the client dashboard |

Company **access code** `joinus` lets you test self-registration into the seeded
client (Leads 2 Business).

## What to try

- **Client teammate** → **Team AI workspace** (under Tools): ask a question — it's
  grounded in the seeded company note, and every Q&A is pooled. **Pin** a good answer.
- **Consultant** → **Workspace** (admin nav): see the client's pinned answers and
  **promote** one into their durable knowledge (members can't — only you).
- **Consultant** → **Insight**: **Derive patterns** (two seeded clients consent), then
  **Publish** one → it appears on the client dashboard as "what works for businesses
  like yours".
- **Consultant** → **KnowHow**: **link a client**, add a person/topic/answer, then
  **Add to company knowledge** → that answer now feeds the client's AI.
- **Self-registration**: sign out → Create account → pick the client → access code
  `joinus`.

## Encryption at rest (client knowledge)

The company's captured knowledge (`beaiready_company_sources` — your uploaded docs,
notes, scraped sites, and promoted KnowHow answers) is **encrypted at rest** with
AES‑256‑GCM, using a per‑client key derived from one master key. It's only decrypted in
memory when the AI reads it.

- Set the master key in `.env`:
  ```
  KNOWLEDGE_ENCRYPTION_KEY=<32 bytes, base64>
  ```
  generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  `test-local.sh` does not need it; if it's unset, encryption is simply **off**
  (plaintext, nothing breaks).
- **On the box:** add the same line to `/home/ubuntu/tracker/.env`. ⚠️ **Keep it safe —
  if the key is lost, encrypted knowledge can't be decrypted.** Setting a key later only
  encrypts *new* writes; existing plaintext keeps working.

## Login not working in the browser?

The login code/API is fine — this is almost always a **stale local dev server** or a
**stale browser cache**, not your credentials:

1. Re-run `bash test-local.sh` (it now kills any old `:3001`/`:5173` server first and
   starts fresh).
2. **Hard-refresh** the page (⌘⇧R) or open it in a private window — the long-running
   vite server can leave an old JS bundle cached in the browser.
3. Confirm you're using a seeded login (`admin@local` / `member@local`, `localtest123`)
   — your real production account's password isn't in the local database.

## Manual (if you'd rather)

```bash
( cd server && node db/migrate.js )                 # migrations
node server/db/scripts/seed-bair-local.mjs          # test logins + sample data
( cd server && node index.js ) &                    # API on :3001
( cd client && npm run dev )                         # client on :5173
```

`seed-bair-local.mjs` is idempotent and **local-only** (it sets known passwords on
test accounts) — never run it against production.
