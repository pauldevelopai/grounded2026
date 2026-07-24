// pipeline.js — orchestrates one day's issue end to end and persists it.
//
//   classify stragglers -> select+rank -> (quiet? bail) -> write (2 calls)
//   -> header image (best-effort) -> carry-forward the Develop AI block
//   -> upsert newsletter_issues + write the dated archive markdown.
//
// Everything is wrapped so a failure at any step is recorded on the issue row
// (status='failed', error) rather than lost — the 05:45 email + the review desk
// both read that row, so silence is impossible.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../../db/pool.js';
import config from '../../config.js';
import { classifyNewsletterItems } from '../classify.js';
import { selectStories } from './select.js';
import { synthesizeIssue } from './synthesize.js';
import { generateHeaderImage } from './image.js';
import { toMarkdown } from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.resolve(__dirname, '../archive');

// Today's date in the configured newsletter timezone (YYYY-MM-DD).
export function issueDateFor(tz = config.newsletterTz, now = new Date()) {
  // en-CA gives ISO-ish YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// The last non-empty Develop AI block, carried forward unchanged (spec: the
// pipeline NEVER generates or edits it — it only propagates Paul's last value).
async function lastDevelopBlock() {
  const { rows } = await pool.query(
    `SELECT develop_ai_block FROM newsletter_issues
      WHERE develop_ai_block IS NOT NULL AND btrim(develop_ai_block) <> ''
      ORDER BY issue_date DESC LIMIT 1`,
  );
  return rows[0]?.develop_ai_block || '';
}

async function upsertIssue(row) {
  const cols = ['issue_date', 'subject', 'issue_json', 'draft_text', 'final_text',
    'develop_ai_block', 'sources', 'image_path', 'image_error', 'status', 'error', 'run_log'];
  const vals = cols.map((c) => row[c] ?? null);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols.filter((c) => c !== 'issue_date')
    .map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  await pool.query(
    `INSERT INTO newsletter_issues (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (issue_date) DO UPDATE SET ${updates}, updated_at = NOW()`,
    vals,
  );
}

/**
 * Run the full synthesis for a date. Returns the persisted issue row summary.
 * Never throws for expected failures — records status='failed' and returns it.
 */
export async function runSynthesis({ date, sinceHours = 24, skipImage = false, log = console.log } = {}) {
  const issueDate = date || issueDateFor();
  const logLines = [];
  const L = (m) => { logLines.push(`${new Date().toISOString()}  ${m}`); log(m); };

  L(`[pipeline] synthesising issue for ${issueDate} (tz=${config.newsletterTz})`);

  try {
    // 1. Catch any stragglers the scrape/classify step missed.
    await classifyNewsletterItems({ limit: 200, log: L });

    // 2. Select + rank.
    const selection = await selectStories({ sinceHours });
    const developBlock = await lastDevelopBlock();

    if (selection.quiet) {
      L('[pipeline] quiet day — no qualifying stories');
      const issue = { subject: `Quiet day — ${issueDate}`, sections: [] };
      await upsertIssue({
        issue_date: issueDate, subject: issue.subject, issue_json: JSON.stringify(issue),
        draft_text: null, final_text: null, develop_ai_block: developBlock,
        sources: JSON.stringify([]), image_path: null, image_error: null,
        status: 'quiet', error: null, run_log: logLines.join('\n'),
      });
      return { issueDate, status: 'quiet' };
    }

    L(`[pipeline] selected ${selection.allStories.length} stor${selection.allStories.length === 1 ? 'y' : 'ies'} across ${selection.pillars.length} pillar(s): ${selection.pillars.map((p) => `${p.pillar}(${p.stories.length})`).join(', ')}`);

    // 3. Write (two calls).
    const { issue, draftText, finalText, voice, dropped } = await synthesizeIssue(selection, { log: L });
    if (!issue.sections.length) throw new Error('all stories dropped by URL guardrail — nothing to publish');

    // 4. Header image (best-effort; never blocks).
    let image = { imagePath: null, error: 'image skipped' };
    const leadStory = issue.sections[0]?.stories?.[0];
    if (!skipImage && leadStory) image = await generateHeaderImage(leadStory, issueDate, { log: L });
    else L('[pipeline] image generation skipped');

    // 5. Sources list for the review desk.
    const sources = selection.allStories.map((s) => ({
      id: s.id, title: s.title, url: s.url, category: s.nl_category,
      severity: s.nl_severity, africa_relevance: s.nl_africa_relevance, one_line: s.nl_one_line,
      source_name: s.source_name,
    }));

    // 6. Persist + archive markdown.
    const markdown = toMarkdown(issue, developBlock);
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARCHIVE_DIR, `${issueDate}.md`), markdown);

    L(`[pipeline] voice: ${voice.fails} problem(s), ${voice.words} words${dropped.length ? `; dropped ${dropped.length} unverified` : ''}`);

    await upsertIssue({
      issue_date: issueDate,
      subject: issue.subject,
      issue_json: JSON.stringify(issue),
      draft_text: draftText,
      final_text: finalText,
      develop_ai_block: developBlock,
      sources: JSON.stringify(sources),
      image_path: image.imagePath,
      image_error: image.error,
      status: 'draft',
      error: null,
      run_log: logLines.join('\n'),
    });

    L(`[pipeline] done — status=draft, subject="${issue.subject}"`);
    return { issueDate, status: 'draft', subject: issue.subject, voiceFails: voice.fails, imagePath: image.imagePath };
  } catch (err) {
    L(`[pipeline] FAILED: ${err.message}`);
    // Record the failure so the email + banner can shout about it.
    try {
      await upsertIssue({
        issue_date: issueDate, subject: `Pipeline failed — ${issueDate}`, issue_json: null,
        draft_text: null, final_text: null, develop_ai_block: await lastDevelopBlock().catch(() => ''),
        sources: JSON.stringify([]), image_path: null, image_error: null,
        status: 'failed', error: err.message, run_log: logLines.join('\n'),
      });
    } catch (e2) { L(`[pipeline] could not record failure: ${e2.message}`); }
    return { issueDate, status: 'failed', error: err.message };
  }
}
