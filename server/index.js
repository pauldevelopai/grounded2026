import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import config from './config.js';
import authRoutes from './routes/auth.js';
import sectorRoutes from './routes/sectors.js';
import contactRoutes from './routes/contacts.js';
import organisationRoutes from './routes/organisations.js';
import teamMemberRoutes from './routes/team-members.js';
import cohortRoutes from './routes/cohorts.js';
import needsAssessmentRoutes from './routes/needs-assessments.js';
import assessmentQuestionRoutes from './routes/assessment-questions.js';
import courseRoutes from './routes/courses.js';
import documentTemplateRoutes from './routes/document-templates.js';
import generatedDocumentRoutes from './routes/generated-documents.js';
import serviceEngagementRoutes from './routes/service-engagements.js';
import outreachCampaignRoutes from './routes/outreach-campaigns.js';
import outreachMessageRoutes from './routes/outreach-messages.js';
import socialPostRoutes from './routes/social-posts.js';
import gmailRoutes from './routes/gmail.js';
import funderRoutes from './routes/funders.js';
import fundingOpportunityRoutes from './routes/funding-opportunities.js';
import dashboardRoutes from './routes/dashboard.js';
import aiAssistantRoutes from './routes/ai-assistant.js';
import backgroundJobRoutes from './routes/background-jobs.js';
import notificationRoutes from './routes/notifications.js';
import knowledgeRoutes from './routes/knowledge.js';
import uploadRoutes from './routes/uploads.js';
import intelligenceRoutes from './routes/intelligence.js';
import newsletterRoutes from './routes/newsletter.js';
import learningOutcomeRoutes from './routes/learning-outcomes.js';
import learningTaskRoutes from './routes/learning-tasks.js';
import learningJourneyRoutes from './routes/learning-journeys.js';
import participantPortalRoutes from './routes/participant-portal.js';
import participantTokenRoutes from './routes/participant-tokens.js';
import agentConversationRoutes from './routes/agent-conversations.js';
import agentActionRoutes from './routes/agent-actions.js';
import feedbackRoutes from './routes/feedback.js';
import lawsuitRoutes from './routes/lawsuits.js';
import regulationRoutes from './routes/regulations.js';
import legalSourcesRoutes from './routes/legal-sources.js';
import usecasesRoutes from './routes/usecases.js';
import publicRoutes from './routes/public.js';
import publicHtmlRoutes from './routes/public-html.js';
import { startScheduler } from './services/scheduler.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { sectorFilter } from './middleware/sector-filter.js';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Open / limited-access endpoints ───────────────────────────────────────────
// Auth: anyone
app.use('/api/auth', authRoutes);
// Public AI Legal surface (ailegal.co.za) — NO auth. Mount before any auth middleware.
// /api/public/* is the original path the frontend uses. /api/v1/* is the same
// router mounted under the versioned path — that's what third-party consumers
// should call. We keep both live so the internal site keeps working while the
// public API is formally versioned.
app.use('/api/public', publicRoutes);

// Server-rendered HTML for public detail pages with per-item OG tags.
// Nginx (prod) proxies /lawsuits/:id, /regulations/:id, /usecases/:id here
// so social crawlers see real titles/descriptions instead of the SPA default.
app.use(publicHtmlRoutes);

// AIKit (Tool Tracker) — reverse-proxied from its FastAPI app on port 8000.
// The proxy strips the /aikit prefix so AIKit sees / instead of /aikit/, then
// rewrites HTML href/action/src/hx-* so they're prefixed back with /aikit
// (AIKit's templates use absolute root paths). Redirect Location headers
// get the same treatment.
import { createProxyMiddleware } from 'http-proxy-middleware';

// Paths that tracker (NOT AIKit) serves. The proxy must NOT prepend /aikit
// to these — otherwise the Grounded header nav links in AIKit pages get
// rewritten to /aikit/legal/... and 404 against the FastAPI app.
const TRACKER_PATH_RE = /^\/(legal|api|assets|login|register|portal|lawsuits|regulations|legal-sources|use-cases-admin|contacts|organisations|programmes|assessments|training-materials|course-builder|curriculum|documents|mentoring|services|marketing|leads|fundraising|settings|intelligence|knowledge|newsletter|database|learning|agents|feedback|map|favicon|robots|sitemap)(\/|$|\?)/;

