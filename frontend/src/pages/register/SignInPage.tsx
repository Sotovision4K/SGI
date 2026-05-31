import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export function SignInPage() {
  const { isAuthenticated, isLoading, signinRedirect, error } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      window.location.replace('/api/v1/process');
    }
  }, [isAuthenticated, isLoading]);

  const handleSignIn = () => {
    signinRedirect();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-soft flex items-center justify-center">
        <div className="text-text-muted">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-soft flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-gradient opacity-30"></div>
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="mb-12">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white text-lg font-extrabold mb-6">
              SGI
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">
              Bienvenido a SGI Pro
            </h1>
            <p className="text-lg text-white/70">
              Automatiza tu Sistema Integrado de Gestión con precisión y confiabilidad.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-sm">✓</span>
              </div>
              <span>Certificación ISO acelerada</span>
            </div>
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-sm">✓</span>
              </div>
              <span>Gestión simplificada de documentos</span>
            </div>
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-sm">✓</span>
              </div>
              <span>Soporte para múltiples normas ISO</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Content */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white text-sm font-extrabold mb-2">
              SGI
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-primary mb-2">Iniciar Sesión</h2>
            <p className="text-text-muted">
              Accede a tu cuenta para gestionar tus certificaciones ISO
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <Button
            onClick={handleSignIn}
            size="lg"
            className="w-full"
          >
            Iniciar Sesión <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <p className="mt-6 text-center text-text-muted text-sm">
            ¿No tienes una cuenta?{' '}
            <Link to="/auth/signup" className="text-accent font-semibold hover:underline">
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}