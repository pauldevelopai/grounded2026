// email.js — Component 6: the 05:45 delivery fallback + failure shout.
//
// Belt to the review desk's braces: if the page is down, this email still
// arrives with the same draft. And on ANY pipeline failure it emails anyway,
// saying exactly what failed — silence at 06:30 must be impossible.

import pool from '../../db/pool.js';
import config from '../../config.js';
import { getMailer } from '../../services/email/providers.js';
import { toHtml, toPlainText } from './render.js';
import { issueDateFor } from './pipeline.js';

async function loadIssue(date) {
  const { rows } = await pool.query('SELECT * FROM newsletter_issues WHERE issue_date = $1', [date]);
  return rows[0] || null;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Send the draft (or a failure notice) for `date` to NEWSLETTER_EMAIL_TO.
 * Always attempts to send something. Returns the mailer result + status.
 */
export async function sendIssueEmail({ date, log = console.log } = {}) {
  const issueDate = date || issueDateFor();
  const to = config.newsletterEmailTo;
  const subjectPrefix = `Newsletter draft — ${issueDate}`;
  const issue = await loadIssue(issueDate);
  const mailer = getMailer();

  let subject; let html; let text;

  if (!issue) {
    subject = `⚠️ ${subjectPrefix} — NO ISSUE ROW`;
    html = `<p><strong>The newsletter pipeline produced no issue for ${issueDate}.</strong></p>
<p>The 05:15 synthesis job did not write a row. Check the server: <code>logs/nl-synthesis-*.log</code> and that the scrape + classify steps ran.</p>`;
    text = `The newsletter pipeline produced no issue for ${issueDate}. Check logs/nl-synthesis-*.log on the server.`;
  } else if (issue.status === 'failed') {
    subject = `⚠️ ${subjectPrefix} — PIPELINE FAILED`;
    html = `<p><strong>The pipeline failed for ${issueDate}.</strong></p>
<p>Error: <code>${esc(issue.error || 'unknown')}</code></p>
<pre style="white-space:pre-wrap;font-size:12px;color:#555;">${esc((issue.run_log || '').slice(-2000))}</pre>`;
    text = `Pipeline FAILED for ${issueDate}.\nError: ${issue.error || 'unknown'}\n\n${(issue.run_log || '').slice(-2000)}`;
  } else if (issue.status === 'quiet') {
    subject = `🔹 ${subjectPrefix} — quiet day`;
    html = `<p><strong>Quiet day.</strong> No qualifying stories in the last 24h for ${issueDate}. Nothing to send.</p>`;
    text = `Quiet day — no qualifying stories for ${issueDate}.`;
  } else {
    const obj = typeof issue.issue_json === 'string' ? JSON.parse(issue.issue_json) : issue.issue_json;
    subject = obj?.subject ? `${obj.subject}` : subjectPrefix;
    const banner = `<p style="color:#888;font-size:13px;">Draft for ${issueDate}. Review, sharpen, and paste into Substack from the briefing page. Header image is on the review desk (not attached).${issue.image_error ? ` (Image note: ${esc(issue.image_error)})` : ''}</p><hr/>`;
    html = banner + toHtml(obj, issue.develop_ai_block);
    text = `Draft for ${issueDate}\n\n${toPlainText(obj, issue.develop_ai_block)}`;
  }

  try {
    const r = await mailer.send({ to, subject, html, text });
    log(`[nl-email] sent via ${mailer.name} to ${to}: ${r.ok ? r.messageId : r.error}`);
    return { ok: r.ok, status: issue?.status || 'missing', to, provider: mailer.name };
  } catch (err) {
    log(`[nl-email] send FAILED: ${err.message}`);
    return { ok: false, status: issue?.status || 'missing', to, error: err.message };
  }
}
