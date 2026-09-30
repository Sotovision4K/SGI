import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApiAuthBridge } from '../../lib/use-api-auth';
import { ErrorState } from '../ui/ErrorState';
import { LoadingScreen } from '../ui/LoadingScreen';

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
    return <LoadingScreen label="Verificando sesión..." />;
  }

  if (auth.error) {
    return (
      <ErrorState
        title="Error de autenticación"
        message="No se pudo verificar tu sesión. Contacta al administrador si el problema persiste."
        action={{ label: 'Intentar de nuevo', onClick: () => auth.signinRedirect() }}
      />
    );
  }

  if (!auth.isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
