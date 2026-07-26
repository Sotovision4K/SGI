import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../ui/Input';
import { SelectNative } from '../ui/Select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/Dialog';
import { useCreateCompany } from '../../hooks/useCompanies';
import type { Company } from '../../api/company';

// ── Schema ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export const companyFormSchema = z
  .object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(200),
    business_type: z.string().min(1, 'Seleccione el tipo de industria').max(50),
    business_type_custom: z.string().optional(),
    contact_name: z.string().min(1, 'El responsable es obligatorio').max(100),
    contact_email: z.string().email('Correo electrónico inválido').max(255),
    contact_email_confirm: z.string().email('Correo electrónico inválido'),
    contact_phone: z.string().max(30).optional(),
  })
  .refine((data) => data.contact_email === data.contact_email_confirm, {
    message: 'Los correos no coinciden',
    path: ['contact_email_confirm'],
  })
  .refine(
    (data) => {
      if (data.business_type === 'otro') return !!data.business_type_custom?.trim();
      return true;
    },
    {
      message: 'Especifique el tipo de industria',
      path: ['business_type_custom'],
    },
  );

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

// ── Business type options ───────────────────────────────────────────────────
const BUSINESS_TYPES: Array<{ value: string; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'manufactura', label: 'Manufactura' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'tecnología', label: 'Tecnología' },
  { value: 'construcción', label: 'Construcción' },
  { value: 'alimentos', label: 'Alimentos' },
  { value: 'salud', label: 'Salud' },
  { value: 'otro', label: 'Otro' },
];

const BUSINESS_LABELS: Record<string, string> = Object.fromEntries(
  BUSINESS_TYPES.map((opt) => [opt.value, opt.label]),
);

// ── Props ──────────────────────────────────────────────────────────────────
interface CompanyFormProps {
  variant: 'inline' | 'dialog';
  onSuccess: (company: Company) => void;
  onCancel?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  existingCompanyNames?: string[];
}

type Phase = 'edit' | 'review';

function ErrorSlot({ message }: { message?: string }) {
  return (
    <p
      className="mt-1.5 text-sm text-red-500 min-h-[20px]"
      data-slot="field-error"
      role={message ? 'alert' : undefined}
    >
      {message ?? ''}
    </p>
  );
}

const PRIMARY_BTN =
  'inline-flex items-center justify-center px-6 py-3 text-base font-semibold rounded-lg transition-all duration-200 bg-app-primary text-white hover:bg-app-primary/90 focus:outline-none focus:ring-2 focus:ring-app-accent disabled:opacity-50 disabled:cursor-not-allowed';
const SECONDARY_BTN =
  'inline-flex items-center justify-center px-6 py-3 text-base font-semibold rounded-lg transition-all duration-200 border border-app-border text-app-text hover:bg-app-bg focus:outline-none focus:ring-2 focus:ring-app-accent disabled:opacity-50 disabled:cursor-not-allowed';

