import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SectorProvider } from './context/SectorContext.jsx';
import { AiAssistantProvider } from './context/AiAssistantContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ProductShell from './ui/ProductShell.jsx';
import SectionsOverview from './ui/SectionsOverview.jsx';
import SectionRoute from './ui/SectionRoute.jsx';
import FunctionsDirectory from './ui/FunctionsDirectory.jsx';
import StudioShell from './ui/StudioShell.jsx';
import AdminArea from './ui/AdminArea.jsx';

// Redirects non-admin users to /lawsuits for all admin-only routes
function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/lawsuits" replace />;
  return <Outlet />;
}
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ContactsList from './pages/contacts/ContactsList.jsx';
import ContactDetail from './pages/contacts/ContactDetail.jsx';
import OrganisationsList from './pages/organisations/OrganisationsList.jsx';
import OrganisationDetail from './pages/organisations/OrganisationDetail.jsx';
import CohortsList from './pages/programmes/CohortsList.jsx';
import CohortDetail from './pages/programmes/CohortDetail.jsx';
import AssessmentsList from './pages/assessments/AssessmentsList.jsx';
import AssessmentDetail from './pages/assessments/AssessmentDetail.jsx';
import SectorSettings from './pages/settings/SectorSettings.jsx';
import TeamSettings from './pages/settings/TeamSettings.jsx';
import AssessmentQuestions from './pages/settings/AssessmentQuestions.jsx';
import CoursesList from './pages/curriculum/CoursesList.jsx';
import CourseDetail from './pages/curriculum/CourseDetail.jsx';
import DocumentsList from './pages/documents/DocumentsList.jsx';
import DocumentGenerate from './pages/documents/DocumentGenerate.jsx';
import DocumentDetail from './pages/documents/DocumentDetail.jsx';
import DocumentTemplates from './pages/settings/DocumentTemplates.jsx';
import ServicesList from './pages/services/ServicesList.jsx';
import EngagementDetail from './pages/services/EngagementDetail.jsx';
import CampaignsList from './pages/marketing/CampaignsList.jsx';
import CampaignDetail from './pages/marketing/CampaignDetail.jsx';
import SocialContent from './pages/marketing/SocialContent.jsx';
import GmailSettings from './pages/settings/GmailSettings.jsx';
import PipelineView from './pages/fundraising/PipelineView.jsx';
import FundersList from './pages/fundraising/FundersList.jsx';
import FunderDetail from './pages/fundraising/FunderDetail.jsx';
import OpportunityDetail from './pages/fundraising/OpportunityDetail.jsx';
import BackgroundJobs from './pages/settings/BackgroundJobs.jsx';
import IntelligenceList from './pages/intelligence/IntelligenceList.jsx';
import KnowledgeBase from './pages/knowledge/KnowledgeBase.jsx';
import NewsletterDigest from './pages/newsletter/NewsletterDigest.jsx';
import DatabaseEditor from './pages/database/DatabaseEditor.jsx';
import LearningDashboard from './pages/learning/LearningDashboard.jsx';
import JourneyDetail from './pages/learning/JourneyDetail.jsx';
import ParticipantPortal from './pages/portal/ParticipantPortal.jsx';
import CurriculumBuilderAgent from './pages/agents/CurriculumBuilderAgent.jsx';
import LeadFinderAgent from './pages/agents/LeadFinderAgent.jsx';
import ImplementationCoachAgent from './pages/agents/ImplementationCoachAgent.jsx';
import FeedbackList from './pages/feedback/FeedbackList.jsx';
import TrainingMaterials from './pages/curriculum/TrainingMaterials.jsx';
import LeadsPage from './pages/leads/LeadsPage.jsx';
import MentoringPage from './pages/mentoring/MentoringPage.jsx';
import LawsuitTracker from './pages/lawsuits/LawsuitTracker.jsx';
import RegulationTracker from './pages/regulations/RegulationTracker.jsx';
import LegalSourcesPage from './pages/legal-sources/LegalSourcesPage.jsx';
import IngestionPage from './pages/ingestion/IngestionPage.jsx';
import ScraperDashboard from './pages/scraper/ScraperDashboard.jsx';
import NewsroomProfile from './pages/settings/NewsroomProfile.jsx';
import ReferenceData from './pages/settings/ReferenceData.jsx';
import UseCasesAdmin from './pages/usecases/UseCasesAdmin.jsx';
import NodesAdmin from './pages/nodes/NodesAdmin.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import NewsroomsAdmin from './pages/admin/NewsroomsAdmin.jsx';
import Insights from './pages/admin/Insights.jsx';
import UserQuestions from './pages/admin/UserQuestions.jsx';
import PulseGate from './pages/pulse/PulseGate.jsx';
import PulseOverview from './pages/pulse/PulseOverview.jsx';
import PulseCycleDetail from './pages/pulse/PulseCycleDetail.jsx';
import PulseNewsroomDetail from './pages/pulse/PulseNewsroomDetail.jsx';
import PulseAnswer from './pages/pulse/PulseAnswer.jsx';
import { lazy, Suspense } from 'react';
import PublicLayout from './pages/public/PublicLayout.jsx';
import PublicHome from './pages/public/PublicHome.jsx';
import BeAIReadyLayout from './pages/beaiready/BeAIReadyLayout.jsx';
import BeAIReadyHome from './pages/beaiready/BeAIReadyHome.jsx';
import BeAIReadyRedirect from './pages/beaiready/BeAIReadyRedirect.jsx';
import BusinessDashboard from './pages/beaiready/BusinessDashboard.jsx';
import BusinessGovernance from './pages/beaiready/BusinessGovernance.jsx';
import BeAIReadyPillar from './pages/beaiready/BeAIReadyPillar.jsx';
import BeAIReadyToolbox from './pages/beaiready/BeAIReadyToolbox.jsx';
import BeAIReadyTraining from './pages/beaiready/BeAIReadyTraining.jsx';
import PublicLawsuitsList from './pages/public/PublicLawsuitsList.jsx';
import PublicLawsuitDetail from './pages/public/PublicLawsuitDetail.jsx';
import PublicRegulationsList from './pages/public/PublicRegulationsList.jsx';
import PublicRegulationDetail from './pages/public/PublicRegulationDetail.jsx';
// Code-split these — not on the critical path. Especially PublicExplore which
// pulls in react-force-graph-2d + d3-force (~300KB gzipped on its own).
const PublicExplore  = lazy(() => import('./pages/public/PublicExplore.jsx'));
const PublicSources  = lazy(() => import('./pages/public/PublicSources.jsx'));
const PublicMonetisation = lazy(() => import('./pages/public/PublicMonetisation.jsx'));
const PublicLegalDashboard = lazy(() => import('./pages/public/PublicLegalDashboard.jsx'));
const EthicsPolicyBuilder = lazy(() => import('./pages/public/EthicsPolicyBuilder.jsx'));
const PublicToolsDirectory = lazy(() => import('./pages/public/PublicToolsDirectory.jsx'));
const PublicTraining = lazy(() => import('./pages/public/PublicTraining.jsx'));
const BuilderPage = lazy(() => import('./pages/builder/BuilderPage.jsx'));
const RunPage = lazy(() => import('./pages/builder/RunPage.jsx'));
const ToolsHub = lazy(() => import('./pages/toolkit/ToolsHub.jsx'));
const ToolWorkspace = lazy(() => import('./pages/toolkit/ToolWorkspace.jsx'));
const PublicUseCases = lazy(() => import('./pages/public/PublicUseCases.jsx'));
const PublicTools    = lazy(() => import('./pages/public/PublicTools.jsx'));
const PublicAwareness = lazy(() => import('./pages/public/PublicAwareness.jsx'));
const PublicEthics   = lazy(() => import('./pages/public/PublicEthics.jsx'));

