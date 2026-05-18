import bcrypt from 'bcryptjs';
import pool from './pool.js';
import config from '../config.js';

async function seed() {
  const client = await pool.connect();
  try {
    // Seed sectors
    const { rows: existing } = await client.query('SELECT slug FROM sectors');
    const existingSlugs = new Set(existing.map(r => r.slug));

    const sectors = [
      { name: 'Media', slug: 'media', description: 'Media and journalism sector', colour: '#3B82F6' },
      { name: 'Legal', slug: 'legal', description: 'Legal profession sector', colour: '#166534' },
    ];

    for (const s of sectors) {
      if (existingSlugs.has(s.slug)) {
        console.log(`  skip sector: ${s.name}`);
        continue;
      }
      await client.query(
        'INSERT INTO sectors (name, slug, description, colour) VALUES ($1, $2, $3, $4)',
        [s.name, s.slug, s.description, s.colour]
      );
      console.log(`  added sector: ${s.name}`);
    }

    // Seed admin user
    const { rows: existingAdmin } = await client.query(
      'SELECT id FROM team_members WHERE email = $1',
      [config.adminEmail]
    );

    if (existingAdmin.length === 0) {
      const hash = await bcrypt.hash(config.adminPassword, 10);
      await client.query(
        `INSERT INTO team_members (name, email, password_hash, role, is_active, tracker_access)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['Admin', config.adminEmail, hash, 'admin', true, true]
      );
      console.log(`  added admin user: ${config.adminEmail}`);
    } else {
      console.log(`  skip admin user: ${config.adminEmail}`);
    }

    // Seed assessment questions
    const { rows: sectorRows } = await client.query('SELECT id, slug FROM sectors');
    const sectorMap = Object.fromEntries(sectorRows.map(r => [r.slug, r.id]));

    const { rows: existingQuestions } = await client.query('SELECT COUNT(*) AS count FROM assessment_questions');
    if (parseInt(existingQuestions[0].count) === 0) {
      const legalQuestions = [
        { text: 'How many lawyers/legal professionals are in your organisation?', type: 'select', options: ['1-10', '11-50', '51-200', '200+'] },
        { text: 'What are your main practice areas?', type: 'textarea' },
        { text: 'What technology tools does your team currently use?', type: 'textarea' },
        { text: 'What are the biggest time drains in your current workflow?', type: 'textarea' },
        { text: 'How would you rate your team\'s familiarity with AI tools?', type: 'select', options: ['No experience', 'Aware but not using', 'Some experimentation', 'Regular use', 'Advanced'] },
        { text: 'What is your approximate budget range for AI training/implementation?', type: 'select', options: ['Under £5k', '£5k-£15k', '£15k-£50k', '£50k+', 'Not yet determined'] },
        { text: 'Who is the decision-maker for technology adoption?', type: 'text' },
        { text: 'What regulatory or compliance concerns do you have around AI adoption?', type: 'textarea' },
      ];

      const mediaQuestions = [
        { text: 'How large is your newsroom/content team?', type: 'select', options: ['1-5', '6-20', '21-50', '50+'] },
        { text: 'What types of content does your organisation produce?', type: 'textarea' },
        { text: 'What tools and platforms do you currently use for content creation?', type: 'textarea' },
        { text: 'What are the biggest workflow bottlenecks in your content production?', type: 'textarea' },
        { text: 'How would you rate your team\'s familiarity with AI tools?', type: 'select', options: ['No experience', 'Aware but not using', 'Some experimentation', 'Regular use', 'Advanced'] },
        { text: 'Does your organisation have an editorial policy on AI use?', type: 'select', options: ['Yes, comprehensive', 'Yes, basic', 'In development', 'No'] },
      ];

      for (let i = 0; i < legalQuestions.length; i++) {
        const q = legalQuestions[i];
        await client.query(
          'INSERT INTO assessment_questions (sector_id, question_text, question_type, options, order_index) VALUES ($1, $2, $3, $4, $5)',
          [sectorMap.legal, q.text, q.type, q.options ? JSON.stringify(q.options) : null, i]
        );
      }
      console.log(`  added ${legalQuestions.length} legal assessment questions`);

      for (let i = 0; i < mediaQuestions.length; i++) {
        const q = mediaQuestions[i];
        await client.query(
          'INSERT INTO assessment_questions (sector_id, question_text, question_type, options, order_index) VALUES ($1, $2, $3, $4, $5)',
          [sectorMap.media, q.text, q.type, q.options ? JSON.stringify(q.options) : null, i]
        );
      }
      console.log(`  added ${mediaQuestions.length} media assessment questions`);
    } else {
      console.log('  skip assessment questions (already seeded)');
    }

    // Seed document templates
    const { rows: existingTemplates } = await client.query('SELECT COUNT(*) AS count FROM document_templates');
    if (parseInt(existingTemplates[0].count) === 0) {
      const templates = [
        {
          sector: 'legal', type: 'ethical_ai_policy', title: 'Ethical AI Policy',
          description: 'A comprehensive ethical AI usage policy for legal organisations',
          prompt: `You are an AI policy expert helping a legal organisation create an Ethical AI Policy. Generate a comprehensive, professional policy document in markdown format. The policy should be tailored to the legal sector, addressing client confidentiality, data protection, professional responsibility, and regulatory compliance. Use the organisation's needs assessment data to personalise the content. Include practical guidelines that lawyers and staff can follow immediately.`,
          structure: ["1. Purpose and Scope", "2. Definitions", "3. Principles of Ethical AI Use", "4. Permitted and Prohibited Uses", "5. Client Confidentiality and Data Protection", "6. Professional Responsibility", "7. Risk Assessment and Management", "8. Training and Awareness", "9. Monitoring and Compliance", "10. Review and Updates"],
        },
        {
          sector: 'legal', type: 'ai_legal_framework', title: 'AI Legal Framework',
          description: 'An AI governance and legal compliance framework for law firms',
          prompt: `You are a legal technology governance expert. Generate a comprehensive AI Legal Framework document in markdown format for a law firm or legal organisation. This framework should address regulatory compliance, risk management, liability considerations, intellectual property, and professional obligations. Tailor it to the specific jurisdiction and practice areas identified in the needs assessment.`,
          structure: ["1. Executive Summary", "2. Regulatory Landscape", "3. Governance Structure", "4. Risk Assessment Framework", "5. Data Protection and Privacy", "6. Intellectual Property Considerations", "7. Liability and Professional Indemnity", "8. Vendor and Third-Party AI Tools", "9. Client Communication", "10. Implementation Roadmap"],
        },
        {
          sector: 'media', type: 'ethical_ai_policy', title: 'Ethical AI Policy for Media',
          description: 'An ethical AI usage policy for media and journalism organisations',
          prompt: `You are an AI ethics expert specialising in media and journalism. Generate a comprehensive Ethical AI Policy document in markdown format. The policy should address editorial integrity, source verification, content authenticity, transparency with audiences, and responsible AI use in newsrooms. Tailor it to the organisation's specific content types and workflows identified in their needs assessment.`,
          structure: ["1. Purpose and Scope", "2. Editorial Principles and AI", "3. Content Generation Guidelines", "4. Source Verification and Fact-Checking", "5. Transparency and Disclosure", "6. Audience Trust", "7. Data and Privacy", "8. Bias and Fairness", "9. Training Requirements", "10. Review Process"],
        },
      ];

      for (const t of templates) {
        await client.query(
          `INSERT INTO document_templates (sector_id, type, title, description, template_prompt, structure)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sectorMap[t.sector], t.type, t.title, t.description, t.prompt, JSON.stringify(t.structure)]
        );
      }
      console.log(`  added ${templates.length} document templates`);
    } else {
      console.log('  skip document templates (already seeded)');
    }

    // Seed background jobs
    const { rows: existingJobs } = await client.query('SELECT COUNT(*) AS count FROM background_jobs');
    if (parseInt(existingJobs[0].count) === 0) {
      const jobs = [
        { name: 'follow_up_monitor', description: 'Scans for stale contacts, overdue follow-ups, and approaching funding deadlines', cron: '0 */6 * * *' },
        { name: 'content_generator', description: 'Generates draft social posts and outreach emails for active campaigns', cron: '0 6 * * *' },
        { name: 'industry_researcher', description: 'Researches AI trends per sector and identifies curriculum gaps', cron: '0 5 * * 1' },
        { name: 'business_digest', description: 'AI-generated daily summary of business activity and priorities', cron: '0 7 * * *' },
        { name: 'curriculum_health_check', description: 'Reviews course feedback and flags modules needing improvement', cron: '0 20 * * 0' },
      ];
      for (const j of jobs) {
        await client.query(
          'INSERT INTO background_jobs (name, description, cron_expression) VALUES ($1, $2, $3)',
          [j.name, j.description, j.cron]
        );
      }
      console.log(`  added ${jobs.length} background jobs`);
    } else {
      console.log('  skip background jobs (already seeded)');
    }

    // Seed knowledge entries (Tracker's foundational knowledge)
    const { rows: existingKnowledge } = await client.query('SELECT COUNT(*) AS count FROM knowledge_entries');
    if (parseInt(existingKnowledge[0].count) === 0) {
      const knowledgeEntries = [
        { category: 'client_insight', title: 'Media sector organisations often lack formal AI editorial policies', content: 'Most newsrooms Develop AI works with have no written policy on AI use in journalism. This creates both risk (inconsistent use, ethical issues) and opportunity (clear demand for Develop AI ethical AI policy service). Typical starting point is awareness training followed by policy co-creation.', sector: 'media', confidence: 0.9 },
        { category: 'client_insight', title: 'Legal sector faces regulatory pressure around AI adoption', content: 'Law firms and legal organisations face unique regulatory requirements around AI use — client confidentiality (legal privilege), data protection (GDPR/POPIA), and professional conduct rules. AI training must address these compliance requirements first before practical tool training.', sector: 'legal', confidence: 0.9 },
        { category: 'course_outcome', title: 'Hands-on AI tool demonstrations are the highest-rated training component', content: 'Across all cohorts delivered, live demonstrations of AI tools applied to sector-specific workflows consistently receive the highest participant feedback scores (8-10/10). Abstract lectures about AI concepts score significantly lower. Prioritise practical, tool-based modules.', confidence: 0.85 },
        { category: 'course_outcome', title: 'Ethical AI policy workshops drive deeper engagement than lectures', content: 'Cohorts that include collaborative policy-writing workshops show higher completion rates and more positive feedback than those using lecture-only formats. Participants value creating something tangible for their organisation.', confidence: 0.8 },
        { category: 'content_effectiveness', title: '3x2hr online format works better than 2-day intensive for policy work', content: 'Online cohorts delivered as 3 sessions of 2 hours each show better engagement and policy completion rates than 2-day in-person intensives. The gap between sessions allows participants to draft and iterate on their policies with colleagues.', confidence: 0.75 },
        { category: 'assessment_insight', title: 'Most organisations overestimate their AI readiness', content: 'Needs assessment data consistently shows that organisations rate themselves as more AI-ready than their actual tool usage and policy infrastructure suggests. The gap between self-assessed and actual readiness is typically 2-3 levels.', confidence: 0.8 },
        { category: 'industry_trend', title: 'Generative AI for content creation is the most requested training topic', content: 'Across both Media and Legal sectors, the most common request in needs assessments is training on generative AI tools (ChatGPT, Claude, etc.) for content creation — articles, briefs, summaries, research. Second most requested is AI-assisted research and fact-checking.', confidence: 0.85 },
        { category: 'tool_technique', title: 'Claude API is the primary AI tool for Develop AI internal and client work', content: 'Develop AI uses the Anthropic Claude API (currently claude-sonnet-4-6) for all AI-powered features in Tracker and recommends Claude-based workflows to clients. Key advantages: strong safety controls, large context window, reliable structured output.', confidence: 0.95, tags: ['claude', 'anthropic', 'tooling'] },
        { category: 'regulatory', title: 'South African POPIA applies to all AI processing of personal data', content: 'The Protection of Personal Information Act (POPIA) requires organisations using AI in South Africa to ensure lawful processing of personal data, including data minimisation, purpose limitation, and individual rights. Relevant to all SA-based clients.', confidence: 0.9, tags: ['popia', 'south-africa', 'data-protection'] },
        { category: 'proposal_outcome', title: 'Proposals emphasising practical outcomes over theory have higher conversion', content: 'Service proposals that focus on deliverables (completed ethical AI policy, trained staff with certification, implemented AI workflow) convert at approximately 3x the rate of proposals emphasising theoretical knowledge transfer.', confidence: 0.75 },
        { category: 'feedback_pattern', title: 'Participants want more follow-up support after training', content: 'The most common feedback across all cohorts is a request for ongoing mentorship or follow-up sessions after the initial training programme ends. This validates the mentorship service offering as a natural upsell from training.', confidence: 0.8 },
        { category: 'client_insight', title: 'TRF programme newsrooms in exile face unique digital security concerns', content: 'Russian-speaking exiled media organisations working with TRF have heightened concerns about digital security, surveillance, and data sovereignty when adopting AI tools. AI training for this cohort must address secure tool selection and data handling practices.', sector: 'media', confidence: 0.85, tags: ['trf', 'exiled-media', 'security'] },
      ];

      for (const ke of knowledgeEntries) {
        const sectorId = ke.sector ? sectorMap[ke.sector] : null;
        await client.query(
          `INSERT INTO knowledge_entries (category, title, content, sector_id, source_type, source_description, confidence, is_verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [ke.category, ke.title, ke.content, sectorId, 'manual', 'Foundational knowledge seeded at setup', ke.confidence]
        );
        if (ke.tags) {
          const { rows: [inserted] } = await client.query('SELECT id FROM knowledge_entries WHERE title = $1', [ke.title]);
          for (const tag of ke.tags) {
            await client.query('INSERT INTO knowledge_tags (knowledge_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING', [inserted.id, tag]);
          }
        }
      }
      console.log(`  added ${knowledgeEntries.length} knowledge entries`);
    } else {
      console.log('  skip knowledge entries (already seeded)');
    }

    console.log('Seed complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