function rewriteAikitHtml(html) {
  return html.replace(
    /\b(href|action|src|hx-(?:get|post|put|delete))="(\/(?!\/)[^"]*)"/g,
    (match, attr, path) => {
      // AIKit's logout form posts to /auth/logout — route to tracker's
      // unified /api/auth/logout so both cookies (tracker_token + session)
      // get cleared together.
      if (path === '/auth/logout') return `${attr}="/api/auth/logout"`;
      // AIKit's own login/register links go to tracker's unified /login
      // form with a ?next= back to /aikit/ so the SSO bridge mirrors the
      // new tracker session into AIKit.
      if (path === '/login' || path.startsWith('/login?')) {
        return `${attr}="/login?next=/aikit/"`;
      }
      if (path === '/register' || path.startsWith('/register?')) {
        return `${attr}="/login?next=/aikit/"`;
      }
      // Already an AIKit-scoped path — leave alone.
      if (path.startsWith('/aikit')) return match;
      // Tracker-owned path (Grounded header nav, /api/*, static assets,
      // admin routes) — also leave alone so the browser hits tracker.
      if (TRACKER_PATH_RE.test(path)) return match;
      // Everything else is AIKit-served — prefix /aikit so the browser
      // routes back through this proxy.
      return `${attr}="/aikit${path}"`;
    }
  );
}

app.use('/aikit', createProxyMiddleware({
  target: 'http://127.0.0.1:8000',
  changeOrigin: true,
  pathRewrite: { '^/aikit': '' },
  ws: false,
  selfHandleResponse: true,
  on: {
    proxyRes(proxyRes, req, res) {
      // Rewrite redirect Location headers. Same skip rules as
      // rewriteAikitHtml so we don't double-prefix tracker-owned paths.
      const loc = proxyRes.headers['location'];
      if (loc && loc.startsWith('/') && !loc.startsWith('//')) {
        if (loc === '/login' || loc.startsWith('/login?') ||
            loc === '/register' || loc.startsWith('/register?')) {
          proxyRes.headers['location'] = '/login?next=/aikit/';
        } else if (!loc.startsWith('/aikit') && !TRACKER_PATH_RE.test(loc)) {
          proxyRes.headers['location'] = '/aikit' + loc;
        }
      }
      const isHtml = (proxyRes.headers['content-type'] || '').includes('text/html');
      if (!isHtml) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
        return;
      }
      const chunks = [];
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const rewritten = rewriteAikitHtml(body);
        const headers = { ...proxyRes.headers };
        delete headers['content-length'];
        delete headers['content-encoding'];
        res.writeHead(proxyRes.statusCode, headers);
        res.end(rewritten);
      });
    },
  },
}));