function LazyFallback() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Loading…
    </div>
  );
}

// One app, two doors (BEAIREADY spec Part B). On beaiready.* the public routes
// wrap in BeAIReadyLayout and / renders the BE AI READY landing; on every other
// host (grounded.*) behaviour is byte-for-byte unchanged — PublicShell is just
// PublicLayout and PublicRootHome is PublicHome.
// Dev-only escape hatch (stripped from production builds): the headless test
// browser can't resolve beaiready.localhost, so sessionStorage 'beaiready'='1'
// forces the BE AI READY door on the dev server.
const IS_BEAIREADY = typeof window !== 'undefined' &&
  (window.location.hostname.startsWith('beaiready') ||
   (import.meta.env.DEV && window.sessionStorage.getItem('beaiready') === '1'));
const PublicShell = IS_BEAIREADY ? BeAIReadyLayout : PublicLayout;
const PublicRootHome = IS_BEAIREADY ? BeAIReadyHome : PublicHome;

export default function App() {
  return (
    <AuthProvider>
      <SectorProvider>
        <AiAssistantProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<ParticipantPortal />} />
          {/* On the main host, /beaiready reroutes to the dedicated subdomain. */}
          <Route path="/beaiready" element={<BeAIReadyRedirect />} />
          {/* The step-1 staging preview is now the real product (ProductShell at
              /sections). Old preview link redirects so nothing 404s. */}
          <Route path="/_preview" element={<Navigate to="/sections" replace />} />
          {/* Pulse public answer page — newsroom-facing, no login (Phase 4). */}
          <Route path="/pulse/:token" element={<PulseAnswer />} />

          {/* ── Public site root (/) — PublicShell + home pick the door by host
              (grounded.* → PublicLayout/PublicHome; beaiready.* → the BE AI READY
              landing). Sub-pages live under /legal/* to avoid colliding with
              admin routes (/lawsuits, /regulations, /sources, etc.). */}
          <Route path="/" element={<PublicShell />}>
            <Route index element={<PublicRootHome />} />
          </Route>

          {/* ── BE AI READY public pages — the offering itself (only mounted on
                the beaiready door; every nav item is a real page on THIS site). ── */}
          {IS_BEAIREADY && (
            <Route element={<BeAIReadyLayout />}>
              <Route path="/pillar/:key" element={<BeAIReadyPillar />} />
              <Route path="/toolbox" element={<BeAIReadyToolbox />} />
            </Route>
          )}

          {/* ── Public AI Legal site (sub-pages) — no auth required ── */}
          <Route path="/legal" element={<PublicShell />}>
            <Route index element={<PublicHome />} />
            <Route path="dashboard"      element={<Suspense fallback={<LazyFallback />}><PublicLegalDashboard /></Suspense>} />
            <Route path="ethics-builder" element={<Suspense fallback={<LazyFallback />}><EthicsPolicyBuilder /></Suspense>} />
            <Route path="lawsuits" element={<PublicLawsuitsList />} />
            <Route path="lawsuits/:id" element={<PublicLawsuitDetail />} />
            <Route path="regulations" element={<PublicRegulationsList />} />
            <Route path="regulations/:id" element={<PublicRegulationDetail />} />
            <Route path="explore"        element={<Suspense fallback={<LazyFallback />}><PublicExplore /></Suspense>} />
            <Route path="sources"        element={<Suspense fallback={<LazyFallback />}><PublicSources /></Suspense>} />
            {/* Submit is folded into the Feedback mechanism (the bubble). Old links redirect. */}
            <Route path="submit"         element={<Navigate to="/legal" replace />} />
            <Route path="use-cases"      element={<Suspense fallback={<LazyFallback />}><PublicUseCases mode="list" /></Suspense>} />
            <Route path="use-cases/:id"  element={<Suspense fallback={<LazyFallback />}><PublicUseCases mode="detail" /></Suspense>} />
            <Route path="ethics"         element={<Suspense fallback={<LazyFallback />}><PublicEthics /></Suspense>} />
            <Route path="tools"          element={<Suspense fallback={<LazyFallback />}><PublicTools mode="list" /></Suspense>} />
            <Route path="tools/:slug"    element={<Suspense fallback={<LazyFallback />}><PublicTools mode="detail" /></Suspense>} />
            {/* Old path, now rolled into /legal/sources */}
            <Route path="transparency" element={<Navigate to="/legal/sources" replace />} />
          </Route>

          {/* ── Monetisation — third top-level public section ── */}
          <Route path="/monetisation" element={<PublicShell />}>
            <Route index element={<Suspense fallback={<LazyFallback />}><PublicMonetisation /></Suspense>} />
          </Route>

          {/* ── Open-source tools directory (reached from the Tools page) ── */}
          <Route path="/open-source" element={<PublicShell />}>
            <Route index element={<Suspense fallback={<LazyFallback />}><PublicToolsDirectory /></Suspense>} />
          </Route>

          {/* ── Training — host-aware: the BE AI READY door gets the business
                training offer; Grounded keeps the newsroom course library. ── */}
          <Route path="/training" element={<PublicShell />}>
            <Route index element={IS_BEAIREADY
              ? <BeAIReadyTraining />
              : <Suspense fallback={<LazyFallback />}><PublicTraining /></Suspense>} />
          </Route>

          {/* ── BE AI READY business authed area (spec Part C). On the beaiready
                host the ONLY authed surface is the client dashboard; the newsroom
                product/admin/studio routes below aren't mounted there at all, so a
                business user can never reach the newsroom UI. ── */}
          {IS_BEAIREADY && (
            <Route element={<ProtectedRoute />}>
              <Route element={<BeAIReadyLayout />}>
                <Route path="/dashboard" element={<BusinessDashboard />} />
                <Route path="/dashboard/governance" element={<BusinessGovernance />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          )}

          {/* ── The newsroom product / platform-admin / studio surfaces — mounted
                on the grounded host only (not on the beaiready business door). ── */}
          {!IS_BEAIREADY && (<>
          {/* ── ProductShell — the concept-note-led newsroom product (Phase 1 · steps 2 + 5).
                The 5 sections + 3 strategic layers + the real product pages: Builder, Run,
                Awareness, the Tracker (lawsuits + regulations), Pulse and Profile. Login
                required; Pulse + Profile stay admin-gated exactly as before. ── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<ProductShell />}>
              <Route path="/sections" element={<SectionsOverview />} />
              <Route path="/sections/:key" element={<SectionRoute />} />
              <Route path="/functions" element={<FunctionsDirectory />} />
              <Route path="/builder" element={<Suspense fallback={<LazyFallback />}><BuilderPage /></Suspense>} />
              <Route path="/run" element={<Suspense fallback={<LazyFallback />}><RunPage /></Suspense>} />
              <Route path="/awareness" element={<Suspense fallback={<LazyFallback />}><PublicAwareness /></Suspense>} />
              {/* Tracker — available to all authenticated users */}
              <Route path="/lawsuits" element={<LawsuitTracker />} />
              <Route path="/regulation-tracker" element={<RegulationTracker />} />
              {/* Pulse + Profile — admin-gated (unchanged), reached from the section pages */}
              <Route element={<AdminRoute />}>
                <Route path="/admin/pulse" element={<PulseGate><PulseOverview /></PulseGate>} />
                <Route path="/admin/pulse/cycles/:id" element={<PulseGate><PulseCycleDetail /></PulseGate>} />
                <Route path="/admin/pulse/newsrooms/:id" element={<PulseGate><PulseNewsroomDetail /></PulseGate>} />
                <Route path="/settings/newsroom-profile" element={<NewsroomProfile />} />
              </Route>
            </Route>
          </Route>

          {/* Toolkit pages stay in the public chrome for now — folded into the
              Content Production functions directory in step 6. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/tools-hub" element={<PublicLayout />}>
              <Route index element={<Suspense fallback={<LazyFallback />}><ToolsHub /></Suspense>} />
            </Route>
            <Route path="/tool/:slug" element={<PublicLayout />}>
              <Route index element={<Suspense fallback={<LazyFallback />}><ToolWorkspace /></Suspense>} />
            </Route>
          </Route>

          {/* ── AdminArea — GROUNDED platform admin (Phase 1 · step 5). Admin-gated,
                its own operator shell (replaces the old admin Layout/Sidebar). Gathers
                the platform ops — command centre, tracker ingestion, Nodes, feedback,
                users, reference data, jobs, policy docs — into one area. Component code
                + paths unchanged. Reached via the admin-only "Admin" entry in ProductShell. ── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminRoute />}>
              <Route element={<AdminArea />}>
                <Route path="/admin" element={<AdminOverview />} />
                <Route path="/newsrooms-admin" element={<NewsroomsAdmin />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/admin/questions" element={<UserQuestions />} />
                <Route path="/scraper-dashboard" element={<ScraperDashboard />} />
                <Route path="/ingestion" element={<IngestionPage />} />
                <Route path="/legal-sources" element={<LegalSourcesPage />} />
                <Route path="/use-cases-admin" element={<UseCasesAdmin />} />
                <Route path="/node-admin" element={<NodesAdmin />} />
                <Route path="/documents" element={<DocumentsList />} />
                <Route path="/documents/new" element={<DocumentGenerate />} />
                <Route path="/documents/:id" element={<DocumentDetail />} />
                <Route path="/feedback" element={<FeedbackList />} />
                <Route path="/settings/team" element={<TeamSettings />} />
                <Route path="/settings/reference-data" element={<ReferenceData />} />
                <Route path="/settings/jobs" element={<BackgroundJobs />} />
              </Route>
            </Route>
          </Route>

          {/* ── Studio — Develop AI back-office (Phase 1 · step 4). Admin-gated,
                its own StudioShell. Component code + paths are UNCHANGED (so every
                internal link and bookmark survives); only the wrapping shell + nav
                placement moved out of the Grounded admin sidebar. Reversible. ── */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminRoute />}>
              <Route element={<StudioShell />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/agents" element={<BackgroundJobs />} />
                <Route path="/agents/curriculum" element={<CurriculumBuilderAgent />} />
                <Route path="/agents/leads" element={<LeadFinderAgent />} />
                <Route path="/agents/coach" element={<ImplementationCoachAgent />} />
                <Route path="/contacts" element={<ContactsList />} />
                <Route path="/contacts/:id" element={<ContactDetail />} />
                <Route path="/organisations" element={<OrganisationsList />} />
                <Route path="/organisations/:id" element={<OrganisationDetail />} />
                <Route path="/programmes" element={<CohortsList />} />
                <Route path="/programmes/:id" element={<CohortDetail />} />
                <Route path="/assessments" element={<AssessmentsList />} />
                <Route path="/assessments/:id" element={<AssessmentDetail />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/training-materials" element={<TrainingMaterials />} />
                <Route path="/course-builder" element={<CurriculumBuilderAgent />} />
                <Route path="/curriculum" element={<CoursesList />} />
                <Route path="/curriculum/:id" element={<CourseDetail />} />
                <Route path="/mentoring" element={<MentoringPage />} />
                <Route path="/services" element={<ServicesList />} />
                <Route path="/services/:id" element={<EngagementDetail />} />
                <Route path="/marketing/campaigns" element={<CampaignsList />} />
                <Route path="/marketing/campaigns/:id" element={<CampaignDetail />} />
                <Route path="/marketing/social" element={<SocialContent />} />
                <Route path="/fundraising" element={<PipelineView />} />
                <Route path="/fundraising/funders" element={<FundersList />} />
                <Route path="/fundraising/funders/:id" element={<FunderDetail />} />
                <Route path="/fundraising/opportunities/:id" element={<OpportunityDetail />} />
                <Route path="/intelligence" element={<IntelligenceList />} />
                <Route path="/knowledge" element={<KnowledgeBase />} />
                <Route path="/newsletter" element={<NewsletterDigest />} />
                <Route path="/database" element={<DatabaseEditor />} />
                <Route path="/learning" element={<LearningDashboard />} />
                <Route path="/learning/:contactId" element={<JourneyDetail />} />
                <Route path="/settings/sectors" element={<SectorSettings />} />
                <Route path="/settings/gmail" element={<GmailSettings />} />
              </Route>
            </Route>
          </Route>
          </>)}
        </Routes>
        </AiAssistantProvider>
      </SectorProvider>
    </AuthProvider>
  );
}
