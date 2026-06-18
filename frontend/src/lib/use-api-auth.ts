import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { setUnauthorizedHandler } from './api-client';

export function useApiAuthBridge() {
  const auth = useAuth();

  useEffect(() => {
    setUnauthorizedHandler((status) => {
      if (status === 401 && auth.isAuthenticated) {
        auth.signinRedirect();
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [auth]);

  return {
    getToken: (): string | null => auth.user?.access_token ?? null,
  };
}