// OpenAPI spec + Redoc docs. Mounted before the rate-limited /api/v1 prefix so
// loading the docs page doesn't count against a consumer's daily quota.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const openapiSpec = JSON.parse(readFileSync(pathResolve(__dirname, 'routes/api-v1/openapi.json'), 'utf8'));
app.get('/api/v1/openapi.json', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(openapiSpec);
});
app.get('/api/v1/docs', (req, res) => {
  // Redoc via CDN — single self-contained HTML page, no deps to install.
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AI Legal Public API — v1 docs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}</style>
</head>
<body>
  <redoc spec-url="/api/v1/openapi.json"
         theme='{"colors":{"primary":{"main":"#4F46E5"}},"typography":{"fontSize":"14px"}}'
         hide-download-button="false"></redoc>
  <script src="https://cdn.jsdelivr.net/npm/redoc@2/bundles/redoc.standalone.js"></script>
</body>
</html>`);
});

// /api/v1 adds the documented/versioned contract for third parties. Same
// router as /api/public but with rate limiting + cache headers. Frontend
// keeps using /api/public so cookie-auth flows (chat submissions etc.)
// don't count against anyone's quota.
import { apiRateLimit } from './middleware/api-rate-limit.js';
app.use('/api/v1', apiRateLimit(), publicRoutes);

// Discovery root for the public API — self-describes what's available. Useful
// for consumers who land on /api/v1 without a path.
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'AI Legal Public API',
    version: '1',
    description: 'Global tracker of AI-related lawsuits, regulations, and legal use cases.',
    docs: '/api/v1/docs',
    openapi: '/api/v1/openapi.json',
    endpoints: {
      lawsuits:     { list: 'GET /api/v1/lawsuits', detail: 'GET /api/v1/lawsuits/:id' },
      regulations:  { list: 'GET /api/v1/regulations', detail: 'GET /api/v1/regulations/:id' },
      usecases:     { list: 'GET /api/v1/usecases', detail: 'GET /api/v1/usecases/:id' },
      feed:         { combined: 'GET /api/v1/feed', atom: 'GET /api/v1/feed.atom', rss: 'GET /api/v1/feed.rss' },
      sources:      'GET /api/v1/sources',
      transparency: 'GET /api/v1/transparency',
      submissions:  'POST /api/v1/submissions',
      chat:         'POST /api/v1/chat',
    },
    licence: 'Data: CC-BY-4.0 with attribution to ailegal.co.za. Please cache responses responsibly.',
    rate_limit: 'Currently unlimited and unauthenticated. Set User-Agent header identifying your app + contact email.',
  });
});
// Participant portal: public, token-authenticated
app.use('/api/portal', participantPortalRoutes);
// Lawsuits: all authenticated users (admin + member roles)
app.use('/api/lawsuits', requireAuth, lawsuitRoutes);
// Regulations: all authenticated users (admin + member roles)
app.use('/api/regulations', requireAuth, regulationRoutes);
// Legal sources admin (manages the scraper source pool)
app.use('/api/legal-sources', requireAuth, legalSourcesRoutes);
// AI Legal use-cases CRUD (admin)
app.use('/api/usecases', requireAuth, usecasesRoutes);
// AI chatbot: all authenticated users
app.use('/api/ai-assistant', requireAuth, aiAssistantRoutes);
// Feedback: all authenticated users can submit; admin can view/manage
app.use('/api/feedback', requireAuth, feedbackRoutes);

// ── Admin-only endpoints ───────────────────────────────────────────────────────
// All routes below this point require role = 'admin'.
const admin = express.Router();
admin.use(requireAuth);
admin.use(requireRole('admin'));

admin.use('/sectors',              sectorRoutes);
admin.use('/contacts',             sectorFilter, contactRoutes);
admin.use('/organisations',        sectorFilter, organisationRoutes);
admin.use('/team-members',         teamMemberRoutes);
admin.use('/cohorts',              sectorFilter, cohortRoutes);
admin.use('/needs-assessments',    sectorFilter, needsAssessmentRoutes);
admin.use('/assessment-questions', assessmentQuestionRoutes);
admin.use('/courses',              sectorFilter, courseRoutes);
admin.use('/document-templates',   documentTemplateRoutes);
admin.use('/generated-documents',  sectorFilter, generatedDocumentRoutes);
admin.use('/service-engagements',  sectorFilter, serviceEngagementRoutes);
admin.use('/outreach-campaigns',   sectorFilter, outreachCampaignRoutes);
admin.use('/outreach-messages',    outreachMessageRoutes);
admin.use('/social-posts',         sectorFilter, socialPostRoutes);
admin.use('/gmail',                gmailRoutes);
admin.use('/funders',              funderRoutes);
admin.use('/funding-opportunities', sectorFilter, fundingOpportunityRoutes);
admin.use('/dashboard',            sectorFilter, dashboardRoutes);
admin.use('/background-jobs',      backgroundJobRoutes);
admin.use('/notifications',        notificationRoutes);
admin.use('/knowledge',            knowledgeRoutes);
admin.use('/uploads',              uploadRoutes);
admin.use('/intelligence',         intelligenceRoutes);
admin.use('/newsletter',           newsletterRoutes);
admin.use('/learning-outcomes',    learningOutcomeRoutes);
admin.use('/learning-tasks',       learningTaskRoutes);
admin.use('/learning-journeys',    sectorFilter, learningJourneyRoutes);
admin.use('/participant-tokens',   participantTokenRoutes);
admin.use('/agent-conversations',  agentConversationRoutes);
admin.use('/agent-actions',        agentActionRoutes);

app.use('/api', admin);

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Tracker server running on port ${config.port}`);
  startScheduler();
});
