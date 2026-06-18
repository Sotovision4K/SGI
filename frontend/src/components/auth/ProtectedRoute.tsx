import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApiAuthBridge } from '../../lib/use-api-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useApiAuthBridge();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      auth.signinRedirect({ state: { from: location.pathname } });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate, location, auth]);

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-soft">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-text-muted">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
