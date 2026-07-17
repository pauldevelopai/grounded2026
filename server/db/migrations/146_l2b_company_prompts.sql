-- 146_l2b_company_prompts.sql
-- Seed Leads 2 Business's own prompt library (Paul, 2026-07-14). Their library was
-- empty — only our 8 global prompts, which already cover BoQ conversion, tender-notice
-- extraction, email polish, summarising and sourced research. These four fill the GAPS:
-- tasks L2B staff named in their own intake survey that the global set doesn't cover.
-- Each is traceable to a real survey answer (quoted in the comment above it).
--
-- newsroom_id = L2B  → shows in their library only.
-- source      = 'develop_ai' → labelled "Shared with you" (we wrote them, not a member)
--                but still editable by any L2B member via the company-prompt route.
-- validation_status = 'draft' — 'proven' is ONLY ever set by the promptfoo validation
--                script (integrity rule in routes/prompts.js). Never seed 'proven'.
-- Idempotent: each insert is skipped if that title already exists for L2B.

-- Claire Donaldson: "Sourcing tender notices, tender awards, errata, bidders lists,
-- validity extentions." — nothing in the global set handles an erratum diff.
INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, validation_status)
SELECT n.id,
  'Erratum — what changed on this tender?',
  $p$I capture tender errata and validity extensions. Tell me exactly what changed.

I will paste the ORIGINAL notice, then the ERRATUM / EXTENSION.

Give me:
1. A change table — Field | Was | Now — listing ONLY fields that actually changed.
2. The new closing date / validity date, stated plainly.
3. Anything in the erratum that is genuinely new (not a change to an existing field).
4. Anything ambiguous or contradicting the original — quote the line it came from.

Rules:
- Only report changes you can see in the two texts. Never infer.
- Leave unchanged fields out entirely.
- Keep dates, reference numbers and wording exactly as written.

ORIGINAL NOTICE:
[PASTE]

ERRATUM / EXTENSION:
[PASTE]$p$,
  'Compare an erratum or validity extension against the original notice and list exactly what changed.',
  'extract', '["researcher"]'::jsonb, 'develop_ai', 'draft'
FROM newsrooms n
WHERE n.name = 'Leads 2 Business'
  AND NOT EXISTS (SELECT 1 FROM prompts p WHERE p.newsroom_id = n.id AND p.title = 'Erratum — what changed on this tender?');

-- Claire Donaldson: "bidders lists". Lola: "I assist Contractors to get prices for
-- their tender submissions" — a bidders/price table is a distinct extraction job.
INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, validation_status)
SELECT n.id,
  'Bidders list → clean table',
  $p$Extract the bidders from the bidders list below into a table.

Columns: Bidder name | Price / amount | BEE level or status | Notes

Rules:
- One row per bidder, in the order they appear.
- Keep names and figures EXACTLY as written — do not tidy names or convert currency.
- If a value isn't given for a bidder, write "not stated".
- If the document is unclear about who the bidders actually are, say so instead of guessing.
- Output as CSV with a header row, ready to paste into Excel.
- After the table, list any lines you could not place.

BIDDERS LIST:
[PASTE]$p$,
  'Pull the bidders and their prices out of a bidders list into a clean table for Excel.',
  'extract', '["researcher", "boq_processor"]'::jsonb, 'develop_ai', 'draft'
FROM newsrooms n
WHERE n.name = 'Leads 2 Business'
  AND NOT EXISTS (SELECT 1 FROM prompts p WHERE p.newsroom_id = n.id AND p.title = 'Bidders list → clean table');

-- Therousha: "Directory- Updating and keeping the database in order with relevant
-- companies". Nirasha: "Online Directory ... adding companies, updating details".
INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, validation_status)
SELECT n.id,
  'Directory company record — check and tidy',
  $p$I maintain a company directory for the construction industry. Tidy this record.

Return the record with these fields, cleaned:
Company name | Trading as | Physical address | Postal address | Phone | Email | Website | Contact person & role | Sector / trade

Rules:
- Fix formatting only (capitalisation, spacing, phone format). NEVER change a name,
  number or address to something you think is more likely.
- Where a field is missing, write "missing" — do not fill it in from general knowledge.
- Under the record, list: (a) anything inconsistent or possibly duplicated, and
  (b) exactly what I should verify before saving.

RECORD:
[PASTE]$p$,
  'Normalise a company''s details for the directory and flag what needs verifying before you save.',
  'format', '["researcher", "admin"]'::jsonb, 'develop_ai', 'draft'
FROM newsrooms n
WHERE n.name = 'Leads 2 Business'
  AND NOT EXISTS (SELECT 1 FROM prompts p WHERE p.newsroom_id = n.id AND p.title = 'Directory company record — check and tidy');

-- Mecayla Vermaak: "Tracking development phases, feasibility stages, and construction
-- progress ... Calculating timelines and completion periods". Christie Peel: "Gather
-- information on awarded tenders, construction timelines, phases, and professional teams."
INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, validation_status)
SELECT n.id,
  'Project update — stage, timeline and team',
  $p$Turn my project notes into the fields we track.

Give me:
- Project name & location
- Current stage (feasibility / design / tender / construction / complete)
- Timeline: start, anticipated completion, and any other dates mentioned
- Professional team (architect, engineer, QS, project manager) — only those named
- Contractor and subcontractors — only those named
- What changed since our last record (I paste it below, if I have one)
- Follow-ups: what is still unknown, and who to ask

Rules:
- Use ONLY what is in my notes. Anything not mentioned = "not stated".
- Do not estimate dates or durations that aren't given.
- Keep names and figures spelled exactly as in the notes.

WHAT WE HAD (optional):
[PASTE]

MY NOTES:
[PASTE]$p$,
  'Turn call notes or an update into the project fields you track, with gaps and follow-ups flagged.',
  'summarise', '["researcher"]'::jsonb, 'develop_ai', 'draft'
FROM newsrooms n
WHERE n.name = 'Leads 2 Business'
  AND NOT EXISTS (SELECT 1 FROM prompts p WHERE p.newsroom_id = n.id AND p.title = 'Project update — stage, timeline and team');

-- ROLLBACK:
--   DELETE FROM prompts WHERE source='develop_ai' AND newsroom_id=(SELECT id FROM newsrooms WHERE name='Leads 2 Business')
--     AND title IN ('Erratum — what changed on this tender?','Bidders list → clean table',
--                   'Directory company record — check and tidy','Project update — stage, timeline and team');
--   DELETE FROM migrations WHERE name='146_l2b_company_prompts.sql';
