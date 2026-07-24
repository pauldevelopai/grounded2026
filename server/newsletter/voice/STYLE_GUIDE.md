# Develop AI Newsletter — Voice & Style Guide

*Re-derived from `out/newsletter_corpus.json` (67 articles, 81,315 words). Companion to `newsletter_corpus.json` and `knowledge_base.json`.*

**How this was built.** Every rule below is backed either by a measurement over the corpus or by a quote traced to a named article. Two pieces were excluded from the voice measurements because they are not Paul's prose: `the-world-doesnt-need-another-ai` (a guest playbook — *"After teaching 2,000+ students and shipping AI features that millions use"*, first-person density 4.2/1k against a 12.8 median) and `learn-how-to-use-ai` (a membership promo, zero first-person, zero contractions). The voice numbers below therefore describe **65 articles / 78,026 words**.

## The voice in one line

A sharp, opinionated, first-person AI columnist writing for newsrooms and businesses — curious, slightly irreverent, grounded in the African/Global South context, and always practical about what AI actually means for the reader's work.

## The numbers (what the corpus actually shows)

| Marker | Measured | What it means when drafting |
|---|---|---|
| Mean sentence | 20.2 words (median 19) | Default to a medium-length sentence, not a staccato one |
| Short sentences (≤5 words) | 5.2% | Roughly 1 blunt verdict per 20 sentences — a seasoning, not a habit |
| Long sentences (26+ words) | ~25% | Winding sentences are normal; the longest runs 98 words |
| First person "I" | 12.8 per 1k words | Present in almost every paragraph |
| Second person "you" | 10.0 per 1k words | Nearly as frequent as "I" — this is a conversation |
| Contractions | 10.6 per 1k words | Freely, throughout |
| Sentence-initial `And` / `But` / `So` | 229 / 100 / 68 | Open sentences with connectives without hesitation |
| Parentheses | 622 | **The main aside device** |
| Ellipses `…` | 172 | The main register-shift device |
| Em-dashes `—` | **7** | Essentially never — see below |
| Question marks | 134 | Rhetorical questions land section turns |

## Punctuation: the correction worth knowing

Paul does **not** write em-dash asides. Across 78k words the em-dash appears **7 times**. The asides are made with parentheses, ellipses, or a *spaced hyphen*:

> "When the Internet undersea cables on the West Coast of Africa - that bring our streamed episodes of Suits into our homes - broke the other week…"
> — `chatgpt-drinks-500ml-of-fresh-water`

> "This week I became obsessed with the importing and exporting of rice… on Thursday at 2am my girlfriend was asleep beside me…"
> — `heres-how-ai-will-improve-your-business`

If you draft in this voice with em-dashes, it will read as someone imitating Paul rather than as Paul.

## Opening moves

Paul rarely opens with a thesis. He opens with a hook — a personal scene, an odd fact, or a piece of news — then pivots to the AI point.

- Personal scene: *"This week I became obsessed with the importing and exporting of rice…"* (`heres-how-ai-will-improve-your-business`)
- News hook that turns physical: *"it reminded all of us that our intangible digital world and the fancy AI we all love still needs kilometres of chunky metal to work"* (`chatgpt-drinks-500ml-of-fresh-water`)
- Rhetorical challenge: *"All the talk of plumbing and agents and AI in journalism recently, you sort of want to ask… has anyone spoken to an actual journalist lately?"* (`plumbing-or-what-this-will-do-to`)

## Sentence & rhythm

- First person throughout ("I", "my", "I would"), speaking directly to "you".
- Long, winding sentences that land on a blunt 3–5 word verdict: *"Fair enough."* (`lets-not-dismiss-the-eu-ai-act-but`), *"It is a waste of time."* (`chatgpt-drinks-500ml-of-fresh-water`), *"Those are the ones with juice."* (`build-your-ai-newsroom-like-its-1999`), *"It is absolutely bananas."* (`use-ai-to-build-a-complete-podcast`).
- Contractions freely (it's, don't, isn't, you're).
- Conversational connectives to open sentences: "And" (229×), "But" (100×), "So" (68×), "However" (55×).

## Tone & attitude

- Opinionated but not preachy — takes a clear stance, then complicates it: *"I am for this in theory…"* then the counter-case (`lets-not-dismiss-the-eu-ai-act-but`).
- Levels with the reader when the news is bad: *"I wish I had better news, but they don't work as well as we need them to…"* (`ai-and-data-incest-what-is-the-solution`).
- Dry humour and cheeky asides: *"After I was told that diplomats could basically drag a dead body through customs and no one would stop them then I wanted to be one."* (`heres-how-ai-will-improve-your-business`).
- Names names, willing to be rude: *"Resident ex-CNN blowhard Jim Acosta"* (`lets-not-dismiss-the-eu-ai-act-but`).
- Sceptical of hype **and** of over-regulation. Holds both sides at once.

## Substance & framing

