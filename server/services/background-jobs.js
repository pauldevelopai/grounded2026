import pool from '../db/pool.js';
import { draftSocialPost, draftColdEmail, researchIndustryTrends, generateBusinessSummary, analyseFeedbackTrends, classifyNewsletterContent, generateDailyDigest } from './claude.js';
import { searchEmails, readEmail, getLabelId, getConnectionStatus } from './gmail.js';
import { createKnowledgeEntry } from './knowledge.js';
import { generateEmbedding, toPgVector } from './embeddings.js';

// Helper: create a notification for all admin users (broadcast)
async function notify(type, title, message, link = null) {
  await pool.query(
    'INSERT INTO notifications (type, title, message, link) VALUES ($1, $2, $3, $4)',
    [type, title, message, link]
  );
}

// ── 1. Follow-Up Monitor ──────────────────────────────────────────────
export async function runFollowUpMonitor() {
  const items = [];

  // Stale contacts (not contacted in 14+ days, active pipeline)
  const { rows: staleContacts } = await pool.query(`
    SELECT c.first_name, c.last_name, c.pipeline_stage, c.last_contacted_at, o.name AS org_name
    FROM contacts c LEFT JOIN organisations o ON c.organisation_id = o.id
    WHERE c.pipeline_stage IN ('contacted', 'meeting', 'proposal')
    AND (c.last_contacted_at IS NULL OR c.last_contacted_at < NOW() - INTERVAL '14 days')
    ORDER BY c.last_contacted_at NULLS FIRST LIMIT 20
  `);
  for (const c of staleContacts) {
    items.push(`Follow up: ${c.first_name} ${c.last_name} (${c.org_name || 'no org'}) — ${c.pipeline_stage}, last contact ${c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString() : 'never'}`);
  }

  // Funding deadlines within 7 days
  const { rows: deadlines } = await pool.query(`
    SELECT fo.title, fo.deadline, f.name AS funder_name, fo.id
    FROM funding_opportunities fo LEFT JOIN funders f ON fo.funder_id = f.id
    WHERE fo.deadline BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    AND fo.pipeline_stage NOT IN ('won', 'lost', 'expired')
    ORDER BY fo.deadline
  `);
  for (const d of deadlines) {
    items.push(`Funding deadline: ${d.title} (${d.funder_name || 'Unknown funder'}) — due ${new Date(d.deadline).toLocaleDateString()}`);
    await notify('alert', `Funding deadline: ${d.title}`, `Due ${new Date(d.deadline).toLocaleDateString()}`, `/fundraising/opportunities/${d.id}`);
  }

  // Outreach sent 7+ days ago with no reply
  const { rows: noReply } = await pool.query(`
    SELECT om.subject, c.first_name, c.last_name, om.sent_at
    FROM outreach_messages om JOIN contacts c ON om.contact_id = c.id
    WHERE om.status = 'sent' AND om.sent_at < NOW() - INTERVAL '7 days'
    ORDER BY om.sent_at LIMIT 10
  `);
  for (const m of noReply) {
    items.push(`No reply: ${m.first_name} ${m.last_name} — "${m.subject}" sent ${new Date(m.sent_at).toLocaleDateString()}`);
  }

  const summary = items.length > 0
    ? `Found ${items.length} items needing attention:\n\n${items.map(i => `- ${i}`).join('\n')}`
    : 'All clear — no stale contacts, upcoming deadlines, or pending follow-ups.';

  if (staleContacts.length > 0) {
    await notify('reminder', `${staleContacts.length} contacts need follow-up`, `${staleContacts.length} contacts haven't been contacted in 14+ days`, '/contacts');
  }

  return { result: summary, itemsProcessed: items.length };
}

// ── 2. Content Generator ──────────────────────────────────────────────
export async function runContentGenerator() {
  let itemsProcessed = 0;
  const results = [];

  // Get active sectors
  const { rows: sectors } = await pool.query("SELECT id, name FROM sectors WHERE is_active = true");

  // Generate max 3 social posts total per day, rotating across sectors
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Check how many were already generated today
  const { rows: [{ count: todayCount }] } = await pool.query(
    `SELECT count(*)::int AS count FROM social_posts WHERE ai_generated = true AND created_at::date = $1::date`,
    [today]
  );

  const remainingSlots = Math.max(0, 3 - parseInt(todayCount));
  if (remainingSlots === 0) {
    results.push('Already generated 3 posts today — skipping');
  }

  // Collect topic ideas from recent intelligence across all sectors
  const { rows: recentIntel } = await pool.query(
    `SELECT title, sector_id FROM industry_intelligence WHERE is_actionable = true ORDER BY created_at DESC LIMIT 10`
  );

  const platforms = ['linkedin', 'linkedin', 'twitter'];
  let postsMade = 0;

  for (let i = 0; i < remainingSlots && i < platforms.length; i++) {
    // Alternate sectors
    const sector = sectors[i % sectors.length];
    try {
      const topic = recentIntel[i]?.title || `Latest AI developments and practical applications for the ${sector.name} sector`;
      const content = await draftSocialPost(sector.name, platforms[i], topic);

      // Schedule for today at 9am
      const scheduledDate = new Date(now);
      scheduledDate.setHours(9, 0, 0, 0);

      await pool.query(
        `INSERT INTO social_posts (sector_id, platform, content, status, scheduled_for, ai_generated)
         VALUES ($1, $2, $3, 'draft', $4, true)`,
        [sector.id, platforms[i], content, scheduledDate]
      );
      postsMade++;
      itemsProcessed++;
      results.push(`Generated ${platforms[i]} post for ${sector.name} (${today})`);
    } catch (err) {
      results.push(`Failed to generate post for ${sector.name}: ${err.message}`);
    }
  }

  // Draft emails for active campaigns with un-emailed contacts
  const { rows: campaigns } = await pool.query(`
    SELECT oc.id, oc.name, oc.target_audience, oc.sector_id, s.name AS sector_name
    FROM outreach_campaigns oc JOIN sectors s ON oc.sector_id = s.id
    WHERE oc.status = 'active' LIMIT 3
  `);

  for (const campaign of campaigns) {
    // Find contacts in this sector not yet emailed in this campaign
    const { rows: contacts } = await pool.query(`
      SELECT c.id, c.first_name, c.last_name, c.job_title, o.name AS org_name
      FROM contacts c LEFT JOIN organisations o ON c.organisation_id = o.id
      WHERE c.sector_id = $1
      AND c.id NOT IN (SELECT contact_id FROM outreach_messages WHERE campaign_id = $2)
      AND c.pipeline_stage IN ('prospect', 'contacted')
      LIMIT 3
    `, [campaign.sector_id, campaign.id]);

    for (const contact of contacts) {
      try {
        const { subject, body } = await draftColdEmail(
          `${contact.first_name} ${contact.last_name}`, contact.job_title,
          contact.org_name, campaign.sector_name, campaign.target_audience
        );
        await pool.query(
          `INSERT INTO outreach_messages (campaign_id, contact_id, channel, subject, body, status)
           VALUES ($1, $2, 'email', $3, $4, 'draft')`,
          [campaign.id, contact.id, subject, body]
        );
        itemsProcessed++;
        results.push(`Drafted email for ${contact.first_name} ${contact.last_name} (${campaign.name})`);
      } catch (err) {
        results.push(`Failed to draft email: ${err.message}`);
      }
    }
  }

  const summary = results.length > 0
    ? `Generated ${itemsProcessed} items:\n\n${results.map(r => `- ${r}`).join('\n')}`
    : 'No content generated — no active sectors or campaigns.';

  if (itemsProcessed > 0) {
    await notify('job_complete', `Content generated: ${itemsProcessed} items`, summary, '/marketing/social');
  }

  return { result: summary, itemsProcessed };
}

