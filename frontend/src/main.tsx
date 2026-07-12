import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { Layout } from './components/Layout'
import { RoleProvider } from './lib/useRole'
import { RequireAdmin } from './components/RequireAdmin'
import { ErrorBoundary } from './components/ErrorBoundary'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Agents = lazy(() => import('./pages/Agents').then((m) => ({ default: m.Agents })))
const AgentDetail = lazy(() => import('./pages/AgentDetail').then((m) => ({ default: m.AgentDetail })))
const Leads = lazy(() => import('./pages/Leads').then((m) => ({ default: m.Leads })))
const LeadScraper = lazy(() => import('./pages/LeadScraper').then((m) => ({ default: m.LeadScraper })))
const CallIntelligence = lazy(() => import('./pages/CallIntelligence').then((m) => ({ default: m.CallIntelligence })))
const CallIntelligenceList = lazy(() => import('./pages/CallIntelligenceList').then((m) => ({ default: m.CallIntelligenceList })))
const NextBestAction = lazy(() => import('./pages/NextBestAction').then((m) => ({ default: m.NextBestAction })))
const Coaching = lazy(() => import('./pages/Coaching').then((m) => ({ default: m.Coaching })))
const Training = lazy(() => import('./pages/Training').then((m) => ({ default: m.Training })))
const Pipeline = lazy(() => import('./pages/Pipeline').then((m) => ({ default: m.Pipeline })))
const Assistant = lazy(() => import('./pages/Assistant').then((m) => ({ default: m.Assistant })))
const Logs = lazy(() => import('./pages/Logs').then((m) => ({ default: m.Logs })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const MondayBoardView = lazy(() => import('./pages/monday/MondayBoardView').then((m) => ({ default: m.MondayBoardView })))
const MondayItemView = lazy(() => import('./pages/monday/MondayItemView').then((m) => ({ default: m.MondayItemView })))
const MondayDashboardView = lazy(() => import('./pages/monday/MondayDashboardView').then((m) => ({ default: m.MondayDashboardView })))
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })))

function Loader() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-text-muted">Cargando…</div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RoleProvider>
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Panel principal con sidebar */}
            <Route element={<Layout />}>
              {/* Solo administradores (los vendedores se redirigen a Análisis IA) */}
              <Route index element={<RequireAdmin><Dashboard /></RequireAdmin>} />
              <Route path="agents" element={<RequireAdmin><Agents /></RequireAdmin>} />
              <Route path="agents/:id" element={<RequireAdmin><AgentDetail /></RequireAdmin>} />
              {/* Vendedores y administradores */}
              <Route path="leads" element={<Leads />} />
              <Route path="prospeccion" element={<LeadScraper />} />
              <Route path="seguimiento" element={<NextBestAction />} />
              <Route path="entrenamiento" element={<Training />} />
              {/* Solo administradores */}
              <Route path="call-intelligence" element={<RequireAdmin><CallIntelligenceList /></RequireAdmin>} />
              <Route path="call-intelligence/:id" element={<RequireAdmin><CallIntelligence /></RequireAdmin>} />
              <Route path="pipeline" element={<RequireAdmin><Pipeline /></RequireAdmin>} />
              <Route path="asistente" element={<RequireAdmin><Assistant /></RequireAdmin>} />
              <Route path="coaching" element={<RequireAdmin><Coaching /></RequireAdmin>} />
              <Route path="logs" element={<RequireAdmin><Logs /></RequireAdmin>} />
              <Route path="settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
            </Route>

            {/* Landing page pública */}
            <Route path="landing" element={<LandingPage />} />

            {/* Vistas embebidas en Monday.com — sin sidebar */}
            <Route path="monday/board" element={<ErrorBoundary><MondayBoardView /></ErrorBoundary>} />
            <Route path="monday/item" element={<ErrorBoundary><MondayItemView /></ErrorBoundary>} />
            <Route path="monday/dashboard" element={<ErrorBoundary><MondayDashboardView /></ErrorBoundary>} />
          </Routes>
        </Suspense>
      </RoleProvider>
    </BrowserRouter>
  </StrictMode>,
)