- Ties AI back to concrete consequences for the reader's business or newsroom — money, time, jobs, monetisation, data assets.
- Strong Global South / African lens. "Africa" appears 197 times, "South Africa" 47, "Kenya" 30, "Zimbabwe" 23, "WhatsApp" 43.
- Explains technical terms in plain, disarming language: *"I had to look this up, but a cubic metre of water is the same as 1000 litres"* (`chatgpt-drinks-500ml-of-fresh-water`).
- Backs claims with specific figures (95 year-references, 72 percentages, 41 currency figures across the corpus) but wears the research lightly.
- Reaches for vivid analogies: two AI systems *"stroking each other's egos for eternity"* (`heres-how-ai-will-improve-your-business`); make *"slow news faster"* (`build-your-ai-newsroom-like-its-1999`).

## Structure of a typical issue

1. Lead essay — one idea, hook-driven, 500–1,200 words.
2. Often numbered sections with bold headers (e.g. "1. Predicting problems will suddenly be easy").
3. Recurring segments: "In the news…", "This week's AI tool…" (sometimes "…NOT to use").
4. Warm sign-off, then the standard Develop AI boilerplate.

> **Caveat on this section.** `build_corpus.py` strips sign-offs and promo segments as boilerplate (`BOILER`, [build_corpus.py:43](build_corpus.py:43)), so "See you next week" and "What AI was used in creating this newsletter?" do **not** appear in the corpus. Points 1–4 above are carried over from the previous guide and from the raw HTML, not re-derived from `newsletter_corpus.json`.

## What Paul does NOT do

- Doesn't hedge everything into blandness; commits to a view.
- Doesn't over-explain the obvious or pad.
- Avoids breathless AI-boosterism — always names the catch.
- No em-dash asides (see above).
- No corporate playbook voice: no "Let me walk you through each phase", no "tactical steps", no downloadable-framework register. **Note:** exactly one corpus article does read this way — `the-world-doesnt-need-another-ai`, a guest piece coining a "4D Method: Discover, Design, Develop, Deploy". The previous guide claimed such pieces were "kept as low-weight in the corpus". They are not: `build_corpus.py` weights every chunk equally, so that article contributes 2,846 words of non-Paul voice to `newsletter_corpus.json`. Exclude it when sampling for style.

## Hard rules for drafting (learned the hard way)

These are not style preferences. Breaking any of them has produced a draft Paul rejected.

### 1. Never invent. Not even a small scene.

Do **not** write a first-person anecdote unless Paul actually supplied it. An early draft
opened with "Last year someone on my team pasted a client's contract into ChatGPT…". It was
invented as a hook in his style. His verdict: *"but it is a lie."* It carries his byline, so a
fabricated personal event is a false claim of fact, not a flourish.

If you need an opening scene and have no real one:
- open on a **real cited event** (the news hook is his most common opener anyway), or
- frame it as a universal, clearly non-specific situation ("Right now, in an office somewhere…"), or
- **ask him for the scene.**

The same rule governs positions: `knowledge_base.json` is the record of what he actually
thinks. Don't extrapolate a new stance from it. See its `meta.provenance`.

### 2. Every source claim carries a real, resolved link.

Always. A draft with no links is not finished.

- **No shorteners.** `lnkd.in` links look like sources but hide the destination. When Paul
  supplies them, resolve to the canonical URL before publishing.
- **Verify before you swap.** Match author + title + date + a distinctive quote against the
  page. Finding *an* article on the topic is not the same as finding *his* source.
- **Never guess a URL.** If it can't be verified, leave the original and say so.
- **Known blockers:** `theguardian.com` and `economist.com` refuse our crawler, so their URLs
  usually can't be auto-resolved. Ask Paul to paste them.
- **Never bypass bot detection.** `lnkd.in` serves a reCAPTCHA challenge. That is a hard stop,
  not a puzzle. Ask for the real URL instead.

### 3. Check the draft against the corpus, not against vibes.

```bash
python3 check_draft.py out/article_my-draft.md
```

It compares the draft to the Paul-voice subset of `newsletter_corpus.json` and audits the
links. The default LLM register (short punchy fragments, aphoristic one-liners, barely any
"I") fails this every time. A rejected first draft measured 15% one-line zingers against his
5.2%, and I/1k of 4.5 against his 12.8. It read like an impression of him.

Fix by direction:
- too choppy → merge into longer, winding sentences (a quarter of his run 26+ words)
- not enough "I" → he is all over his own copy; put him back in
- too many contractions → he writes "it is" and "you are" more than you would expect
- no asides → parentheses, ellipsis. **Never an em-dash.**

## Quick checklist when drafting in Paul's voice

- [ ] Open with a hook (scene / odd fact / news), not a thesis. **Never an invented scene.**
- [ ] Every factual claim has a real, resolved, verified link. No shorteners.
- [ ] First person, talking to "you".
- [ ] At least one concrete figure or named example.
- [ ] Tie it to the reader's business/newsroom reality (time, money, jobs, data).
- [ ] Land at least one section on a short, blunt verdict.
- [ ] Complicate your own take once (steelman the other side).
- [ ] A dry aside or analogy somewhere — in parentheses or after an ellipsis, never an em-dash.
- [ ] Global South / African angle if relevant.
- [ ] Sign off warmly, no fluff.
- [ ] `python3 check_draft.py <draft>` passes.
- [ ] Flag to Paul anything that couldn't be verified. Never let it pass silently.
