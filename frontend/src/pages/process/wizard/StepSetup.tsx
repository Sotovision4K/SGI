import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useCompanies } from '../../../hooks/useCompanies';
import { useStartProcess } from '../../../hooks/useStartProcess';
import { createCompany } from '../../../api/company';
import { useApiAuthBridge } from '../../../lib/use-api-auth';

type ISOStandard = 'iso9001' | 'iso14001' | 'iso45001';

const ISO_OPTIONS: { value: ISOStandard; label: string; description: string }[] = [
  { value: 'iso9001', label: 'ISO 9001:2015', description: 'Sistema de Gestión de la Calidad' },
  { value: 'iso14001', label: 'ISO 14001:2015', description: 'Sistema de Gestión Ambiental' },
  { value: 'iso45001', label: 'ISO 45001:2018', description: 'Seguridad y Salud en el Trabajo' },
];

interface FormData {
  company_id: string;
  iso_standard: ISOStandard;
  new_company_name: string;
  new_company_type: string;
}

interface StepSetupProps {
  onCreated: (processId: string, isoStandard: ISOStandard) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function StepSetup({ onCreated, onDirtyChange }: StepSetupProps) {
  const { getToken } = useApiAuthBridge();
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const startProcess = useStartProcess();
  const [error, setError] = useState<string | null>(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, control, formState: { errors, isDirty } } = useForm<FormData>({
    defaultValues: {
      company_id: '',
      iso_standard: '' as ISOStandard,
      new_company_name: '',
      new_company_type: 'general',
    },
    mode: 'onChange',
  });

  // Notify parent about dirty state
  useEffect(() => {
    onDirtyChange(isDirty || submitting);
  }, [isDirty, submitting, onDirtyChange]);

  const selectedIso = useWatch({ control, name: 'iso_standard' });
  const selectedCompany = useWatch({ control, name: 'company_id' });
  const canSubmit = !!selectedCompany && !!selectedIso && !companiesLoading && !submitting;

  async function onSubmit(data: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      const process = await startProcess.mutateAsync({
        company_id: data.company_id,
        iso_standard: data.iso_standard as ISOStandard,
      });
      onCreated(process.id, data.iso_standard as ISOStandard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el proceso');
      setSubmitting(false);
    }
  }

  async function handleCreateCompany(data: FormData) {
    if (!data.new_company_name.trim()) return;
    setCreatingCompany(true);
    setError(null);
    try {
      const company = await createCompany(
        { name: data.new_company_name.trim(), business_type: data.new_company_type },
        { token: getToken() },
      );
      setValue('company_id', company.company_id);
      setShowCreateCompany(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la empresa');
    } finally {
      setCreatingCompany(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-text-main mb-2">Empresa</label>
        {companiesLoading ? (
          <div className="text-text-muted text-sm">Cargando empresas...</div>
        ) : companies.length === 0 && !showCreateCompany ? (
          <div className="text-text-muted text-sm">
            No hay empresas registradas. Crea una nueva para continuar.
          </div>
        ) : (
          <select
            {...register('company_id', { required: 'Seleccione una empresa' })}
            disabled={showCreateCompany}
            className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent disabled:bg-bg-soft"
          >
            <option value="">Seleccione una empresa...</option>
            {companies.map((c) => (
              <option key={c.company_id} value={c.company_id}>
                {c.name || '(sin nombre)'} - {c.business_type}
              </option>
            ))}
          </select>
        )}
        {errors.company_id && <p className="text-red-500 text-xs mt-1">{errors.company_id.message}</p>}

        {!showCreateCompany ? (
          <button
            type="button"
            onClick={() => setShowCreateCompany(true)}
            className="mt-2 text-sm text-accent hover:underline"
          >
            + Crear nueva empresa
          </button>
        ) : (
          <div className="mt-3 p-4 border border-border rounded-lg bg-bg-soft space-y-3">
            <input
              {...register('new_company_name', { required: 'Ingrese el nombre' })}
              placeholder="Nombre de la empresa"
              className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main"
            />
            <select
              {...register('new_company_type')}
              className="w-full px-3 py-2 border border-border rounded-lg bg-white text-text-main"
            >
              <option value="general">General</option>
              <option value="manufactura">Manufactura</option>
              <option value="servicios">Servicios</option>
              <option value="tecnologia">Tecnología</option>
              <option value="construccion">Construcción</option>
              <option value="alimentos">Alimentos</option>
              <option value="salud">Salud</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSubmit(handleCreateCompany)}
                disabled={creatingCompany}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
              >
                {creatingCompany ? 'Creando...' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateCompany(false); }}
                className="px-4 py-2 border border-border rounded-lg text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-text-main mb-2">Norma ISO</label>
        <div className="space-y-2">
          {ISO_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedIso === opt.value ? 'border-accent bg-accent-light' : 'border-border hover:border-accent/50'
              }`}
            >
              <input
                type="radio"
                value={opt.value}
                {...register('iso_standard', { required: 'Seleccione una norma ISO' })}
                className="mt-1"
              />
              <div>
                <div className="font-semibold text-text-main">{opt.label}</div>
                <div className="text-sm text-text-muted">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
        {errors.iso_standard && <p className="text-red-500 text-xs mt-1">{errors.iso_standard.message}</p>}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="pt-4 border-t border-border flex justify-end">
        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={!canSubmit}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Continuar
        </button>
      </div>
    </div>
  );
}