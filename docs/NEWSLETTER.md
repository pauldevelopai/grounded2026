# The Daily System — governance/cyber/legal newsletter

A fully automated pipeline that, by 05:45 SAST, produces a ready-to-review daily
newsletter tracking what is going wrong with AI (cyber security, governance,
legal) drawn from the stories the scraper already collects, written in Paul's
voice, displayed on the Newsletter review desk for copy-paste into Substack.

**Nothing sends automatically. Ever.** Paul is the only thing between the
pipeline and subscribers. (Substack has no send API; do not automate against it.)

## The pieces (all in this repo)

| Part | Where |
|------|-------|
| Classifier (Component 1) | `server/newsletter/classify.js` → writes `nl_*` columns on `ai_legal_raw_items` |
| Select + rank | `server/newsletter/lib/select.js` |
| Writer, 2 calls (Component 2) | `server/newsletter/lib/synthesize.js` (draft → de-Claude edit) |
| Header image (Component 3) | `server/newsletter/lib/image.js` (OpenAI `gpt-image-1`; **needs `OPENAI_API_KEY`**) |
| Orchestrator + persistence | `server/newsletter/lib/pipeline.js` → `newsletter_issues` table + `server/newsletter/archive/` |
| Review desk (Component 4) | `client/.../newsletter/DailyNewsletterDesk.jsx` at `/newsletter`; API `/api/newsletter/daily/*` |
| Corpus feedback (Component 5) | `server/newsletter/lib/corpus.js` `appendSentIssueToCorpus` on "Mark as sent" |
| Email fallback (Component 6) | `server/newsletter/lib/email.js` → `NEWSLETTER_EMAIL_TO` |
| Voice engine (vendored from `../newsletter/`) | `server/newsletter/voice/` — `STYLE_GUIDE.md`, `newsletter_corpus.json`, `de-claude-tells.txt`, `examples/` |

The store is the existing scraper feed: `ai_legal_raw_items`. The newsletter
classification (`nl_*`) is **independent** of the legal `triage_*` pipeline.

## Commands (run from repo root)

```bash
npm run newsletter:seed-cyber     # one-time: add cyber-security RSS sources
npm run scrape                    # existing scraper -> ai_legal_raw_items
npm run newsletter:classify       # tag new items in/out of scope (Haiku)
npm run newsletter:synthesis      # build today's draft (2 Sonnet calls + image)
npm run newsletter:synthesis -- --no-image --date=2026-07-24   # backfill / no OpenAI key
npm run newsletter:email          # email today's draft (or failure notice) to NEWSLETTER_EMAIL_TO
```

## Cron (on the box — SAST). Add to the crontab that already runs scrape/triage:

```cron
# Times are SAST. CRON_TZ applies to entries below it (Vixie cron).
# Check the box TZ first: `timedatectl`. If the box is UTC, CRON_TZ makes these
# fire at the SAST wall-clock times regardless.
CRON_TZ=Africa/Johannesburg
0  2 * * *  cd /home/ubuntu/tracker && npm run scrape            >> logs/cron.log 2>&1
15 2 * * *  cd /home/ubuntu/tracker && npm run newsletter:classify >> logs/cron.log 2>&1
15 5 * * *  cd /home/ubuntu/tracker && npm run newsletter:synthesis >> logs/cron.log 2>&1
45 5 * * *  cd /home/ubuntu/tracker && npm run newsletter:email    >> logs/cron.log 2>&1
```

`newsletter:synthesis` also re-classifies stragglers, so the 02:15 classify is
belt-and-braces (spreads Haiku load off the 05:15 window). Weekend policy is
Paul's call — drop `* * *` to `* * 1-5` for weekdays only.

## Env vars

| Var | Needed for | Notes |
|-----|-----------|-------|
| `ANTHROPIC_API_KEY` | classify + write | already set |
| `OPENAI_API_KEY` | header image only | **not set yet**; pipeline ships without images until it is + billing |
| `NEWSLETTER_EMAIL_TO` | 05:45 fallback email | defaults to `ADMIN_EMAIL` |
| `NEWSLETTER_TZ` | issue dating | defaults `Africa/Johannesburg` |
| `EMAIL_PROVIDER` | real email send | `console` (default) just logs; set `postmark`/`resend`/`ses` + creds to actually send |

Model/tuning knobs (all optional): `NEWSLETTER_WRITE_MODEL` (default
`claude-sonnet-4-6`), `NEWSLETTER_CLASSIFY_MODEL` (default
`claude-haiku-4-5-20251001`), `NEWSLETTER_IMAGE_QUALITY`, `NEWSLETTER_IMAGE_STYLE`.

## The 6:30 routine

1. Open `/newsletter`. The **Today's Newsletter** desk is at the top.
2. Read the status banner (✅ draft / ⚠️ failed / 🔹 quiet). If the page is down,
   the 05:45 email has the same draft. No email at all → check the server.
3. Sharpen the "how this affects you" / "how to protect yourself" lines — the
   judgement only you can add. Edits autosave.
4. Refresh the **Develop AI block** if it's gone stale (it carries forward
   unchanged otherwise; the pipeline never writes it).
5. Download the header image (if present). Click **Copy for Substack**, paste
   into a new Substack post, upload the image, send.
6. Click **Mark as sent → save to corpus** — the final news text feeds the voice
   system so drafts sound more like you every week.

## Editorial frame (authoritative)

Three pillars — Cyber Security / Governance / Legal — ordered daily by news
weight. Every story: What happened → How this affects you → How to protect
yourself. The protection beat is the product: concrete and specific, never
generic. Sources are global; the lens is African (POPIA / Kenya DPA / Nigeria
NDPA cited where relevant). Every item carries its scraped source URL. The news
never mentions Paul/Develop AI/clients — that lives only in the Develop AI block.

## Voice engine

Vendored from the sibling `../newsletter/` project so it survives deploy. The
writer's second pass ("de-Claude") strips AI tells listed in
`server/newsletter/voice/de-claude-tells.txt` — **append survivors there** when a
tic slips through. Voice metrics are measured live against the corpus (a JS port
of `../newsletter/check_draft.py`), not eyeballed.
