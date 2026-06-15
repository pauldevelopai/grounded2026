// prompts.mjs — seed the prompt library (global prompts; newsroom_id NULL).
// Idempotent: skips a global prompt whose title already exists. Run:
//   node server/db/seeds/prompts.mjs   (or: npm run seed:prompts)
//
// PROVENANCE (deliberate, see the brief):
//  • General prompts are CC-BY adaptations: CC-BY 4.0 permits derivatives WITH
//    attribution, so crediting Wharton (Mollick & Mollick) / the vendor on an
//    adapted prompt is honest + compliant. Source URLs are best-effort — VERIFY
//    before publishing externally (flagged in the PR).
//  • Every seed loads validation_status='draft'. "proven" is set ONLY by the
//    promptfoo validation script — never asserted here.
//  • We do NOT ingest unvetted community prompts; the feedback loop is the channel
//    for community-quality prompts to enter later, post-validation + approval.
import pool from '../pool.js';

const WHARTON_ATTR =
  'Adapted under CC-BY 4.0 from the Wharton Generative AI Labs prompt library — ' +
  '© Ethan Mollick & Lilach Mollick. Licence: https://creativecommons.org/licenses/by/4.0/ · ' +
  'Source: https://www.whartongenerativeai.com/ (verify exact prompt + URL before external publishing)';