export function CompanyForm({
  variant,
  onSuccess,
  onCancel,
  open,
  onOpenChange,
  existingCompanyNames = [],
}: CompanyFormProps) {
  const [phase, setPhase] = useState<Phase>('edit');
  const [createAnyway, setCreateAnyway] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const mutation = useCreateCompany();

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: '',
      business_type: '',
      business_type_custom: '',
      contact_name: '',
      contact_email: '',
      contact_email_confirm: '',
      contact_phone: '',
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const nameValue = watch('name');
  const businessTypeValue = watch('business_type');

  // Duplicate-name soft warning (case-insensitive)
  const matchingExisting = existingCompanyNames.find(
    (n) => n.trim().toLowerCase() === (nameValue?.trim().toLowerCase() ?? ''),
  );
  const showDuplicateWarning = !!matchingExisting && matchingExisting.trim() !== '';

  const onSubmitReview = () => {
    if (showDuplicateWarning && !createAnyway) {
      setReviewError('Confirma crear una empresa duplicada');
      return;
    }
    setReviewError('');
    setPhase('review');
  };

  const onConfirm = async () => {
    const values = getValues();
    try {
      const company = await mutation.mutateAsync({
        name: values.name,
        business_type: values.business_type,
        business_type_custom:
          values.business_type === 'otro' ? values.business_type_custom : undefined,
        contact_name: values.contact_name,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone,
      });
      reset();
      setPhase('edit');
      setCreateAnyway(false);
      onSuccess(company);
    } catch {
      // Error toast handled by useCreateCompany
    }
  };

  // ── Edit phase ──────────────────────────────────────────────────────────
  const editForm = (
    <form onSubmit={handleSubmit(onSubmitReview)} noValidate className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">
          Nombre de la empresa
        </label>
        <Input placeholder="Nombre de la empresa" {...register('name')} />
        <ErrorSlot message={errors.name?.message} />
      </div>

      {showDuplicateWarning && (
        <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-3 text-sm text-app-text">
          <p>
            Ya tienes una empresa llamada &lsquo;{matchingExisting}&rsquo;. ¿Crear otra?
          </p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={createAnyway}
              onChange={(e) => setCreateAnyway(e.target.checked)}
            />
            <span>Sí, crear de todas formas</span>
          </label>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">
          Tipo de industria
        </label>
        <SelectNative {...register('business_type')}>
          <option value="">Seleccione tipo...</option>
          {BUSINESS_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectNative>
        <ErrorSlot message={errors.business_type?.message} />
      </div>

      {businessTypeValue === 'otro' && (
        <div>
          <label className="block text-sm font-medium text-app-text mb-1.5">
            Especifique el tipo de industria
          </label>
          <Input placeholder="Especifique el tipo" {...register('business_type_custom')} />
          <ErrorSlot message={errors.business_type_custom?.message} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">
          Responsable del proceso
        </label>
        <Input placeholder="Nombre del responsable" {...register('contact_name')} />
        <ErrorSlot message={errors.contact_name?.message} />
      </div>

      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">
          Correo de contacto
        </label>
        <Input type="email" placeholder="correo@empresa.com" {...register('contact_email')} />
        <ErrorSlot message={errors.contact_email?.message} />
      </div>

      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">
          Confirmar correo
        </label>
        <Input
          type="email"
          placeholder="Confirme correo electrónico"
          {...register('contact_email_confirm')}
        />
        <ErrorSlot message={errors.contact_email_confirm?.message} />
      </div>

      <div>
        <label className="block text-sm font-medium text-app-text mb-1.5">
          Teléfono (opcional)
        </label>
        <Input placeholder="+34 600 000 000" {...register('contact_phone')} />
        <ErrorSlot message={errors.contact_phone?.message} />
      </div>

      {reviewError && (
        <p className="text-sm text-red-500 min-h-[20px]" role="alert">
          {reviewError}
        </p>
      )}

      <div className="flex items-center gap-3 mt-2">
        <button type="submit" className={PRIMARY_BTN} disabled={mutation.isPending}>
          Revisar
        </button>
        {onCancel && (
          <button type="button" className={SECONDARY_BTN} onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );

  // ── Review phase ────────────────────────────────────────────────────────
  const values = getValues();
  const reviewRows: Array<{ label: string; value: string }> = [
    { label: 'Nombre de la empresa', value: values.name },
    {
      label: 'Tipo de industria',
      value:
        values.business_type === 'otro'
          ? `Otro: ${values.business_type_custom ?? ''}`
          : BUSINESS_LABELS[values.business_type] ?? values.business_type,
    },
    { label: 'Responsable del proceso', value: values.contact_name },
    { label: 'Correo de contacto', value: values.contact_email },
    { label: 'Teléfono', value: values.contact_phone?.trim() ? values.contact_phone : '—' },
  ];

  const reviewForm = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-app-border rounded-lg border border-app-border">
        {reviewRows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-app-muted">
              {row.label}
            </span>
            <span className="text-base text-app-text">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          className={PRIMARY_BTN}
          onClick={onConfirm}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Registrando...' : 'Confirmar y registrar'}
        </button>
        <button
          type="button"
          className={SECONDARY_BTN}
          onClick={() => setPhase('edit')}
          disabled={mutation.isPending}
        >
          Volver a editar
        </button>
      </div>
    </div>
  );

  const body = phase === 'edit' ? editForm : reviewForm;

  if (variant === 'dialog') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar empresa</DialogTitle>
            <DialogDescription>
              Completa los datos de la empresa para iniciar su proceso de certificación.
            </DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return <div className="w-full">{body}</div>;
}