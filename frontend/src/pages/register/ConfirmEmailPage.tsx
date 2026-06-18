import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from 'react-oidc-context';
import { Mail, Lock, AlertCircle, CheckCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { confirmSignUp, resendConfirmationCode, isExpiredCodeError } from '../../lib/auth';

// Constants
const VERIFICATION_CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const SUCCESS_REDIRECT_DELAY_MS = 2000;

const confirmSchema = z.object({
  code: z.string().min(VERIFICATION_CODE_LENGTH, `El código de verificación debe tener ${VERIFICATION_CODE_LENGTH} dígitos`).max(VERIFICATION_CODE_LENGTH, `El código de verificación debe tener ${VERIFICATION_CODE_LENGTH} dígitos`),
});

type ConfirmFormData = z.infer<typeof confirmSchema>;

export function ConfirmEmailPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmFormData>({
    resolver: zodResolver(confirmSchema),
  });

  useEffect(() => {
    if (!email) {
      navigate('/auth/signup');
    }
  }, [email, navigate]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const onSubmit = async (data: ConfirmFormData) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await confirmSignUp(email, data.code);

      if (!response.success) {
        if (isExpiredCodeError(response.error || '')) {
          setError('El código de verificación ha expirado. Por favor solicita uno nuevo.');
          return;
        }
        setError(response.error || 'Código de verificación inválido');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        const redirectTarget = (import.meta.env.VITE_REDIRECT_SIGN_IN as string | undefined) || '/processes';
        if (auth.user?.id_token) {
          window.history.replaceState({}, document.title, redirectTarget);
          window.location.replace(redirectTarget);
        } else {
          auth.signinRedirect();
        }
      }, SUCCESS_REDIRECT_DELAY_MS);
    } catch {
      setError('Ocurrió un error inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isResending) return;

    setError(null);
    setIsResending(true);

    try {
      const response = await resendConfirmationCode(email);

      if (!response.success) {
        setError(response.error || 'No se pudo reenviar el código');
        return;
      }

      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError('No se pudo reenviar el código');
    } finally {
      setIsResending(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-bg-soft flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-primary mb-2">¡Email Confirmado!</h2>
          <p className="text-text-muted mb-6">
            Tu cuenta ha sido verificada exitosamente. Redirigiendo...
          </p>
        </div>
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
              Verifica tu Email
            </h1>
            <p className="text-lg text-white/70">
              Hemos enviado un código de verificación a tu correo electrónico.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <span>Revisa tu bandeja de entrada</span>
            </div>
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <span>Código válido por 24 horas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo placeholder */}
          <div className="mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white text-sm font-extrabold mb-2">
              SGI
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-primary mb-2">Confirmar Email</h2>
            <p className="text-text-muted">
              Ingresa el código de verificación enviado a:
            </p>
            <p className="text-accent font-semibold mt-1">{email}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                {...register('code')}
                type="text"
                placeholder="Código de verificación"
                className="pl-12 text-center text-lg tracking-widest"
                maxLength={VERIFICATION_CODE_LENGTH}
                error={errors.code?.message}
              />
            </div>

            <Button type="submit" size="lg" loading={isLoading} className="w-full">
              Verificar <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-text-muted text-sm mb-3">
              ¿No recibiste el código?
            </p>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0 || isResending}
              className="text-accent font-semibold hover:underline disabled:text-text-muted disabled:no-underline flex items-center justify-center gap-2 mx-auto"
            >
              <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
              {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
            </button>
          </div>

          <p className="mt-6 text-center text-text-muted text-sm">
            ¿Ya tienes una cuenta verificada?{' '}
            <a href="/auth/signin" className="text-accent font-semibold hover:underline">
              Inicia sesión
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}