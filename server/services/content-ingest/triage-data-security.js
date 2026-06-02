// Data Security AI triage — reads pending content_raw_items (domain
// 'data-security'), asks Claude to judge relevance + classify each into one of
// the data-security topics, write a short summary, and emit a compiled
// data_security_items row (status 'review') for admin to publish. Irrelevant
// items are marked 'rejected'. Mirrors triage-monetisation (batched, cached
// system block, Haiku, low temperature).

import pool from '../../db/pool.js';
import { classifyInChunks } from '../claude.js';

const BATCH = 20;
const TEMP = 0.1;
const TOPICS = ['source-protection', 'device-security', 'account-security', 'surveillance', 'data-protection', 'general'];

const SYSTEM = `You are a precise triage agent building a high-quality knowledge base on
DIGITAL & DATA SECURITY FOR NEWSROOMS — how journalists and news organisations protect
their sources, devices, accounts and data, and defend against surveillance. Your job is
to surface ACTIONABLE GUIDANCE, REAL THREAT RESEARCH, and CONCRETE TOOLS — not hype.

For each item decide relevance, then classify into ONE topic:
- "source-protection" — protecting confidential sources: secure messaging, leaks/SecureDrop, metadata, anonymity
- "device-security"   — securing laptops/phones: encryption, hardening, border crossings, malware on devices
- "account-security"  — accounts & access: phishing, 2FA/passkeys, passwords, account takeover, social-media safety
- "surveillance"      — state/commercial surveillance & spyware (e.g. Pegasus), tracking, network monitoring, threat research
- "data-protection"   — handling/storing data: encryption at rest, backups, breaches, data-protection law (POPIA/GDPR), retention
- "general"           — newsroom digital security broadly, not fitting one topic above

Rate relevance STRICTLY (0–1). Reserve 0.8+ for substantive material a newsroom security
lead would act on: original threat research, named incidents with detail, concrete how-to
guidance, tool reviews, or significant advisories. Score generic opinion, press releases,
vendor marketing, and unrelated tech/AI news BELOW 0.4 and mark relevant:false.

Set item_type to reflect WHAT it is:
  "report" (research/study), "advisory" (a security advisory/alert), "guide" (actionable how-to),
  "tool" (a product/service), "news" (an incident/announcement), "article" (analysis).

Return ONLY a JSON array, one object per input item IN ORDER:
[{"i":0,"relevant":true,"topic":"surveillance","item_type":"report","summary":"<=240 chars, factual, lead with the concrete finding/threat","relevance":0.0-1.0},
 {"i":1,"relevant":false}]`;

export async function triageDataSecurityPending({ limit = BATCH } = {}) {
  const { rows: items } = await pool.query(
    `SELECT id, title, content, url, author, published_at, source_id
       FROM content_raw_items
      WHERE domain = 'data-security' AND triage_status = 'pending'
      ORDER BY fetched_at ASC
      LIMIT $1`,
    [limit]
  );
  if (items.length === 0) return { triaged: 0, promoted: 0, rejected: 0 };

  const results = await classifyInChunks({
    system: SYSTEM,
    items,
    buildUserContent: (slice) => '# Items\n' + slice.map((it, i) =>
      `## ${i}\nTitle: ${it.title || '(none)'}\nText: ${(it.content || '').slice(0, 1200)}`
    ).join('\n\n'),
    perItemOutTokens: 180,
    temperature: TEMP,
    label: 'data-security-triage',
  });

  let promoted = 0, rejected = 0, triaged = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = results[i];
    if (!r) continue;   // chunk failed → leave pending, retry next run
    triaged++;
    const validTopic = TOPICS.includes(r.topic);
    if (r.relevant && validTopic) {
      const src = await pool.query('SELECT name FROM content_sources WHERE id = $1', [it.source_id]);
      const sourceName = src.rows[0]?.name || null;
      const ins = await pool.query(
        `INSERT INTO data_security_items
           (raw_item_id, topic, item_type, title, summary, url, source_name, author, published_at, relevance, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'review') RETURNING id`,
        [it.id, r.topic, (r.item_type || 'article').slice(0, 30), (it.title || 'Untitled').slice(0, 500),
         (r.summary || '').slice(0, 1000), it.url, sourceName, it.author, it.published_at,
         Number.isFinite(r.relevance) ? r.relevance : 0.5]
      );
      await pool.query(
        `UPDATE content_raw_items SET triage_status='promoted', triage_result=$1::jsonb, triaged_at=NOW(), promoted_id=$2 WHERE id=$3`,
        [JSON.stringify(r), ins.rows[0].id, it.id]
      );
      promoted++;
    } else {
      await pool.query(
        `UPDATE content_raw_items SET triage_status='rejected', triage_result=$1::jsonb, triaged_at=NOW() WHERE id=$2`,
        [JSON.stringify(r), it.id]
      );
      rejected++;
    }
  }
  return { triaged, promoted, rejected };
}
