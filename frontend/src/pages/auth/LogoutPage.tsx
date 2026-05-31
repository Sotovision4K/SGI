import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';

export function LogoutPage() {
  const { signoutRedirect } = useAuth();

  useEffect(() => {
    signoutRedirect();
  }, []);

  return (
    <div className="min-h-screen bg-bg-soft flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-text-muted">Cerrando sesión...</p>
      </div>
    </div>
  );
}