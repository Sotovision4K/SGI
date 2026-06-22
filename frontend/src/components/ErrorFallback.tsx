import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  // Log for debugging — never show raw error to user
  console.error('[ErrorFallback]', new Date().toISOString(), error.message);

  return (
    <div className="min-h-screen bg-bg-soft flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>

        <h1 className="text-xl font-semibold text-text-main mb-3">
          Error inesperado
        </h1>

        <p className="text-text-muted mb-2">
          Ha ocurrido un error inesperado en la aplicación.
        </p>

        <p className="text-text-muted text-sm mb-6">
          Intenta recargar la página. Si el problema persiste,
          contacta al administrador en{' '}
          <a href="mailto:soporte@sgipro.com" className="text-accent underline">
            soporte@sgipro.com
          </a>
          .
        </p>

        <Button onClick={resetErrorBoundary} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Recargar página
        </Button>
      </div>
    </div>
  );
}