const PROMPTS = [
  // ── General (Wharton CC-BY adaptations) ──────────────────────────────────
  {
    title: 'Polish a rough email into a professional one',
    description: 'Turn a quick, messy draft into a clear, professional email — without changing the facts.',
    task_type: 'draft', roles: ['general', 'admin', 'finance'], source: 'wharton', attribution: WHARTON_ATTR,
    body: 'You are an editor. Rewrite the email below to be clear, professional and concise. Keep every fact and request unchanged; do not invent details. Preserve my intent and a warm but businesslike tone. Return only the rewritten email.\n\nEMAIL:\n"""\n{{paste your draft}}\n"""',
    example_input: 'hey just checking did u get the invoice i sent last week? need it paid soon pls because the supplier is chasing. thanks',
    example_output: 'Subject: Following up on last week’s invoice\n\nHi [Name],\n\nI’m following up on the invoice I sent last week. Could you confirm it’s been received and let me know when payment is likely? Our supplier is asking for an update, so a quick reply would help a lot.\n\nThanks very much,\n[Your name]',
  },
  {
    title: 'Summarise a long document into key bullet points',
    description: 'Get the essentials of a long document as a short, faithful bullet list.',
    task_type: 'summarise', roles: ['general', 'researcher'], source: 'wharton', attribution: WHARTON_ATTR,
    body: 'Summarise the document below into 5–8 bullet points capturing only the most important facts, decisions and figures. Be faithful to the source — do not add interpretation or anything not present. Keep each bullet to one line.\n\nDOCUMENT:\n"""\n{{paste the document}}\n"""',
    example_input: '(a 6-page supplier agreement)',
    example_output: '• Term: 24 months from 1 March, auto-renews unless cancelled 60 days prior.\n• Pricing: R45/unit, fixed for year 1; CPI-linked thereafter.\n• Payment: 30 days from invoice; 2% penalty on late payment.\n• …',
  },
  // ── General (vendor-published guidance) ──────────────────────────────────
  {
    title: 'Turn a document into a one-line action list',
    description: 'Extract just the decisions and to-dos from a document or meeting notes.',
    task_type: 'summarise', roles: ['general', 'admin'], source: 'vendor',
    attribution: 'Pattern from OpenAI’s published prompting guidance (verify source URL before external publishing).',
    body: 'Read the text below and return ONLY a list of concrete action items — who needs to do what, by when if stated. One action per line, imperative voice. Omit background and discussion. If there are no actions, say "No action items found."\n\nTEXT:\n"""\n{{paste notes or document}}\n"""',
  },
  {
    title: 'Draft a professional follow-up message',
    description: 'Write a polite, specific follow-up when you’ve had no reply.',
    task_type: 'draft', roles: ['general', 'finance'], source: 'vendor',
    attribution: 'Pattern from Anthropic’s published prompting guidance (verify source URL before external publishing).',
    body: 'Write a short, polite follow-up message about the matter below. Reference the original request, restate what I need and a clear next step, and keep it courteous and brief (under 120 words). Do not sound passive-aggressive. Return only the message.\n\nCONTEXT:\n"""\n{{what you asked for, and when}}\n"""',
  },
  // ── L2B task prompts (develop_ai, draft until validated) ─────────────────
  {
    title: 'Extract key fields from a tender notice',
    description: 'Pull the fields that matter from a tender/RFQ notice into a clean list.',
    task_type: 'extract', roles: ['researcher', 'boq_processor'], source: 'develop_ai',
    body: 'From the tender notice below, extract these fields as a labelled list. If a field is not present, write "Not stated" — never guess:\n- Tender/reference number\n- Issuing body\n- Title / scope (one line)\n- Closing date & time\n- Site inspection / briefing (date, compulsory?)\n- Estimated value or budget\n- Submission method & address\n- Contact person & details\n- Key eligibility requirements (CIDB grade, BBBEE, etc.)\n\nTENDER NOTICE:\n"""\n{{paste the notice}}\n"""',
    example_input: '(a municipal tender advert)',
    example_output: '- Tender/reference number: SCM/2026/014\n- Issuing body: …\n- Closing date & time: 14 July 2026, 11:00\n- Site briefing: 30 June 2026, compulsory\n- …',
  },
  {
    title: 'Convert a messy BoQ extract into a clean table',
    description: 'Normalise a copy-pasted Bill of Quantities into tidy, columned rows.',
    task_type: 'format', roles: ['boq_processor'], source: 'develop_ai',
    body: 'The text below is a messy extract from a Bill of Quantities. Reformat it into a clean table with these columns: Item No | Description | Unit | Quantity | Rate | Amount. Keep values exactly as given — do not recalculate or invent numbers. Where a cell is missing, leave it blank. Output a markdown table only.\n\nBOQ EXTRACT:\n"""\n{{paste the messy extract}}\n"""',
    example_input: '1.1 Excavate in soft material to 1.5m m3 240 ... 85.00 ... 20400',
    example_output: '| Item No | Description | Unit | Quantity | Rate | Amount |\n|---|---|---|---|---|---|\n| 1.1 | Excavate in soft material to 1.5m | m³ | 240 | 85.00 | 20 400 |',
  },
  {
    title: 'Live research with mandatory source links',
    description: 'Research a question and require a working source link for every claim.',
    task_type: 'research', roles: ['researcher'], source: 'develop_ai',
    body: 'Research the question below. For EVERY factual claim you make, include a link to the original primary source (official site, regulator, court, company filing — not aggregators or blogs). If you cannot find a primary source for a claim, drop the claim. End with a "Sources" list of the links used. If the question can’t be answered from sourceable facts, say so.\n\nQUESTION:\n"""\n{{your question}}\n"""',
  },
  {
    title: 'Research that excludes named sources or domains',
    description: 'Research while explicitly avoiding certain sources/domains.',
    task_type: 'research', roles: ['researcher'], source: 'develop_ai',
    body: 'Research the question below. Do NOT use, cite, or rely on any of the excluded sources/domains listed — if a fact only appears there, find an independent primary source or omit it. Provide source links for each claim and a final "Sources" list.\n\nEXCLUDE: {{comma-separated domains or publishers}}\n\nQUESTION:\n"""\n{{your question}}\n"""',
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query('SELECT title FROM prompts WHERE newsroom_id IS NULL');
    const have = new Set(existing.map((r) => r.title));
    let added = 0;
    for (const p of PROMPTS) {
      if (have.has(p.title)) { console.log(`  skip: ${p.title}`); continue; }
      await client.query(
        `INSERT INTO prompts (newsroom_id, title, body, description, task_type, roles, source, attribution, validation_status, example_input, example_output)
         VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,'draft',$8,$9)`,
        [p.title, p.body, p.description, p.task_type, JSON.stringify(p.roles), p.source, p.attribution || null,
         p.example_input || null, p.example_output || null]
      );
      added += 1;
      console.log(`  added [${p.source}/draft]: ${p.title}`);
    }
    console.log(`Prompt seed complete: ${added} added, ${PROMPTS.length - added} skipped. All draft — run npm run validate-prompts to set 'proven'.`);
  } finally {
    client.release();
    await pool.end();
  }
}
seed();