// ── 3. Industry Researcher ────────────────────────────────────────────
export async function runIndustryResearcher() {
  const results = [];
  let itemsProcessed = 0;
  let intelligenceCreated = 0;

  const { rows: sectors } = await pool.query("SELECT id, name FROM sectors WHERE is_active = true");

  for (const sector of sectors) {
    try {
      const { rows: courses } = await pool.query('SELECT title FROM courses WHERE sector_id = $1', [sector.id]);
      const currentTopics = courses.map(c => c.title).join(', ');
      const research = await researchIndustryTrends(sector.name, currentTopics);
      results.push(`## ${sector.name} Sector\n\n${research}`);
      itemsProcessed++;

      // Parse research into structured intelligence items using sections
      const sections = research.split(/^## /m).filter(Boolean);
      for (const section of sections) {
        const lines = section.trim().split('\n');
        const sectionTitle = lines[0]?.trim();
        const sectionContent = lines.slice(1).join('\n').trim();
        if (!sectionTitle || !sectionContent) continue;

        // Extract bullet points as individual items
        const bullets = sectionContent.split(/^[-*] /m).filter(b => b.trim().length > 20);
        for (const bullet of bullets.slice(0, 5)) { // max 5 per section
          const itemTitle = bullet.split('.')[0]?.trim().slice(0, 200) || sectionTitle;
          const itemSummary = bullet.trim().slice(0, 500);

          // Determine category from section title
          let category = 'training_trend';
          if (/tool|platform|software/i.test(sectionTitle)) category = 'ai_tool';
          if (/regulat|compliance|law|legal/i.test(sectionTitle)) category = 'regulation';
          if (/technique|method|approach/i.test(sectionTitle)) category = 'technique';
          if (/framework|standard/i.test(sectionTitle)) category = 'framework';
          if (/use case|application/i.test(sectionTitle)) category = 'use_case';

          const relevanceScore = bullet.length > 100 ? 0.7 : 0.5;

          await pool.query(
            `INSERT INTO industry_intelligence (sector_id, category, title, summary, source, relevance_score, is_actionable)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [sector.id, category, itemTitle, itemSummary, 'background_job:industry_researcher', relevanceScore, relevanceScore >= 0.7]
          );
          intelligenceCreated++;

          // High-relevance items also become knowledge entries
          if (relevanceScore >= 0.7) {
            await createKnowledgeEntry({
              category: 'industry_trend',
              subcategory: category,
              title: itemTitle,
              content: itemSummary,
              sectorId: sector.id,
              sourceType: 'background_job',
              sourceDescription: 'Industry researcher - auto-discovered',
              confidence: 0.6,
              tags: [category, sector.name.toLowerCase()],
            });
          }
        }
      }
    } catch (err) {
      results.push(`## ${sector.name} Sector\n\nFailed: ${err.message}`);
    }
  }

  const summary = results.join('\n\n---\n\n');

  if (itemsProcessed > 0) {
    await notify('job_complete',
      `Industry research: ${intelligenceCreated} items discovered`,
      `Researched ${itemsProcessed} sector${itemsProcessed > 1 ? 's' : ''}, found ${intelligenceCreated} intelligence items. ${intelligenceCreated > 0 ? 'Review in Intelligence page.' : ''}`,
      '/intelligence'
    );
  }

  return { result: summary, itemsProcessed };
}

// ── 4. Business Digest ────────────────────────────────────────────────
export async function runBusinessDigest() {
  // Query yesterday's activity
  const yesterday = "NOW() - INTERVAL '24 hours'";

  const [newContacts, newAssessments, emailsSent, docsGenerated, cohortActivity] = await Promise.all([
    pool.query(`SELECT count(*)::int as c FROM contacts WHERE created_at > ${yesterday}`),
    pool.query(`SELECT count(*)::int as c FROM needs_assessments WHERE analysed_at > ${yesterday}`),
    pool.query(`SELECT count(*)::int as c FROM outreach_messages WHERE sent_at > ${yesterday}`),
    pool.query(`SELECT count(*)::int as c FROM generated_documents WHERE created_at > ${yesterday}`),
    pool.query(`SELECT count(*)::int as c FROM cohorts WHERE status = 'active'`),
  ]);

  // Upcoming items
  const { rows: upcomingDeadlines } = await pool.query(`
    SELECT title, deadline FROM funding_opportunities
    WHERE deadline BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    AND pipeline_stage NOT IN ('won','lost','expired')
    ORDER BY deadline LIMIT 5
  `);

  const stats = {
    contacts: newContacts.rows[0].c,
    activeCohorts: cohortActivity.rows[0].c,
    pendingAssessments: 0,
    newContactsYesterday: newContacts.rows[0].c,
    assessmentsAnalysed: newAssessments.rows[0].c,
    emailsSent: emailsSent.rows[0].c,
    documentsGenerated: docsGenerated.rows[0].c,
    upcomingDeadlines: upcomingDeadlines.map(d => `${d.title} (${new Date(d.deadline).toLocaleDateString()})`).join(', '),
  };

  const enrichedPrompt = `Business activity in the last 24 hours:
- New contacts added: ${stats.newContactsYesterday}
- Assessments analysed: ${stats.assessmentsAnalysed}
- Outreach emails sent: ${stats.emailsSent}
- Documents generated: ${stats.documentsGenerated}
- Active cohorts: ${stats.activeCohorts}
${upcomingDeadlines.length > 0 ? `- Upcoming funding deadlines: ${stats.upcomingDeadlines}` : '- No upcoming funding deadlines'}

What should the team focus on today?`;

  const summary = await generateBusinessSummary({ ...stats, customPrompt: enrichedPrompt }, 'all sectors');

  await notify('digest', 'Daily Business Digest', summary, '/');

  return { result: summary, itemsProcessed: 1 };
}

// ── 5. Curriculum Health Check ────────────────────────────────────────
export async function runCurriculumHealthCheck() {
  const results = [];
  let itemsProcessed = 0;

  const { rows: sectors } = await pool.query("SELECT id, name FROM sectors WHERE is_active = true");

  for (const sector of sectors) {
    const { rows: courses } = await pool.query(
      'SELECT title, effectiveness_score FROM courses WHERE sector_id = $1', [sector.id]
    );
    const { rows: modules } = await pool.query(
      `SELECT cm.title, cm.effectiveness_rating, cm.feedback_notes, c.title AS course_title
       FROM course_modules cm JOIN courses c ON cm.course_id = c.id
       WHERE c.sector_id = $1 ORDER BY c.title, cm.order_index`,
      [sector.id]
    );

    if (courses.length === 0 && modules.length === 0) continue;

    try {
      const analysis = await analyseFeedbackTrends(courses, modules, sector.name);
      results.push(`## ${sector.name} Sector\n\n${analysis}`);
      itemsProcessed++;

      // Check for critically low-rated modules
      const critical = modules.filter(m => m.effectiveness_rating && m.effectiveness_rating <= 2);
      if (critical.length > 0) {
        await notify('alert', `${critical.length} module${critical.length > 1 ? 's' : ''} need urgent review (${sector.name})`,
          critical.map(m => `${m.course_title} → ${m.title} (${m.effectiveness_rating}/5)`).join('\n'),
          '/curriculum'
        );
      }
    } catch (err) {
      results.push(`## ${sector.name} Sector\n\nFailed: ${err.message}`);
    }
  }

  const summary = results.length > 0
    ? results.join('\n\n---\n\n')
    : 'No curriculum data to analyse yet.';

  if (itemsProcessed > 0) {
    await notify('job_complete', 'Curriculum health check complete', `Analysed ${itemsProcessed} sector${itemsProcessed > 1 ? 's' : ''}. Check job history for full results.`, '/curriculum');
  }

  return { result: summary, itemsProcessed };
}

// Job registry — maps job name to function
// ── 6. Knowledge Consolidator ──────────────────────────────────────────
export async function runKnowledgeConsolidator() {
  let itemsProcessed = 0;
  const results = [];

  try {
  // 1. Boost confidence for knowledge used in accepted outputs
  const { rowCount: boosted } = await pool.query(`
    UPDATE knowledge_entries SET confidence = LEAST(confidence + 0.05, 1.0), updated_at = NOW()
    WHERE id IN (
      SELECT UNNEST(knowledge_ids_used) FROM ai_interactions
      WHERE was_used = true AND created_at > NOW() - INTERVAL '7 days'
    )
  `);
  results.push(`Boosted confidence for ${boosted} entries used in accepted outputs`);
  itemsProcessed += boosted;

  // 2. Decrease confidence for knowledge used in rejected outputs
  const { rowCount: decreased } = await pool.query(`
    UPDATE knowledge_entries SET confidence = GREATEST(confidence - 0.03, 0.0), updated_at = NOW()
    WHERE id IN (
      SELECT UNNEST(knowledge_ids_used) FROM ai_interactions
      WHERE was_used = false AND created_at > NOW() - INTERVAL '7 days'
    )
  `);
  results.push(`Decreased confidence for ${decreased} entries used in rejected outputs`);
  itemsProcessed += decreased;

  // 3. Deactivate very low confidence entries
  const { rowCount: deactivated } = await pool.query(`
    UPDATE knowledge_entries SET is_active = false, updated_at = NOW()
    WHERE confidence < 0.1 AND is_active = true AND is_verified = false
  `);
  if (deactivated > 0) results.push(`Deactivated ${deactivated} low-confidence entries`);

  // 4. Expire old entries
  const { rowCount: expired } = await pool.query(`
    UPDATE knowledge_entries SET is_active = false, updated_at = NOW()
    WHERE expires_at < NOW() AND is_active = true
  `);
  if (expired > 0) results.push(`Expired ${expired} time-limited entries`);

  // 5. Flag high-confidence entries for verification
  const { rowCount: flagged } = await pool.query(`
    SELECT COUNT(*)::int AS c FROM knowledge_entries
    WHERE confidence >= 0.85 AND usage_count >= 3 AND is_verified = false AND is_active = true
  `);
  if (flagged > 0) results.push(`${flagged} high-confidence entries ready for human verification`);

  const summary = results.join('\n');

  await notify('job_complete',
    `Knowledge consolidated: ${itemsProcessed} entries updated`,
    summary,
    '/knowledge'
  );

  return { result: summary, itemsProcessed };
  } catch (err) {
    console.error('[KnowledgeConsolidator] Error:', err.message);
    return { result: `Knowledge consolidation failed: ${err.message}`, itemsProcessed };
  }
}

// ── 7. Newsletter Digest ───────────────────────────────────────────────
export async function runNewsletterDigest() {
  let itemsProcessed = 0;
  let curriculumItems = 0;
  const allItems = [];

  // Check Gmail connection
  const gmailStatus = await getConnectionStatus();
  if (!gmailStatus.connected) {
    return { result: 'Gmail not connected. Connect Gmail in Settings first.', itemsProcessed: 0 };
  }

  // Get configured category/label (default: Gmail "Forums" category tab)
  const LABEL_NAME = process.env.NEWSLETTER_LABEL || 'CATEGORY_FORUMS';

  // Get active sectors for classification
  const { rows: sectors } = await pool.query("SELECT name FROM sectors WHERE is_active = true");
  const sectorNames = sectors.map(s => s.name);

  // Search for emails in the Forums category from TODAY only
  // Use after:YYYY/MM/DD to limit to today's emails, avoiding re-fetching old ones
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  const categoryFilter = LABEL_NAME.startsWith('CATEGORY_')
    ? `category:${LABEL_NAME.replace('CATEGORY_', '').toLowerCase()}`
    : `label:${LABEL_NAME}`;
  const searchQuery = `${categoryFilter} after:${dateStr}`;
  const messages = await searchEmails(searchQuery, 30);

  for (const msg of messages) {
    // Skip if already processed
    const { rows: existing } = await pool.query(
      'SELECT id FROM newsletter_items WHERE gmail_message_id = $1', [msg.id]
    );
    if (existing.length > 0) continue;

    try {
      const email = await readEmail(msg.id);
      if (!email.body || email.body.length < 50) continue;

      // Classify with Claude
      const classified = await classifyNewsletterContent(email.body, sectorNames);

      for (const item of classified) {
        await pool.query(
          `INSERT INTO newsletter_items (gmail_message_id, sender, subject, received_at, raw_text, summary, source_url, category, is_curriculum_relevant, curriculum_relevance_reason, relevant_sectors, digest_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_DATE)
           ON CONFLICT (gmail_message_id) DO NOTHING`,
          [msg.id, email.from, email.subject, email.date ? new Date(email.date) : new Date(),
           email.body.slice(0, 5000), item.summary, item.source_url || null, item.category,
           item.is_curriculum_relevant || false, item.curriculum_relevance_reason || null,
           item.relevant_sectors || []]
        );
        allItems.push(item);
        itemsProcessed++;

        // Curriculum-relevant items also go to industry_intelligence
        if (item.is_curriculum_relevant) {
          curriculumItems++;
          const sectorId = sectors.find(s => item.relevant_sectors?.includes(s.name));
          // Find sector ID
          let sId = null;
          if (item.relevant_sectors?.length > 0) {
            const { rows: sRows } = await pool.query(
              "SELECT id FROM sectors WHERE name = ANY($1) LIMIT 1", [item.relevant_sectors]
            );
            sId = sRows[0]?.id || null;
          }

          await pool.query(
            `INSERT INTO industry_intelligence (sector_id, category, title, summary, source, relevance_score, is_actionable)
             VALUES ($1, $2, $3, $4, $5, $6, true)`,
            [sId, item.category, item.title, item.summary + (item.curriculum_relevance_reason ? '\n\nCurriculum impact: ' + item.curriculum_relevance_reason : ''),
             `Newsletter: ${email.from}`, 0.7]
          );
        }
      }
    } catch (err) {
      console.error(`Failed to process newsletter ${msg.id}:`, err.message);
    }
  }

  // Generate daily digest
  let digestText = `Processed ${itemsProcessed} items from ${messages.length} newsletters.`;
  if (allItems.length > 0) {
    try {
      digestText = await generateDailyDigest(allItems);
    } catch (err) {
      console.error('Failed to generate digest:', err.message);
    }
  }

  // Mark items as digested
  await pool.query("UPDATE newsletter_items SET is_digested = true WHERE digest_date = CURRENT_DATE");

  // Save digest to archive
  if (allItems.length > 0) {
    await pool.query(
      `INSERT INTO newsletter_digests (digest_date, content, item_count, curriculum_count)
       VALUES (CURRENT_DATE, $1, $2, $3)
       ON CONFLICT (digest_date) DO UPDATE SET
         content = EXCLUDED.content, item_count = EXCLUDED.item_count,
         curriculum_count = EXCLUDED.curriculum_count, updated_at = NOW()`,
      [digestText, itemsProcessed, curriculumItems]
    );
  }

  // Create digest notification
  await notify('digest',
    `Newsletter Digest: ${itemsProcessed} items${curriculumItems > 0 ? ` (${curriculumItems} curriculum-relevant)` : ''}`,
    digestText,
    '/newsletter'
  );

  return { result: digestText, itemsProcessed };
}

// ── 8. Embedding Backfill ──────────────────────────────────────────────
export async function runEmbeddingBackfill() {
  let processed = 0;

  // Knowledge entries without embeddings
  const { rows: knowledgeRows } = await pool.query(
    'SELECT id, title, content FROM knowledge_entries WHERE embedding IS NULL AND is_active = true'
  );
  for (const entry of knowledgeRows) {
    const text = `${entry.title}. ${entry.content}`.slice(0, 2000);
    const embedding = await generateEmbedding(text);
    if (embedding) {
      await pool.query('UPDATE knowledge_entries SET embedding = $1 WHERE id = $2', [toPgVector(embedding), entry.id]);
      processed++;
    }
  }

  // Industry intelligence without embeddings
  const { rows: intelRows } = await pool.query(
    'SELECT id, title, summary FROM industry_intelligence WHERE embedding IS NULL'
  );
  for (const entry of intelRows) {
    const text = `${entry.title}. ${entry.summary || ''}`.slice(0, 2000);
    const embedding = await generateEmbedding(text);
    if (embedding) {
      await pool.query('UPDATE industry_intelligence SET embedding = $1 WHERE id = $2', [toPgVector(embedding), entry.id]);
      processed++;
    }
  }

  return { result: `Embedded ${processed} entries (${knowledgeRows.length} knowledge + ${intelRows.length} intelligence)`, itemsProcessed: processed };
}

// ── 9. Knowledge Sync — Ingest data from across the app into knowledge base ──
export async function runKnowledgeSync() {
  let itemsProcessed = 0;
  const results = [];

  try {
    // 1. Sync organisation data → client_insight entries
    const { rows: orgs } = await pool.query(`
      SELECT o.id, o.name, o.type, o.country, o.city, o.notes, o.relationship_stage, o.programme_name,
        s.name AS sector_name, fo.name AS funder_name,
        (SELECT count(*)::int FROM contacts c WHERE c.organisation_id = o.id) AS contact_count
      FROM organisations o
      LEFT JOIN sectors s ON o.sector_id = s.id
      LEFT JOIN organisations fo ON o.funder_organisation_id = fo.id
    `);

    for (const org of orgs) {
      // Check if we already have a knowledge entry for this org
      const { rows: existing } = await pool.query(
        "SELECT id FROM knowledge_entries WHERE organisation_id = $1 AND category = 'client_insight' AND subcategory = 'org_profile'",
        [org.id]
      );

      const content = [
        `${org.name} is a ${org.type || 'organisation'} in the ${org.sector_name || 'unknown'} sector.`,
        org.country ? `Location: ${[org.city, org.country].filter(Boolean).join(', ')}` : '',
        org.programme_name ? `Programme: ${org.programme_name}` : '',
        org.funder_name ? `Funded by: ${org.funder_name}` : '',
        org.relationship_stage ? `Relationship: ${org.relationship_stage}` : '',
        `Contacts: ${org.contact_count}`,
        org.notes ? `Notes: ${org.notes.slice(0, 500)}` : '',
      ].filter(Boolean).join('\n');

      if (existing.length > 0) {
        await pool.query(
          'UPDATE knowledge_entries SET content = $1, updated_at = NOW() WHERE id = $2',
          [content, existing[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO knowledge_entries (category, subcategory, title, content, sector_id, organisation_id, source_type, source_description, confidence, is_verified)
           VALUES ('client_insight', 'org_profile', $1, $2, $3, $4, 'system_sync', 'Auto-synced from organisation data', 0.9, true)`,
          [`${org.name} — organisation profile`, content, org.sector_id || null, org.id]
        );
        itemsProcessed++;
      }
    }
    results.push(`Synced ${orgs.length} organisations (${itemsProcessed} new entries)`);

    // 2. Sync course data → course_outcome entries
    const prevProcessed = itemsProcessed;
    const { rows: courses } = await pool.query(`
      SELECT c.id, c.title, c.description, c.delivery_type, c.version, c.status, c.effectiveness_score,
        s.name AS sector_name, c.sector_id,
        (SELECT count(*)::int FROM course_modules cm WHERE cm.course_id = c.id) AS module_count,
        (SELECT string_agg(cm.title, ', ' ORDER BY cm.order_index) FROM course_modules cm WHERE cm.course_id = c.id) AS module_titles
      FROM courses c LEFT JOIN sectors s ON c.sector_id = s.id
    `);

    for (const course of courses) {
      const { rows: existing } = await pool.query(
        "SELECT id FROM knowledge_entries WHERE course_id = $1 AND category = 'course_outcome' AND subcategory = 'course_profile'",
        [course.id]
      );

      const content = [
        `Course: ${course.title} (${course.delivery_type}, ${course.version}, ${course.status})`,
        `Sector: ${course.sector_name || 'unknown'}`,
        course.description ? `Description: ${course.description}` : '',
        `Modules (${course.module_count}): ${course.module_titles || 'None'}`,
        course.effectiveness_score ? `Effectiveness: ${course.effectiveness_score}/5` : '',
      ].filter(Boolean).join('\n');

      if (existing.length > 0) {
        await pool.query('UPDATE knowledge_entries SET content = $1, updated_at = NOW() WHERE id = $2', [content, existing[0].id]);
      } else {
        await pool.query(
          `INSERT INTO knowledge_entries (category, subcategory, title, content, sector_id, course_id, source_type, source_description, confidence, is_verified)
           VALUES ('course_outcome', 'course_profile', $1, $2, $3, $4, 'system_sync', 'Auto-synced from course data', 0.9, true)`,
          [`${course.title} — course profile`, content, course.sector_id, course.id]
        );
        itemsProcessed++;
      }
    }
    results.push(`Synced ${courses.length} courses (${itemsProcessed - prevProcessed} new entries)`);

    // 3. Sync cohort data → programme_delivery entries
    const prevProcessed2 = itemsProcessed;
    const { rows: cohorts } = await pool.query(`
      SELECT ch.id, ch.name, ch.status, ch.delivery_type, ch.start_date, ch.end_date,
        co.name AS client_name, s.name AS sector_name, ch.sector_id,
        (SELECT count(*)::int FROM cohort_organisations corg WHERE corg.cohort_id = ch.id) AS org_count
      FROM cohorts ch
      LEFT JOIN organisations co ON ch.client_organisation_id = co.id
      LEFT JOIN sectors s ON ch.sector_id = s.id
    `);

    for (const cohort of cohorts) {
      const { rows: existing } = await pool.query(
        "SELECT id FROM knowledge_entries WHERE title LIKE $1 AND category = 'course_outcome' AND subcategory = 'cohort_profile'",
        [`${cohort.name}%`]
      );

      const content = [
        `Cohort: ${cohort.name} (${cohort.status})`,
        cohort.client_name ? `Client/Funder: ${cohort.client_name}` : 'Self-funded',
        `Sector: ${cohort.sector_name || 'unknown'}`,
        `Delivery: ${cohort.delivery_type}`,
        `Organisations: ${cohort.org_count}`,
        cohort.start_date ? `Dates: ${cohort.start_date} to ${cohort.end_date || 'ongoing'}` : '',
      ].filter(Boolean).join('\n');

      if (existing.length > 0) {
        await pool.query('UPDATE knowledge_entries SET content = $1, updated_at = NOW() WHERE id = $2', [content, existing[0].id]);
      } else {
        await pool.query(
          `INSERT INTO knowledge_entries (category, subcategory, title, content, sector_id, source_type, source_description, confidence, is_verified)
           VALUES ('course_outcome', 'cohort_profile', $1, $2, $3, 'system_sync', 'Auto-synced from cohort data', 0.9, true)`,
          [`${cohort.name} — cohort profile`, content, cohort.sector_id]
        );
        itemsProcessed++;
      }
    }
    results.push(`Synced ${cohorts.length} cohorts (${itemsProcessed - prevProcessed2} new entries)`);

    // 4. Sync learning journey progress → learner_progress entries
    const prevProcessed3 = itemsProcessed;
    const { rows: journeys } = await pool.query(`
      SELECT lj.id, lj.contact_id, lj.skill_level, lj.overall_progress, lj.status, lj.last_activity_at,
        c.first_name, c.last_name, c.job_title, o.name AS org_name, s.name AS sector_name, lj.sector_id,
        (SELECT count(*)::int FROM learning_tasks lt WHERE lt.contact_id = lj.contact_id) AS total_tasks,
        (SELECT count(*)::int FROM learning_tasks lt WHERE lt.contact_id = lj.contact_id AND lt.status = 'approved') AS completed_tasks,
        (SELECT ROUND(AVG(lt.review_score)::numeric, 1) FROM learning_tasks lt WHERE lt.contact_id = lj.contact_id AND lt.review_score IS NOT NULL) AS avg_score
      FROM learning_journeys lj
      LEFT JOIN contacts c ON lj.contact_id = c.id
      LEFT JOIN organisations o ON lj.organisation_id = o.id
      LEFT JOIN sectors s ON lj.sector_id = s.id
    `);

    for (const j of journeys) {
      const { rows: existing } = await pool.query(
        "SELECT id FROM knowledge_entries WHERE title LIKE $1 AND category = 'client_insight' AND subcategory = 'learner_progress'",
        [`${j.first_name} ${j.last_name}%`]
      );

      const content = [
        `Learner: ${j.first_name} ${j.last_name}${j.job_title ? ` (${j.job_title})` : ''}`,
        `Organisation: ${j.org_name || 'unknown'}`,
        `Skill level: ${j.skill_level}`,
        `Progress: ${j.overall_progress}% (${j.completed_tasks}/${j.total_tasks} tasks completed)`,
        j.avg_score ? `Average task score: ${j.avg_score}/5` : '',
        `Last active: ${j.last_activity_at ? new Date(j.last_activity_at).toLocaleDateString() : 'never'}`,
        `Status: ${j.status}`,
      ].filter(Boolean).join('\n');

      if (existing.length > 0) {
        await pool.query('UPDATE knowledge_entries SET content = $1, updated_at = NOW() WHERE id = $2', [content, existing[0].id]);
      } else {
        await pool.query(
          `INSERT INTO knowledge_entries (category, subcategory, title, content, sector_id, organisation_id, source_type, source_description, confidence, is_verified)
           VALUES ('client_insight', 'learner_progress', $1, $2, $3, $4, 'system_sync', 'Auto-synced from learning journey', 0.85, true)`,
          [`${j.first_name} ${j.last_name} — learning progress`, content, j.sector_id, null]
        );
        itemsProcessed++;
      }
    }
    results.push(`Synced ${journeys.length} learner journeys (${itemsProcessed - prevProcessed3} new entries)`);

    // 5. Sync assessment insights
    const prevProcessed4 = itemsProcessed;
    const { rows: assessments } = await pool.query(`
      SELECT na.id, na.status, na.ai_analysis, na.recommended_tier,
        o.name AS org_name, s.name AS sector_name, na.sector_id
      FROM needs_assessments na
      LEFT JOIN organisations o ON na.organisation_id = o.id
      LEFT JOIN sectors s ON na.sector_id = s.id
      WHERE na.ai_analysis IS NOT NULL
    `);

    for (const a of assessments) {
      const { rows: existing } = await pool.query(
        "SELECT id FROM knowledge_entries WHERE title LIKE $1 AND category = 'assessment_insight'",
        [`${a.org_name || 'Assessment'}%`]
      );

      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO knowledge_entries (category, subcategory, title, content, sector_id, source_type, source_description, confidence, is_verified)
           VALUES ('assessment_insight', 'analysis', $1, $2, $3, 'system_sync', 'Auto-synced from needs assessment', 0.85, true)`,
          [`${a.org_name || 'Organisation'} — needs assessment`, a.ai_analysis.slice(0, 2000), a.sector_id]
        );
        itemsProcessed++;
      }
    }
    results.push(`Synced ${assessments.length} assessments (${itemsProcessed - prevProcessed4} new entries)`);

    const summary = results.join('\n');

    await notify('job_complete',
      `Knowledge sync: ${itemsProcessed} new entries from app data`,
      summary,
      '/knowledge'
    );

    return { result: summary, itemsProcessed };
  } catch (err) {
    console.error('[KnowledgeSync] Error:', err.message);
    return { result: `Knowledge sync failed: ${err.message}`, itemsProcessed };
  }
}

export const JOB_REGISTRY = {
  follow_up_monitor: runFollowUpMonitor,
  content_generator: runContentGenerator,
  industry_researcher: runIndustryResearcher,
  business_digest: runBusinessDigest,
  curriculum_health_check: runCurriculumHealthCheck,
  knowledge_consolidator: runKnowledgeConsolidator,
  newsletter_digest: runNewsletterDigest,
  embedding_backfill: runEmbeddingBackfill,
  knowledge_sync: runKnowledgeSync,
  lead_miner: runLeadMiner,
};

// Lead Miner — scans Gmail for potential leads and organisations
export async function runLeadMiner() {
  let itemsProcessed = 0;
  const results = [];

  const connected = await getConnectionStatus();
  if (!connected) return { result: 'Gmail not connected', itemsProcessed: 0 };

  // Get existing contacts and orgs to avoid duplicates
  const { rows: existingEmails } = await pool.query('SELECT LOWER(email) AS email FROM contacts WHERE email IS NOT NULL');
  const knownEmails = new Set(existingEmails.map(e => e.email));

  const { rows: existingOrgs } = await pool.query('SELECT LOWER(name) AS name FROM organisations');
  const knownOrgs = new Set(existingOrgs.map(o => o.name));

  // Search for relevant email threads — journalism, legal, media, AI, training
  const searches = [
    'from:(-noreply -no-reply -notification -newsletter -substack -beehiiv) subject:(journalism OR newsroom OR media) newer_than:90d',
    'from:(-noreply -no-reply -notification -newsletter -substack -beehiiv) subject:(legal OR law firm OR law society) newer_than:90d',
    'from:(-noreply -no-reply -notification -newsletter -substack -beehiiv) subject:(training OR workshop OR programme OR cohort) newer_than:90d',
    'from:(-noreply -no-reply -notification -newsletter -substack -beehiiv) subject:(AI OR artificial intelligence OR machine learning) newer_than:90d',
    'from:(-noreply -no-reply -notification -newsletter -substack -beehiiv) subject:(grant OR funding OR proposal) newer_than:90d',
  ];

  const discoveredContacts = new Map(); // email → {name, org, context}

  for (const query of searches) {
    try {
      const messages = await searchEmails(query, 20);
      console.log(`[LeadMiner] Search "${query.slice(0, 50)}..." → ${messages.length} messages`);
      for (const msg of messages) {
        try {
          const email = await readEmail(msg.id);
          if (!email) continue;

          // readEmail returns flat: { from, subject, date, body }
          const fromHeader = email.from || '';
          const fromMatch = fromHeader.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
          if (!fromMatch) {
            // Try simpler pattern: just email@domain.com
            const simpleMatch = fromHeader.match(/([\w.+-]+@[\w.-]+\.\w+)/);
            if (!simpleMatch) continue;
            const senderEmail = simpleMatch[1].toLowerCase();
            if (knownEmails.has(senderEmail) || senderEmail.includes('noreply') || senderEmail.includes('no-reply') || senderEmail.includes('paul@developai') || discoveredContacts.has(senderEmail)) continue;
            discoveredContacts.set(senderEmail, { name: fromHeader.replace(/<.*>/, '').trim() || senderEmail.split('@')[0], email: senderEmail, subject: email.subject || '', date: email.date || '' });
            continue;
          }

          const senderName = fromMatch[1].trim();
          const senderEmail = fromMatch[2].trim().toLowerCase();

          // Skip known contacts, generic addresses, and own email
          if (knownEmails.has(senderEmail)) continue;
          if (senderEmail.includes('noreply') || senderEmail.includes('no-reply') || senderEmail.includes('notification')) continue;
          if (senderEmail.includes('paul@developai') || senderEmail.includes('paulmcnally')) continue;
          if (discoveredContacts.has(senderEmail)) continue;

          discoveredContacts.set(senderEmail, {
            name: senderName,
            email: senderEmail,
            subject: email.subject || '',
            date: email.date || '',
          });
        } catch (e) { console.log(`[LeadMiner] Email read error: ${e.message}`); }
      }
    } catch (e) {
      console.log(`[LeadMiner] Search failed: ${e.message}`);
      results.push(`Search failed: ${e.message}`);
    }
  }

  console.log(`[LeadMiner] Discovered ${discoveredContacts.size} unique contacts`);

  if (discoveredContacts.size === 0) {
    return { result: 'No new potential leads found in recent emails', itemsProcessed: 0 };
  }

  // Use Claude to classify and prioritise the discovered contacts
  const contactList = Array.from(discoveredContacts.values())
    .slice(0, 50) // Cap at 50 to keep Claude prompt manageable
    .map((c, i) => `${i+1}. ${c.name} <${c.email}> — Subject: ${c.subject}`)
    .join('\n');

  const { rows: sectors } = await pool.query("SELECT name FROM sectors WHERE is_active = true");
  const sectorNames = sectors.map(s => s.name).join(', ');

  try {
    const analysis = await callClaudeRaw({
      system: `You are a business development analyst for Develop AI, which provides AI training, ethical AI policies, and legal frameworks for organisations in these sectors: ${sectorNames}.

Analyse these email contacts found in the inbox. For each one, determine:
1. Are they a potential lead for Develop AI's services? (yes/no)
2. What sector are they likely in? (${sectorNames} / unknown)
3. What type of organisation might they be from? (newsroom, law firm, NGO, foundation, government, academic, etc.)
4. How warm is this lead? (hot = direct conversation about services, warm = related topic discussed, cold = just a contact)

Output as JSON array: [{"email": "...", "name": "...", "is_lead": true/false, "sector": "...", "org_type": "...", "warmth": "hot/warm/cold", "reason": "one line why"}]

Only include contacts where is_lead is true. If none qualify, return [].`,
      userContent: `Contacts discovered from recent email threads:\n\n${contactList}`,
      maxTokens: 3000,
      temperature: 0.2,
    });

    // Parse Claude's response
    console.log(`[LeadMiner] Claude response length: ${analysis.length} chars`);
    let leads = [];
    try {
      const jsonMatch = analysis.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        leads = JSON.parse(jsonMatch[0]);
        console.log(`[LeadMiner] Claude classified ${leads.length} leads (${leads.filter(l => l.is_lead).length} qualified)`);
      } else {
        console.log(`[LeadMiner] No JSON array found in Claude response. First 200 chars: ${analysis.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[LeadMiner] JSON parse error: ${e.message}. First 200 chars: ${analysis.slice(0, 200)}`);
      results.push('Failed to parse Claude lead analysis');
    }

    // Get sector IDs
    const { rows: sectorRows } = await pool.query('SELECT id, name FROM sectors');
    const sectorMap = {};
    sectorRows.forEach(s => { sectorMap[s.name.toLowerCase()] = s.id; });

    // Insert qualified leads as prospect contacts
    console.log(`[LeadMiner] Processing ${leads.length} classified contacts...`);
    for (const lead of leads) {
      if (!lead.is_lead || !lead.email) { continue; }
      if (knownEmails.has(lead.email.toLowerCase())) { console.log(`[LeadMiner] Skip known: ${lead.email}`); continue; }

      const sectorId = sectorMap[lead.sector?.toLowerCase()] || sectorRows[0]?.id;
      const nameParts = (lead.name || '').split(' ');
      const firstName = nameParts[0] || lead.email.split('@')[0];
      const lastName = nameParts.slice(1).join(' ') || '';

      try {
        // Check if email already exists (no unique constraint on contacts.email)
        const { rows: dupes } = await pool.query('SELECT id FROM contacts WHERE LOWER(email) = $1', [lead.email.toLowerCase()]);
        if (dupes.length > 0) { console.log(`[LeadMiner] Skip dupe: ${lead.email}`); continue; }

        await pool.query(
          `INSERT INTO contacts (sector_id, first_name, last_name, email, pipeline_stage, source, tags, notes)
           VALUES ($1, $2, $3, $4, 'pending_review', 'email_mining', $5, $6)`,
          [
            sectorId, firstName, lastName, lead.email,
            `{${(lead.warmth || 'cold')},auto-discovered}`,
            `Auto-discovered by Lead Miner.\nWarmth: ${lead.warmth}\nOrg type: ${lead.org_type || 'unknown'}\nReason: ${lead.reason || ''}`
          ]
        );
        itemsProcessed++;
        knownEmails.add(lead.email.toLowerCase());
        console.log(`[LeadMiner] Added: ${lead.name} <${lead.email}> [${lead.warmth}]`);
        results.push(`Lead: ${lead.name} <${lead.email}> [${lead.warmth}] — ${lead.reason || ''}`);
      } catch (insertErr) {
        console.log(`[LeadMiner] Insert error for ${lead.email}: ${insertErr.message}`);
      }
    }
  } catch (err) {
    results.push(`Claude analysis failed: ${err.message}`);
  }

  return { result: results.join('\n') || `Processed ${itemsProcessed} new leads`, itemsProcessed };
}

// Advanced Lead Miner with deep scan, custom keywords, and relationship scoring
export async function runLeadMinerAdvanced(mode = 'recent', customKeywords = '') {
  let itemsProcessed = 0;
  const results = [];

  const connected = await getConnectionStatus();
  if (!connected) return { result: 'Gmail not connected', itemsProcessed: 0 };

  // Get existing contacts to avoid dupes
  const { rows: existingEmails } = await pool.query('SELECT LOWER(email) AS email FROM contacts WHERE email IS NOT NULL');
  const knownEmails = new Set(existingEmails.map(e => e.email));

  const timeRange = mode === 'deep' ? '' : 'newer_than:90d';
  const maxPerSearch = mode === 'deep' ? 100 : 30;

  // Build search queries
  const baseFilters = 'from:(-noreply -no-reply -notification -newsletter -substack -beehiiv -ghost -mailchimp -sendgrid -postmaster -mailer-daemon)';
  let searches = [
    `${baseFilters} subject:(journalism OR newsroom OR editor OR reporter) ${timeRange}`,
    `${baseFilters} subject:(media OR broadcasting OR publishing OR newspaper) ${timeRange}`,
    `${baseFilters} subject:(legal OR law firm OR law society OR attorney) ${timeRange}`,
    `${baseFilters} subject:(training OR workshop OR programme OR cohort OR curriculum) ${timeRange}`,
    `${baseFilters} subject:(AI OR "artificial intelligence" OR "machine learning") ${timeRange}`,
    `${baseFilters} subject:(grant OR funding OR proposal OR foundation OR donor) ${timeRange}`,
    `${baseFilters} subject:(policy OR ethics OR governance OR framework OR compliance) ${timeRange}`,
  ];

  // Add custom keyword searches
  if (customKeywords.trim()) {
    const keywords = customKeywords.split(',').map(k => k.trim()).filter(Boolean);
    for (const kw of keywords) {
      searches.push(`${baseFilters} (${kw}) ${timeRange}`);
    }
  }

  const discoveredContacts = new Map(); // email → {name, email, subjects[], messageCount}

  for (const query of searches) {
    try {
      const messages = await searchEmails(query, maxPerSearch);
      console.log(`[LeadMiner] Search "${query.slice(0, 60)}..." → ${messages.length} messages`);

      for (const msg of messages) {
        try {
          const email = await readEmail(msg.id);
          if (!email) continue;

          const fromHeader = email.from || '';
          let senderName, senderEmail;

          const fullMatch = fromHeader.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
          if (fullMatch) {
            senderName = fullMatch[1].trim();
            senderEmail = fullMatch[2].trim().toLowerCase();
          } else {
            const simpleMatch = fromHeader.match(/([\w.+-]+@[\w.-]+\.\w+)/);
            if (!simpleMatch) continue;
            senderEmail = simpleMatch[1].toLowerCase();
            senderName = fromHeader.replace(/<.*>/, '').trim() || senderEmail.split('@')[0];
          }

          // Skip unwanted
          if (knownEmails.has(senderEmail)) continue;
          if (senderEmail.includes('noreply') || senderEmail.includes('no-reply') || senderEmail.includes('notification')) continue;
          if (senderEmail.includes('paul@developai') || senderEmail.includes('paulmcnally')) continue;

          // Accumulate — track how many emails from this person and what subjects
          if (discoveredContacts.has(senderEmail)) {
            const existing = discoveredContacts.get(senderEmail);
            existing.messageCount++;
            if (email.subject && !existing.subjects.includes(email.subject)) {
              existing.subjects.push(email.subject);
            }
          } else {
            discoveredContacts.set(senderEmail, {
              name: senderName,
              email: senderEmail,
              subjects: email.subject ? [email.subject] : [],
              messageCount: 1,
              date: email.date || '',
            });
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) {
      console.log(`[LeadMiner] Search failed: ${e.message}`);
    }
  }

  console.log(`[LeadMiner] Discovered ${discoveredContacts.size} unique contacts`);
  if (discoveredContacts.size === 0) {
    return { result: 'No new potential leads found', itemsProcessed: 0 };
  }

  // Prepare for Claude — include message count for relationship depth
  const contactList = Array.from(discoveredContacts.values())
    .sort((a, b) => b.messageCount - a.messageCount) // most active first
    .slice(0, 60)
    .map((c, i) => `${i+1}. ${c.name} <${c.email}> — ${c.messageCount} emails — Subjects: ${c.subjects.slice(0, 3).join('; ')}`)
    .join('\n');

  const { rows: sectors } = await pool.query("SELECT name FROM sectors WHERE is_active = true");
  const sectorNames = sectors.map(s => s.name).join(', ');

  try {
    const analysis = await callClaudeRaw({
      system: `You are a business development analyst for Develop AI, which provides AI training, ethical AI policies, AI legal frameworks, and AI security protocols for organisations in these sectors: ${sectorNames}.

Analyse these email contacts. For each person, assess:

1. **is_lead** (true/false): Could they become a client or introduce us to clients?
2. **sector**: ${sectorNames} / cross-sector / unknown
3. **org_type**: newsroom, law firm, NGO, foundation, government, academic, media company, tech company, consultancy, other
4. **relationship_depth**: deep (multiple emails, ongoing conversation), moderate (a few exchanges), surface (one-off or CC'd)
5. **seniority**: senior (director, editor-in-chief, head of, CEO, managing partner), mid (manager, editor, programme lead), junior (assistant, intern, coordinator), unknown
6. **influence**: high (decision-maker, budget holder, network connector), medium (can recommend/refer), low (individual contributor)
7. **warmth**: hot (active conversation about services/training), warm (related topic discussed), cold (just a contact)
8. **score** (1-100): Overall lead quality combining all factors
9. **reason**: One-line explanation

Note: someone with many emails = deeper relationship. Senior people at media orgs, law societies, foundations, and journalism networks are highest value.

Output as JSON array: [{"email":"...","name":"...","is_lead":true/false,"sector":"...","org_type":"...","relationship_depth":"...","seniority":"...","influence":"...","warmth":"...","score":85,"reason":"..."}]

Only include contacts where is_lead is true and score >= 40.`,
      userContent: `Contacts discovered from ${mode === 'deep' ? 'ALL' : 'recent'} email history:\n\n${contactList}`,
      maxTokens: 4000,
      temperature: 0.2,
    });

    console.log(`[LeadMiner] Claude response length: ${analysis.length} chars`);
    let leads = [];
    try {
      const jsonMatch = analysis.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        leads = JSON.parse(jsonMatch[0]);
        console.log(`[LeadMiner] Claude classified ${leads.length} leads (${leads.filter(l => l.is_lead).length} qualified)`);
      } else {
        console.log(`[LeadMiner] No JSON found. First 200: ${analysis.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[LeadMiner] JSON parse error: ${e.message}`);
    }

    // Get sector IDs
    const { rows: sectorRows } = await pool.query('SELECT id, name FROM sectors');
    const sectorMap = {};
    sectorRows.forEach(s => { sectorMap[s.name.toLowerCase()] = s.id; });

    console.log(`[LeadMiner] Processing ${leads.length} classified contacts...`);
    for (const lead of leads) {
      if (!lead.is_lead || !lead.email) continue;
      if (knownEmails.has(lead.email.toLowerCase())) continue;

      const sectorId = sectorMap[lead.sector?.toLowerCase()] || sectorRows[0]?.id;
      const nameParts = (lead.name || '').split(' ');
      const firstName = nameParts[0] || lead.email.split('@')[0];
      const lastName = nameParts.slice(1).join(' ') || '';

      try {
        const { rows: dupes } = await pool.query('SELECT id FROM contacts WHERE LOWER(email) = $1', [lead.email.toLowerCase()]);
        if (dupes.length > 0) continue;

        const tags = [lead.warmth || 'cold', 'auto-discovered'];
        if (lead.seniority === 'senior') tags.push('senior');
        if (lead.influence === 'high') tags.push('high-influence');
        if (lead.relationship_depth === 'deep') tags.push('deep-relationship');

        await pool.query(
          `INSERT INTO contacts (sector_id, first_name, last_name, email, pipeline_stage, source, tags, notes)
           VALUES ($1, $2, $3, $4, 'pending_review', 'email_mining', $5, $6)`,
          [
            sectorId, firstName, lastName, lead.email,
            `{${tags.join(',')}}`,
            `Auto-discovered by Lead Miner (score: ${lead.score || '?'}/100)\nRelationship: ${lead.relationship_depth || '?'} · Seniority: ${lead.seniority || '?'} · Influence: ${lead.influence || '?'}\nOrg type: ${lead.org_type || '?'}\nReason: ${lead.reason || ''}`
          ]
        );
        itemsProcessed++;
        knownEmails.add(lead.email.toLowerCase());
        console.log(`[LeadMiner] Added: ${lead.name} <${lead.email}> [score:${lead.score}] [${lead.warmth}/${lead.seniority}/${lead.influence}]`);
        results.push(`${lead.name} <${lead.email}> — score:${lead.score} ${lead.warmth}/${lead.seniority}/${lead.influence}`);
      } catch (insertErr) {
        console.log(`[LeadMiner] Insert error: ${insertErr.message}`);
      }
    }
  } catch (err) {
    console.log(`[LeadMiner] Claude failed: ${err.message}`);
    results.push(`Claude analysis failed: ${err.message}`);
  }

  return { result: results.join('\n') || `Processed ${itemsProcessed} new leads`, itemsProcessed };
}

// Raw Claude call without knowledge enrichment (for lead classification)
async function callClaudeRaw(params) {
  const { callClaude } = await import('./claude.js');
  return callClaude(params);
}
