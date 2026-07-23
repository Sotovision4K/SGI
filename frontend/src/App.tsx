import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { CognitoAuthProvider } from './lib/auth-config';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ErrorFallback } from './components/ErrorFallback';
import { ToastContainer } from './components/ui/toast';
import { LandingPage } from './pages/LandingPage';

const queryClient = new QueryClient();

const SignInPage = lazy(() => import('./pages/register/SignInPage').then(m => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import('./pages/register/SignUpPage').then(m => ({ default: m.SignUpPage })));
const ConfirmEmailPage = lazy(() => import('./pages/register/ConfirmEmailPage').then(m => ({ default: m.ConfirmEmailPage })));
const LogoutPage = lazy(() => import('./pages/auth/LogoutPage').then(m => ({ default: m.LogoutPage })));
const ProcessListPage = lazy(() => import('./pages/process/ProcessListPage').then(m => ({ default: m.ProcessListPage })));
const ProcessDetailPage = lazy(() => import('./pages/process/ProcessDetailPage').then(m => ({ default: m.ProcessDetailPage })));
const DiagnosePage = lazy(() => import('./pages/process/DiagnosePage').then(m => ({ default: m.DiagnosePage })));
const DocumentsPage = lazy(() => import('./pages/process/DocumentsPage').then(m => ({ default: m.DocumentsPage })));
const AuditsPage = lazy(() => import('./pages/process/AuditsPage').then(m => ({ default: m.AuditsPage })));
const IndicatorsPage = lazy(() => import('./pages/process/IndicatorsPage').then(m => ({ default: m.IndicatorsPage })));
const NewProcessWizardPage = lazy(() => import('./pages/process/NewProcessWizardPage').then(m => ({ default: m.NewProcessWizardPage })));
const AppLayout = lazy(() => import('./components/layout/AppLayout').then(m => ({ default: m.AppLayout })));
const CompaniesPage = lazy(() => import('./pages/app/CompaniesPage').then(m => ({ default: m.CompaniesPage })));
const AuditsOverviewPage = lazy(() => import('./pages/app/AuditsOverviewPage').then(m => ({ default: m.AuditsOverviewPage })));
const ReportsPage = lazy(() => import('./pages/app/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/app/SettingsPage').then(m => ({ default: m.SettingsPage })));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-text-muted">
      Cargando...
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
        <CognitoAuthProvider>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth/signin" element={<SignInPage />} />
                <Route path="/auth/signup" element={<SignUpPage />} />
                <Route path="/auth/logout" element={<LogoutPage />} />
                <Route path="/confirm-email" element={<ConfirmEmailPage />} />
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route path="/processes" element={<ProcessListPage />} />
                  <Route path="/processes/new" element={<NewProcessWizardPage />} />
                  <Route path="/processes/:processId" element={<ProcessDetailPage />} />
                  <Route path="/processes/:processId/diagnose" element={<DiagnosePage />} />
                  <Route path="/processes/:processId/documents" element={<DocumentsPage />} />
                  <Route path="/processes/:processId/audits" element={<AuditsPage />} />
                  <Route path="/processes/:processId/indicators" element={<IndicatorsPage />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route path="/audits" element={<AuditsOverviewPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
          <ToastContainer />
        </CognitoAuthProvider>
    </QueryClientProvider>
  );
}
export default App;
