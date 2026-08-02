import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Loader2, AlertCircle, Sparkles, Building2, Award, Leaf, HardHat, Check, Plus } from 'lucide-react';
import { useCompanies } from '../../../hooks/useCompanies';
import { useStartProcess } from '../../../hooks/useStartProcess';
import { SelectNative } from '../../../components/ui/Select';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { CompanyForm } from '../../../components/companies/CompanyForm';

type ISOStandard = 'iso9001' | 'iso14001' | 'iso45001';

// Enrichment: configuration step split into two distinct cards (Empresa / Norma ISO)
// with richer, selectable ISO cards so high-level choices read as a single visual unit.
const ISO_OPTIONS: { value: ISOStandard; label: string; description: string; icon: typeof Award }[] = [
  { value: 'iso9001', label: 'ISO 9001:2015', description: 'Sistema de Gestión de la Calidad', icon: Award },
  { value: 'iso14001', label: 'ISO 14001:2015', description: 'Sistema de Gestión Ambiental', icon: Leaf },
  { value: 'iso45001', label: 'ISO 45001:2018', description: 'Seguridad y Salud en el Trabajo', icon: HardHat },
];

interface FormData {
  company_id: string;
  iso_standard: ISOStandard;
}

interface StepSetupProps {
  onCreated: (processId: string, isoStandard: ISOStandard) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function StepSetup({ onCreated, onDirtyChange }: StepSetupProps) {
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const startProcess = useStartProcess();
  const [error, setError] = useState<string | null>(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, control, formState: { errors, isDirty } } = useForm<FormData>({
    defaultValues: {
      company_id: '',
      iso_standard: 'iso9001' as ISOStandard,
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

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Empresa card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-app-accent/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-app-accent" aria-hidden="true" />
                  </span>
                  Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {companiesLoading ? (
                  <div className="text-app-muted text-sm">Cargando empresas...</div>
                ) : companies.length === 0 && !showCreateCompany ? (
                  <div className="text-app-muted text-sm">
                    No hay empresas registradas. Crea una nueva para continuar.
                  </div>
                ) : (
                  <SelectNative
                    {...register('company_id', { required: 'Seleccione una empresa' })}
                    disabled={showCreateCompany}
                  >
                    <option value="">Seleccione una empresa...</option>
                    {companies.map((c) => (
                      <option key={c.company_id} value={c.company_id}>
                        {c.name || '(sin nombre)'} - {c.business_type}
                      </option>
                    ))}
                  </SelectNative>
                )}
                {errors.company_id && <p className="text-red-500 text-xs mt-1">{errors.company_id.message}</p>}

                {!showCreateCompany ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateCompany(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-app-accent hover:underline"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>+ Crear nueva empresa</span>
                  </button>
                ) : (
                  <div className="p-4 border border-app-border rounded-lg bg-app-bg">
                    <CompanyForm
                      variant="inline"
                      existingCompanyNames={companies.filter((c) => c.company_id !== selectedCompany).map((c) => c.name)}
                      onSuccess={(company) => {
                        setValue('company_id', company.company_id);
                        setShowCreateCompany(false);
                      }}
                      onCancel={() => setShowCreateCompany(false)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Norma ISO card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-app-accent/10 flex items-center justify-center">
                    <Award className="w-4 h-4 text-app-accent" aria-hidden="true" />
                  </span>
                  Norma ISO
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ISO_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = selectedIso === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                          selected
                            ? 'border-app-accent bg-app-accent/10 shadow-sm'
                            : 'border-app-border hover:border-app-accent/50 hover:bg-app-bg'
                        }`}
                      >
                        <input
                          type="radio"
                          value={opt.value}
                          {...register('iso_standard', { required: 'Seleccione una norma ISO' })}
                          className="sr-only"
                        />
                        <span
                          className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                            selected ? 'bg-app-accent text-white' : 'bg-app-bg text-app-muted'
                          }`}
                        >
                          <Icon className="w-5 h-5" aria-hidden="true" />
                        </span>
                        <span className="flex-1">
                          <span className="flex items-center justify-between">
                            <span className="font-semibold text-app-text">{opt.label}</span>
                            {selected && (
                              <span className="w-5 h-5 rounded-full bg-app-accent text-white flex items-center justify-center">
                                <Check className="w-3 h-3" aria-hidden="true" />
                              </span>
                            )}
                          </span>
                          <span className="block text-sm text-app-muted">{opt.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {errors.iso_standard && <p className="text-red-500 text-xs mt-1">{errors.iso_standard.message}</p>}
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 pt-4 border-t border-app-border flex justify-end">
        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={!canSubmit}
          className="px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Continuar
        </button>
      </div>
    </div>
  );
}
