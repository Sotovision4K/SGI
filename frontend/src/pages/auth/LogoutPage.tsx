import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { LoadingScreen } from '../../components/ui/LoadingScreen';

export function LogoutPage() {
  const { signoutRedirect } = useAuth();

  useEffect(() => {
    signoutRedirect();
  }, [signoutRedirect]);

  return <LoadingScreen label="Cerrando sesión..." />;
}