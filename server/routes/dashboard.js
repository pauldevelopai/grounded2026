import { Router } from 'express';
import pool from '../db/pool.js';
import { generateBusinessSummary } from '../services/claude.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const sid = req.sectorId;

    // Stats
    const [contacts, orgs, cohorts, engagements, docs, pipeline] = await Promise.all([
      pool.query('SELECT count(*)::int as c FROM contacts WHERE ($1::uuid IS NULL OR sector_id = $1)', [sid]),
      pool.query('SELECT count(*)::int as c FROM organisations WHERE ($1::uuid IS NULL OR sector_id = $1)', [sid]),
      pool.query('SELECT count(*)::int as c FROM cohorts WHERE ($1::uuid IS NULL OR sector_id = $1)', [sid]),
      pool.query("SELECT count(*)::int as c FROM service_engagements WHERE status IN ('scoping','active','review') AND ($1::uuid IS NULL OR sector_id = $1)", [sid]),
      pool.query('SELECT count(*)::int as c FROM generated_documents WHERE ($1::uuid IS NULL OR sector_id = $1)', [sid]),
      pool.query("SELECT COALESCE(SUM(amount_max), 0)::int as total FROM funding_opportunities WHERE pipeline_stage NOT IN ('won','lost','expired') AND ($1::uuid IS NULL OR sector_id = $1)", [sid]),
    ]);

    const stats = {
      contacts: contacts.rows[0].c,
      organisations: orgs.rows[0].c,
      cohorts: cohorts.rows[0].c,
      activeEngagements: engagements.rows[0].c,
      documentsGenerated: docs.rows[0].c,
      pipelineValue: pipeline.rows[0].total,
    };

    // Next actions — smart prioritised list with detail explaining WHY
    const nextActions = [];

    // 1. Today's briefing — always worth checking first
    const { rows: todayDigest } = await pool.query(
      "SELECT id FROM newsletter_digests WHERE date = CURRENT_DATE LIMIT 1"
    ).catch(() => ({ rows: [] }));
    if (todayDigest.length === 0) {
      nextActions.push({ title: 'Generate today\'s briefing', link: '/newsletter', priority: 'high', detail: 'No briefing for today yet. Review the latest AI news and flag curriculum items.' });
    }

    // 2. Pending lead reviews
    const { rows: pendingLeads } = await pool.query(
      "SELECT count(*)::int as c FROM contacts WHERE pipeline_stage = 'pending_review'"
    );
    if (pendingLeads[0].c > 0) {
      nextActions.push({ title: `Vet ${pendingLeads[0].c} auto-discovered lead${pendingLeads[0].c > 1 ? 's' : ''}`, link: '/leads', priority: 'high', detail: 'The Lead Miner and Web Prospector found new contacts. Review and approve or reject them.' });
    }

    // 3. Unanalysed assessments
    const { rows: unanalysed } = await pool.query(
      "SELECT count(*)::int as c FROM needs_assessments WHERE status = 'completed' AND ai_analysis IS NULL AND ($1::uuid IS NULL OR sector_id = $1)", [sid]
    );
    if (unanalysed[0].c > 0) {
      nextActions.push({ title: `Analyse ${unanalysed[0].c} pending assessment${unanalysed[0].c > 1 ? 's' : ''}`, link: '/assessments', priority: 'high', detail: 'Run AI analysis to get service recommendations and uncover upsell opportunities.' });
    }

    // 4. Funding deadlines within 14 days
    const { rows: deadlines } = await pool.query(
      "SELECT title, id, deadline FROM funding_opportunities WHERE deadline BETWEEN NOW() AND NOW() + INTERVAL '14 days' AND pipeline_stage NOT IN ('won','lost','expired') AND ($1::uuid IS NULL OR sector_id = $1) ORDER BY deadline LIMIT 3", [sid]
    );
    for (const d of deadlines) {
      const daysLeft = Math.ceil((new Date(d.deadline) - new Date()) / 86400000);
      nextActions.push({ title: `${d.title} — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`, link: `/fundraising/opportunities/${d.id}`, priority: 'urgent', detail: 'Funding deadline approaching. Review application status and submit if ready.' });
    }

    // 5. Stalled mentoring contacts (no activity in 7+ days)
    const { rows: stalled } = await pool.query(
      `SELECT count(*)::int as c FROM learning_journeys WHERE status = 'active'
       AND updated_at < NOW() - INTERVAL '7 days'`
    ).catch(() => ({ rows: [{ c: 0 }] }));
    if (stalled[0].c > 0) {
      nextActions.push({ title: `${stalled[0].c} learner${stalled[0].c > 1 ? 's' : ''} stalled — send nudge`, link: '/mentoring', priority: 'medium', detail: 'Active learners with no activity in 7+ days. Use the Implementation Coach to send follow-ups.' });
    }

    // 6. Low-rated curriculum modules
    const { rows: lowModules } = await pool.query(
      `SELECT cm.title AS module_title, c.title AS course_title, c.id AS course_id
       FROM course_modules cm JOIN courses c ON cm.course_id = c.id
       WHERE cm.effectiveness_rating IS NOT NULL AND cm.effectiveness_rating <= 2
       AND ($1::uuid IS NULL OR c.sector_id = $1) LIMIT 3`, [sid]
    );
    if (lowModules.length > 0) {
      nextActions.push({ title: `${lowModules.length} module${lowModules.length > 1 ? 's' : ''} rated low — needs update`, link: `/curriculum/${lowModules[0].course_id}`, priority: 'medium', detail: `${lowModules[0].module_title} in ${lowModules[0].course_title} scored poorly. Use AI Assist to get improvement suggestions.` });
    }

    // 7. Draft outreach messages
    const { rows: drafts } = await pool.query(
      "SELECT count(*)::int as c FROM outreach_messages WHERE status = 'draft'", []
    );
    if (drafts[0].c > 0) {
      nextActions.push({ title: `${drafts[0].c} outreach draft${drafts[0].c > 1 ? 's' : ''} ready to send`, link: '/marketing/campaigns', priority: 'low', detail: 'Review and send drafted emails to contacts.' });
    }

    // 8. Social posts to publish
    const { rows: draftPosts } = await pool.query(
      "SELECT count(*)::int as c FROM social_posts WHERE status = 'draft'"
    );
    if (draftPosts[0].c > 0) {
      nextActions.push({ title: `${draftPosts[0].c} social post${draftPosts[0].c > 1 ? 's' : ''} ready to publish`, link: '/marketing/social', priority: 'low', detail: 'AI-generated posts waiting for your review and manual publishing.' });
    }

    // 9. Feedback items to address
    const { rows: openFeedback } = await pool.query(
      "SELECT count(*)::int as c FROM feedback WHERE status != 'done'"
    ).catch(() => ({ rows: [{ c: 0 }] }));
    if (openFeedback[0].c > 0) {
      nextActions.push({ title: `${openFeedback[0].c} feedback item${openFeedback[0].c > 1 ? 's' : ''} to address`, link: '/feedback', priority: 'low', detail: 'Technical changes and feature requests you\'ve submitted.' });
    }

    // Fallback if nothing is pending
    if (nextActions.length === 0) {
      nextActions.push(
        { title: 'Review your briefing', link: '/newsletter', priority: 'medium', detail: 'Check the latest AI news and flag anything relevant to your courses.' },
        { title: 'Build course content', link: '/course-builder', priority: 'medium', detail: 'Use the AI Curriculum Builder to develop or improve training modules.' },
        { title: 'Find new leads', link: '/leads', priority: 'medium', detail: 'Run the Lead Miner or browse auto-discovered prospects.' },
      );
    }

    // Recent AI activity (last 10 across tables)
    const { rows: recentAi } = await pool.query(`
      (SELECT 'document' AS type, title, id, created_at, '/documents/' || id AS link FROM generated_documents WHERE ($1::uuid IS NULL OR sector_id = $1) ORDER BY created_at DESC LIMIT 5)
      UNION ALL
      (SELECT 'assessment_analysis' AS type, 'Assessment analysed' AS title, id, analysed_at AS created_at, '/assessments/' || id AS link FROM needs_assessments WHERE ai_analysis IS NOT NULL AND ($1::uuid IS NULL OR sector_id = $1) ORDER BY analysed_at DESC LIMIT 5)
      ORDER BY created_at DESC NULLS LAST LIMIT 10
    `, [sid]);

    res.json({ stats, nextActions, recentAiActivity: recentAi });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/full', async (req, res) => {
  try {
    const sid = req.sectorId;

    const [
      contacts, orgs, cohortsCount, engagementsCount, docsCount, pipelineValue,
      contactsByStage, recentContacts,
      funderOrgs, programmeOrgsByProgramme, leadOrgs,
      activeCohorts, upcomingSessions,
      activeEngagements,
      fundingByStage, fundingDeadlines,
      latestDigest, curriculumItems,
      lowestCourses, flaggedModules,
      emailsSent, repliesReceived, draftPosts, activeCampaigns,
      recentActivity, unreadNotifications,
      activeLearners, pendingTaskReviews
    ] = await Promise.all([
      // Stats
      pool.query('SELECT count(*)::int as c FROM contacts WHERE ($1::uuid IS NULL OR sector_id = $1)', [sid]),
      pool.query('SELECT count(*)::int as c FROM organisations WHERE ($1::uuid IS NULL OR sector_id = $1)', [sid]),
      pool.query("SELECT count(*)::int as c FROM cohorts WHERE status = 'active' AND ($1::uuid IS NULL OR sector_id = $1)", [sid]),
      pool.query("SELECT count(*)::int as c FROM service_engagements WHERE status IN ('scoping','active','review') AND ($1::uuid IS NULL OR sector_id = $1)", [sid]),
      pool.query('SELECT count(*)::int as c FROM generated_documents WHERE ($1::uuid IS NULL OR sector_id = $1)', [sid]),
      pool.query("SELECT COALESCE(SUM(amount_max), 0)::int as total FROM funding_opportunities WHERE pipeline_stage NOT IN ('won','lost','expired') AND ($1::uuid IS NULL OR sector_id = $1)", [sid]),
      // CRM Pipeline
      pool.query('SELECT pipeline_stage, count(*)::int as c FROM contacts WHERE ($1::uuid IS NULL OR sector_id = $1) GROUP BY pipeline_stage', [sid]),
      pool.query(`SELECT c.id, c.first_name, c.last_name, c.pipeline_stage, c.last_contacted_at, o.name AS org_name
        FROM contacts c LEFT JOIN organisations o ON c.organisation_id = o.id
        WHERE ($1::uuid IS NULL OR c.sector_id = $1) ORDER BY c.last_contacted_at DESC NULLS LAST LIMIT 5`, [sid]),
      // Org hierarchy
      pool.query(`SELECT o.id, o.name, o.relationship_stage,
        (SELECT count(*)::int FROM organisations po WHERE po.funder_organisation_id = o.id) AS programme_org_count
        FROM organisations o WHERE o.relationship_type = 'funder' AND ($1::uuid IS NULL OR o.sector_id = $1)
        ORDER BY o.name`, [sid]),
      pool.query(`SELECT o.id, o.name, o.programme_name, o.relationship_stage, fo.name AS funder_name,
        (SELECT count(*)::int FROM contacts c WHERE c.organisation_id = o.id) AS contact_count
        FROM organisations o LEFT JOIN organisations fo ON o.funder_organisation_id = fo.id
        WHERE o.relationship_type = 'programme_org' AND ($1::uuid IS NULL OR o.sector_id = $1)
        ORDER BY o.programme_name, o.name`, [sid]),
      pool.query(`SELECT o.id, o.name, o.relationship_stage,
        (SELECT count(*)::int FROM contacts c WHERE c.organisation_id = o.id) AS contact_count
        FROM organisations o WHERE o.relationship_type = 'lead' AND ($1::uuid IS NULL OR o.sector_id = $1)
        ORDER BY o.created_at DESC LIMIT 10`, [sid]),
      // Programmes
      pool.query(`SELECT ch.id, ch.name, ch.start_date, ch.end_date, ch.status, o.name AS org_name,
        (SELECT count(*)::int FROM cohort_participants cp WHERE cp.cohort_id = ch.id) AS participant_count
        FROM cohorts ch LEFT JOIN organisations o ON ch.client_organisation_id = o.id
        WHERE ch.status = 'active' AND ($1::uuid IS NULL OR ch.sector_id = $1) ORDER BY ch.start_date`, [sid]),
      pool.query(`SELECT cs.id, cs.session_date, cs.title, ch.name AS cohort_name
        FROM cohort_sessions cs JOIN cohorts ch ON cs.cohort_id = ch.id
        WHERE cs.session_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND ($1::uuid IS NULL OR ch.sector_id = $1) ORDER BY cs.session_date LIMIT 5`, [sid]),
      // Services
      pool.query(`SELECT se.id, se.type, se.status, o.name AS org_name, t.name AS mentor_name
        FROM service_engagements se LEFT JOIN organisations o ON se.organisation_id = o.id LEFT JOIN team_members t ON se.mentor_id = t.id
        WHERE se.status IN ('scoping','active','review') AND ($1::uuid IS NULL OR se.sector_id = $1) ORDER BY se.start_date`, [sid]),
      // Fundraising
      pool.query("SELECT pipeline_stage, count(*)::int as c, COALESCE(SUM(amount_max), 0)::int as value FROM funding_opportunities WHERE pipeline_stage NOT IN ('won','lost','expired') AND ($1::uuid IS NULL OR sector_id = $1) GROUP BY pipeline_stage", [sid]),
      pool.query(`SELECT fo.id, fo.title, fo.deadline, fo.pipeline_stage, f.name AS funder_name
        FROM funding_opportunities fo LEFT JOIN funders f ON fo.funder_id = f.id
        WHERE fo.deadline BETWEEN NOW() AND NOW() + INTERVAL '14 days' AND fo.pipeline_stage NOT IN ('won','lost','expired')
        AND ($1::uuid IS NULL OR fo.sector_id = $1) ORDER BY fo.deadline LIMIT 5`, [sid]),
      // Newsletter
      pool.query(`SELECT summary, digest_date FROM newsletter_items WHERE is_digested = true ORDER BY digest_date DESC, created_at DESC LIMIT 1`),
      pool.query(`SELECT count(*)::int as c FROM newsletter_items WHERE is_curriculum_relevant = true AND promoted_to_knowledge = false`),
      // Curriculum
      pool.query(`SELECT c.id, c.title, c.effectiveness_score,
        (SELECT ROUND(AVG(cm.effectiveness_rating)::numeric, 1) FROM course_modules cm WHERE cm.course_id = c.id AND cm.effectiveness_rating IS NOT NULL) AS avg_rating
        FROM courses c WHERE ($1::uuid IS NULL OR c.sector_id = $1) AND c.status = 'active'
        ORDER BY avg_rating ASC NULLS LAST LIMIT 3`, [sid]),
      pool.query(`SELECT cm.id, cm.title AS module_title, cm.effectiveness_rating, c.title AS course_title, c.id AS course_id
        FROM course_modules cm JOIN courses c ON cm.course_id = c.id
        WHERE cm.effectiveness_rating IS NOT NULL AND cm.effectiveness_rating <= 2
        AND ($1::uuid IS NULL OR c.sector_id = $1) ORDER BY cm.effectiveness_rating LIMIT 5`, [sid]),
      // Marketing
      pool.query("SELECT count(*)::int as c FROM outreach_messages WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '7 days'"),
      pool.query("SELECT count(*)::int as c FROM outreach_messages WHERE status = 'replied' AND replied_at >= NOW() - INTERVAL '7 days'"),
      pool.query("SELECT count(*)::int as c FROM social_posts WHERE status = 'draft'"),
      pool.query("SELECT count(*)::int as c FROM outreach_campaigns WHERE status = 'active' AND ($1::uuid IS NULL OR sector_id = $1)", [sid]),
      // Recent activity
      pool.query(`(SELECT 'contact' AS type, first_name || ' ' || last_name AS title, id, created_at, '/contacts/' || id AS link FROM contacts WHERE ($1::uuid IS NULL OR sector_id = $1) ORDER BY created_at DESC LIMIT 3)
        UNION ALL (SELECT 'document' AS type, title, id, created_at, '/documents/' || id AS link FROM generated_documents WHERE ($1::uuid IS NULL OR sector_id = $1) ORDER BY created_at DESC LIMIT 3)
        UNION ALL (SELECT 'cohort' AS type, name AS title, id, created_at, '/programmes/' || id AS link FROM cohorts WHERE ($1::uuid IS NULL OR sector_id = $1) ORDER BY created_at DESC LIMIT 3)
        ORDER BY created_at DESC LIMIT 10`, [sid]),
      // Notifications
      pool.query("SELECT count(*)::int as c FROM notifications WHERE user_id = $1 AND is_read = false", [req.user.id]),
      // Learning
      pool.query("SELECT count(*)::int as c FROM learning_journeys WHERE status = 'active'"),
      pool.query("SELECT count(*)::int as c FROM learning_tasks WHERE status = 'submitted'"),
    ]);

    const pipeline = Object.fromEntries(contactsByStage.rows.map(r => [r.pipeline_stage, r.c]));
    const fundingStages = Object.fromEntries(fundingByStage.rows.map(r => [r.pipeline_stage, { count: r.c, value: r.value }]));
    const totalFundingValue = fundingByStage.rows.reduce((sum, r) => sum + r.value, 0);

    res.json({
      stats: {
        contacts: contacts.rows[0].c,
        organisations: orgs.rows[0].c,
        activeCohorts: cohortsCount.rows[0].c,
        activeEngagements: engagementsCount.rows[0].c,
        documentsGenerated: docsCount.rows[0].c,
        pipelineValue: pipelineValue.rows[0].total,
        unreadNotifications: unreadNotifications.rows[0].c,
      },
      pipeline,
      recentContacts: recentContacts.rows,
      orgHierarchy: {
        funders: funderOrgs.rows,
        programmeOrgs: programmeOrgsByProgramme.rows,
        leads: leadOrgs.rows,
      },
      activeCohorts: activeCohorts.rows,
      upcomingSessions: upcomingSessions.rows,
      activeEngagements: activeEngagements.rows,
      fundraising: { stages: fundingStages, totalValue: totalFundingValue, approachingDeadlines: fundingDeadlines.rows },
      latestDigest: latestDigest.rows[0] || null,
      curriculumItemsCount: curriculumItems.rows[0].c,
      curriculumHealth: { lowestCourses: lowestCourses.rows, flaggedModules: flaggedModules.rows },
      marketing: {
        emailsSentThisWeek: emailsSent.rows[0].c,
        repliesThisWeek: repliesReceived.rows[0].c,
        draftPosts: draftPosts.rows[0].c,
        activeCampaigns: activeCampaigns.rows[0].c,
      },
      recentActivity: recentActivity.rows,
      learning: {
        activeLearners: activeLearners.rows[0].c,
        pendingTaskReviews: pendingTaskReviews.rows[0].c,
      },
    });
  } catch (err) {
    console.error('Dashboard full error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/ai-summary', async (req, res) => {
  try {
    const sid = req.sectorId;

    // Pull data with PROPER org hierarchy awareness
    const [
      funders, programmeOrgs, leads, leadContacts,
      activeCohorts, pendingAssessments, upcomingDeadlines,
      activeEngagements, lowModules, draftEmails,
      activeJourneys, pendingTaskReviews
    ] = await Promise.all([
      // Funders (clients who pay)
      pool.query(`SELECT o.name, (SELECT count(*)::int FROM organisations po WHERE po.funder_organisation_id = o.id) AS org_count
        FROM organisations o WHERE o.relationship_type = 'funder' AND ($1::uuid IS NULL OR o.sector_id = $1)`, [sid]),
      // Programme orgs (being trained) with their funder
      pool.query(`SELECT o.name, o.programme_name, fo.name AS funder_name,
        (SELECT count(*)::int FROM contacts c WHERE c.organisation_id = o.id) AS contact_count
        FROM organisations o LEFT JOIN organisations fo ON o.funder_organisation_id = fo.id
        WHERE o.relationship_type = 'programme_org' AND ($1::uuid IS NULL OR o.sector_id = $1)`, [sid]),
      // Actual leads (prospective new business only)
      pool.query(`SELECT o.name, o.relationship_stage FROM organisations o
        WHERE o.relationship_type = 'lead' AND ($1::uuid IS NULL OR o.sector_id = $1)`, [sid]),
      // Lead contacts only (people at lead orgs, NOT at programme orgs)
      pool.query(`SELECT c.first_name, c.last_name, c.pipeline_stage, o.name AS org_name
        FROM contacts c JOIN organisations o ON c.organisation_id = o.id
        WHERE o.relationship_type = 'lead' AND ($1::uuid IS NULL OR c.sector_id = $1)
        ORDER BY c.last_contacted_at DESC NULLS LAST LIMIT 5`, [sid]),
      // Active cohorts
      pool.query(`SELECT ch.name, o.name AS org_name FROM cohorts ch
        LEFT JOIN organisations o ON ch.client_organisation_id = o.id
        WHERE ch.status = 'active' AND ($1::uuid IS NULL OR ch.sector_id = $1)`, [sid]),
      // Pending assessments
      pool.query(`SELECT o.name AS org_name FROM needs_assessments na
        LEFT JOIN organisations o ON na.organisation_id = o.id
        WHERE na.status = 'completed' AND na.ai_analysis IS NULL AND ($1::uuid IS NULL OR na.sector_id = $1)`, [sid]),
      // Funding deadlines
      pool.query(`SELECT fo.title, fo.deadline, f.name AS funder_name
        FROM funding_opportunities fo LEFT JOIN funders f ON fo.funder_id = f.id
        WHERE fo.deadline BETWEEN NOW() AND NOW() + INTERVAL '14 days'
        AND fo.pipeline_stage NOT IN ('won','lost','expired')
        AND ($1::uuid IS NULL OR fo.sector_id = $1) ORDER BY fo.deadline LIMIT 3`, [sid]),
      // Active engagements (mentorship/policy/framework)
      pool.query(`SELECT se.type, o.name AS org_name, se.status
        FROM service_engagements se LEFT JOIN organisations o ON se.organisation_id = o.id
        WHERE se.status IN ('scoping','active','review') AND ($1::uuid IS NULL OR se.sector_id = $1) LIMIT 5`, [sid]),
      // Low-rated modules
      pool.query(`SELECT cm.title, cm.effectiveness_rating, c.title AS course_title
        FROM course_modules cm JOIN courses c ON cm.course_id = c.id
        WHERE cm.effectiveness_rating <= 2 AND cm.effectiveness_rating IS NOT NULL
        AND ($1::uuid IS NULL OR c.sector_id = $1) LIMIT 3`, [sid]),
      // Draft outreach
      pool.query("SELECT count(*)::int as c FROM outreach_messages WHERE status = 'draft'"),
      // Learning journeys
      pool.query("SELECT count(*)::int as c FROM learning_journeys WHERE status = 'active'"),
      pool.query("SELECT count(*)::int as c FROM learning_tasks WHERE status = 'submitted'"),
    ]);

    let sectorName = 'all sectors';
    if (sid) {
      const { rows } = await pool.query('SELECT name FROM sectors WHERE id = $1', [sid]);
      sectorName = rows[0]?.name || 'all sectors';
    }

    // Build context that CLEARLY separates the org hierarchy
    const lines = [];

    // Funders
    if (funders.rows.length > 0) {
      lines.push(`FUNDERS (clients who pay Develop AI): ${funders.rows.map(f => `${f.name} (${f.org_count} programme orgs)`).join(', ')}`);
    } else {
      lines.push('FUNDERS: None — need to find new funding clients');
    }

    // Programme orgs grouped by programme
    if (programmeOrgs.rows.length > 0) {
      const byProg = {};
      programmeOrgs.rows.forEach(o => {
        const prog = o.programme_name || o.funder_name || 'Other';
        if (!byProg[prog]) byProg[prog] = [];
        byProg[prog].push(o.name);
      });
      for (const [prog, orgs] of Object.entries(byProg)) {
        lines.push(`PROGRAMME "${prog}" (${orgs.length} orgs being trained): ${orgs.join(', ')}`);
      }
    }

    // Leads (actual new business prospects)
    if (leads.rows.length > 0) {
      lines.push(`LEADS (prospective new business): ${leads.rows.map(l => `${l.name} (${l.relationship_stage})`).join(', ')}`);
      if (leadContacts.rows.length > 0) {
        lines.push(`LEAD CONTACTS to follow up: ${leadContacts.rows.map(c => `${c.first_name} ${c.last_name} at ${c.org_name} (${c.pipeline_stage})`).join(', ')}`);
      }
    } else {
      lines.push('LEADS: Zero new business prospects — outreach needed');
    }

    // Active delivery
    if (activeCohorts.rows.length > 0) {
      lines.push(`ACTIVE COHORTS: ${activeCohorts.rows.map(c => `${c.name}${c.org_name ? ' for ' + c.org_name : ''}`).join(', ')}`);
    } else {
      lines.push('ACTIVE COHORTS: None running');
    }

    if (activeEngagements.rows.length > 0) {
      lines.push(`ACTIVE ENGAGEMENTS: ${activeEngagements.rows.map(e => `${e.type.replace(/_/g, ' ')} for ${e.org_name || 'UNKNOWN — needs linking'} (${e.status})`).join(', ')}`);
    }

    // Learning
    if (activeJourneys.rows[0].c > 0 || pendingTaskReviews.rows[0].c > 0) {
      lines.push(`LEARNING: ${activeJourneys.rows[0].c} active learners, ${pendingTaskReviews.rows[0].c} task submissions awaiting review`);
    }

    // Issues needing attention
    if (pendingAssessments.rows.length > 0) {
      lines.push(`PENDING ASSESSMENTS: ${pendingAssessments.rows.map(a => a.org_name || 'Unlinked').join(', ')} — run AI analysis`);
    }
    if (upcomingDeadlines.rows.length > 0) {
      lines.push(`FUNDING DEADLINES: ${upcomingDeadlines.rows.map(d => `${d.title} (${d.funder_name}, ${new Date(d.deadline).toLocaleDateString()})`).join(', ')}`);
    }
    if (lowModules.rows.length > 0) {
      lines.push(`LOW-RATED MODULES: ${lowModules.rows.map(m => `"${m.title}" in ${m.course_title} (${m.effectiveness_rating}/5)`).join(', ')}`);
    }
    if (draftEmails.rows[0].c > 0) {
      lines.push(`DRAFT OUTREACH: ${draftEmails.rows[0].c} emails ready to send`);
    }

    const summary = await generateBusinessSummary(lines.join('\n'), sectorName);
    res.json({ summary });
  } catch (err) {
    console.error('AI summary error:', err);
    res.status(500).json({ message: err.message || 'AI summary failed' });
  }
});

export default router;
