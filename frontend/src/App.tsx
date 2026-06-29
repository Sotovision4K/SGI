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
                <Route
                  path="/processes"
                  element={
                    <ProtectedRoute>
                      <ProcessListPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/processes/:processId"
                  
                  element={
                    <ProtectedRoute>
                      <ProcessDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/processes/:processId/diagnose"
                  element={
                    <ProtectedRoute>
                      <DiagnosePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/processes/:processId/documents"
                  element={
                    <ProtectedRoute>
                      <DocumentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/processes/:processId/audits"
                  element={
                    <ProtectedRoute>
                      <AuditsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/processes/:processId/indicators"
                  element={
                    <ProtectedRoute>
                      <IndicatorsPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Suspense>
          </ErrorBoundary>
          <ToastContainer />
        </CognitoAuthProvider>
    </QueryClientProvider>
  );
}


export default App;
