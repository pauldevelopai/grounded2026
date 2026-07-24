// render.js — turn the structured issue object into the three surfaces we need:
//   markdown  — for the archive file and the voice checker
//   html      — clean, Substack-paste-safe HTML for the email + Copy button
//   plaintext — for the email text part
//
// The Develop AI block is rendered LAST, under its fixed heading, and is the
// only place Paul's own work appears (spec guardrail).

import { PILLAR_LABEL } from './pillars.js';

const DEVELOP_HEADING = 'What’s happening at Develop AI';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Convert the flat prose fields into paragraphs; keep it simple and portable.
function paras(text) {
  return String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

// ── Markdown (archive + voice check) ────────────────────────────────────────
export function toMarkdown(issue, developBlock) {
  const out = [];
  out.push(`# ${issue.subject || 'Daily briefing'}`, '');
  for (const section of issue.sections || []) {
    out.push(`## ${PILLAR_LABEL[section.pillar] || section.pillar}`, '');
    for (const st of section.stories || []) {
      out.push(`### ${st.headline || ''}`);
      if (st.treatment === 'full') {
        if (st.what_happened) out.push('', st.what_happened);
        if (st.affects_you) out.push('', `**How this affects you:** ${st.affects_you}`);
        if (st.protect_yourself) out.push('', `**How to protect yourself:** ${st.protect_yourself}`);
      } else {
        const line = [st.what_happened, st.affects_you, st.protect_yourself].filter(Boolean).join(' ');
        if (line) out.push('', line);
      }
      if (st.url) out.push('', `[Source](${st.url})`);
      out.push('');
    }
  }
  if (developBlock && developBlock.trim()) {
    out.push(`## ${DEVELOP_HEADING}`, '', developBlock.trim(), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// The editable NEWS body only: sections + stories, no subject h1, no Develop
// AI block. This is what the review desk puts in Paul's editable textarea and
// what "Copy for Substack" + the corpus save operate on.
export function toNewsMarkdown(issue) {
  const body = { subject: '', sections: issue.sections || [] };
  return toMarkdown(body, '').trim() + '\n';
}

// A deliberately small markdown -> HTML converter for the constrained format
// the newsletter uses (## / ### headings, **bold**, [text](url), paragraphs).
// Used to turn Paul's EDITED markdown into Substack-paste-safe HTML.
export function markdownToHtml(md) {
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const out = [];
  for (const block of String(md || '').split(/\n{2,}/)) {
    const b = block.trim();
    if (!b) continue;
    if (b.startsWith('### ')) out.push(`<h3>${inline(b.slice(4))}</h3>`);
    else if (b.startsWith('## ')) out.push(`<h2>${inline(b.slice(3))}</h2>`);
    else if (b.startsWith('# ')) out.push(`<h1>${inline(b.slice(2))}</h1>`);
    else out.push(`<p>${inline(b).replace(/\n/g, '<br/>')}</p>`);
  }
  return out.join('\n');
}

// Build the full Substack-ready HTML from Paul's EDITED pieces (subject +
// edited news markdown + develop block), rather than the generated structure.
export function toCopyHtml({ subject, newsMarkdown, developBlock }) {
  const out = [];
  if (subject) out.push(`<h1>${esc(subject)}</h1>`);
  if (newsMarkdown) out.push(markdownToHtml(newsMarkdown));
  if (developBlock && developBlock.trim()) {
    out.push(`<h2>${esc(DEVELOP_HEADING)}</h2>`);
    out.push(markdownToHtml(developBlock));
  }
  return out.join('\n');
}

// ── HTML (email + Copy-for-Substack) ────────────────────────────────────────
// Deliberately minimal, inline-friendly HTML: <h2>/<h3>/<p>/<a>. Substack's
// editor keeps headings, bold, links and paragraph breaks on paste.
export function toHtml(issue, developBlock, { includeImage = null } = {}) {
  const out = [];
  if (issue.subject) out.push(`<h1>${esc(issue.subject)}</h1>`);
  if (includeImage) out.push(`<p><img src="${esc(includeImage)}" alt="" style="max-width:100%;height:auto;" /></p>`);

  for (const section of issue.sections || []) {
    out.push(`<h2>${esc(PILLAR_LABEL[section.pillar] || section.pillar)}</h2>`);
    for (const st of section.stories || []) {
      out.push(`<h3>${esc(st.headline || '')}</h3>`);
      if (st.treatment === 'full') {
        for (const p of paras(st.what_happened)) out.push(`<p>${esc(p)}</p>`);
        if (st.affects_you) out.push(`<p><strong>How this affects you:</strong> ${esc(st.affects_you)}</p>`);
        if (st.protect_yourself) out.push(`<p><strong>How to protect yourself:</strong> ${esc(st.protect_yourself)}</p>`);
      } else {
        const line = [st.what_happened, st.affects_you, st.protect_yourself].filter(Boolean).join(' ');
        if (line) out.push(`<p>${esc(line)}</p>`);
      }
      if (st.url) out.push(`<p><a href="${esc(st.url)}">${esc(st.url)}</a></p>`);
    }
  }
  if (developBlock && developBlock.trim()) {
    out.push(`<h2>${esc(DEVELOP_HEADING)}</h2>`);
    for (const p of paras(developBlock)) out.push(`<p>${esc(p)}</p>`);
  }
  return out.join('\n');
}

// ── Plaintext (email text part) ─────────────────────────────────────────────
export function toPlainText(issue, developBlock) {
  // Reuse the markdown then strip the lightweight markup.
  return toMarkdown(issue, developBlock)
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[Source\]\((.+?)\)/g, 'Source: $1');
}

// The prose the voice checker measures: the beats of every story, concatenated.
export function assembledProse(issue) {
  const parts = [];
  for (const section of issue.sections || []) {
    for (const st of section.stories || []) {
      parts.push(st.headline, st.what_happened, st.affects_you, st.protect_yourself);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}
