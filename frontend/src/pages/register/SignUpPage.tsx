import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User, Phone, CreditCard, AlertCircle, ArrowRight, Building2, UserCircle, Briefcase } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { signUp, isUsernameExistsError } from '../../lib/auth';

const businessTypes = [
  { value: '', label: 'Seleccione tipo de negocio' },
  { value: 'manufacturing', label: 'Manufactura' },
  { value: 'services', label: 'Servicios' },
  { value: 'retail', label: 'Comercio minorista' },
  { value: 'construction', label: 'Construcción' },
  { value: 'healthcare', label: 'Salud' },
  { value: 'education', label: 'Educación' },
  { value: 'technology', label: 'Tecnología' },
  { value: 'finance', label: 'Finanzas' },
  { value: 'other', label: 'Otro' },
];

const signUpSchema = z.object({
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email('Ingrese un correo electrónico válido'),
  phone: z.string().min(1, 'El teléfono es requerido').regex(/^\+\d{10,15}$/, 'El teléfono debe incluir código de área (ej. +50212345678)'),
  govId: z.string().min(1, 'El documento de identidad es requerido'),
  role: z.enum(['company', 'consultant'], {
    required_error: 'Por favor seleccione un rol',
  }),
  businessType: z.string().optional(),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
    .regex(/[a-z]/, 'La contraseña debe contener al menos una minúscula')
    .regex(/[0-9]/, 'La contraseña debe contener al menos un número'),
  confirmPassword: z.string().min(1, 'Por favor confirme su contraseña'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
}).refine((data) => {
  if (data.role === 'company' && !data.businessType) {
    return false;
  }
  return true;
}, {
  message: 'El tipo de negocio es requerido para empresas',
  path: ['businessType'],
});

type SignUpFormData = z.infer<typeof signUpSchema>;

export function SignUpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      role: roleParam === 'company' || roleParam === 'consultant' ? roleParam : undefined,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const selectedRole = watch('role');

const onSubmit = async (data: SignUpFormData) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await signUp(data.email, data.password, {
        name: data.firstName + ' ' + data.lastName,
        phone_number: data.phone,
        'custom:govId': data.govId,
        'custom:role': data.role,
      });

      if (!response.success) {
        if (isUsernameExistsError(response.error || '')) {
          setError('Una cuenta con este correo ya existe. Por favor inicia sesión en su lugar.');
          return;
        }
        setError(response.error || 'El registro falló');
        return;
      }

      navigate(`/confirm-email?email=${encodeURIComponent(data.email)}`);
    } catch {
      setError('Ocurrió un error inesperado');
    } finally {
      setIsLoading(false);
    }
  };

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
              Crea tu cuenta
            </h1>
            <p className="text-lg text-white/70">
              Únete a SGI Pro y acelera tu certificación ISO.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-sm">✓</span>
              </div>
              <span>Acceso a ISO 9001, 14001 e ISO 45001</span>
            </div>
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-sm">✓</span>
              </div>
              <span>Asistente de IA para documentación</span>
            </div>
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-sm">✓</span>
              </div>
              <span>Soporte técnico especializado</span>
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
            <h2 className="text-2xl font-bold text-primary mb-2">Crear Cuenta</h2>
            <p className="text-text-muted">
              Completa el formulario para registrarte
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <Input
                  {...register('firstName')}
                  placeholder="Nombre"
                  className="pl-12"
                  error={errors.firstName?.message}
                />
              </div>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <Input
                  {...register('lastName')}
                  placeholder="Apellido"
                  className="pl-12"
                  error={errors.lastName?.message}
                />
              </div>
            </div>

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                {...register('email')}
                type="email"
                placeholder="Email"
                className="pl-12"
                error={errors.email?.message}
              />
            </div>

            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                {...register('phone')}
                type="tel"
                placeholder="Teléfono (+502XXXXXXXX)"
                className="pl-12"
                error={errors.phone?.message}
              />
            </div>

            <div className="relative">
              <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                {...register('govId')}
                placeholder="Documento de identidad"
                className="pl-12"
                error={errors.govId?.message}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setValue('role', 'company', { shouldValidate: true })}
                className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                  selectedRole === 'company'
                    ? 'border-accent bg-accent-light'
                    : 'border-border hover:border-accent'
                }`}
              >
                <Building2 className={`w-6 h-6 ${selectedRole === 'company' ? 'text-accent' : 'text-primary'}`} />
                <span className="text-sm font-semibold text-primary">Empresa</span>
              </button>

              <button
                type="button"
                onClick={() => setValue('role', 'consultant', { shouldValidate: true })}
                className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                  selectedRole === 'consultant'
                    ? 'border-accent bg-accent-light'
                    : 'border-border hover:border-accent'
                }`}
              >
                <UserCircle className={`w-6 h-6 ${selectedRole === 'consultant' ? 'text-accent' : 'text-primary'}`} />
                <span className="text-sm font-semibold text-primary">Consultor</span>
              </button>
            </div>
            {errors.role && (
              <p className="text-sm text-red-500 -mt-2">{errors.role.message}</p>
            )}

            {selectedRole === 'company' && (
              <div className="relative">
                <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <select
                  {...register('businessType')}
                  className="w-full pl-12 pr-4 py-3 border border-border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                >
                  {businessTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {errors.businessType && (
                  <p className="text-sm text-red-500 mt-1">{errors.businessType.message}</p>
                )}
              </div>
            )}

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                {...register('password')}
                type="password"
                placeholder="Contraseña"
                className="pl-12"
                error={errors.password?.message}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                {...register('confirmPassword')}
                type="password"
                placeholder="Confirmar Contraseña"
                className="pl-12"
                error={errors.confirmPassword?.message}
              />
            </div>

            <Button type="submit" size="lg" loading={isLoading} className="w-full">
              Crear Cuenta <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <p className="mt-6 text-center text-text-muted text-sm">
            ¿Ya tienes una cuenta?{' '}
            <Link to="/auth/signin" className="text-accent font-semibold hover:underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}