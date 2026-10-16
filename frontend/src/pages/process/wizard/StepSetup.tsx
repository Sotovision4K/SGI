import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Loader2, AlertCircle, Sparkles, Building2, Check, Plus, TrendingUp, HardHat, FileText, Leaf, BarChart3, Lock } from 'lucide-react';
import { useCompanies } from '../../../hooks/useCompanies';
import { useStartProcess } from '../../../hooks/useStartProcess';
import { useProcessDuplicates } from '../../../hooks/useProcessDuplicates';
import { MODULE_LABELS, type PerfilamientoModule } from '../../../api/process';
import { SelectNative } from '../../../components/ui/Select';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { CompanyForm } from '../../../components/companies/CompanyForm';

// Enrichment: configuration step offers a grid of requirement modules instead of
// raw ISO norms, plus an explicit "needs certification" toggle. Each module maps to
// a perfilamiento question group downstream.
const MODULE_OPTIONS: { value: PerfilamientoModule; description: string; icon: typeof TrendingUp }[] = [
  { value: 'optimizacion', description: 'Estandarización, ISO 9001 y mejora continua', icon: TrendingUp },
  { value: 'sst', description: 'SG-SST, estándares mínimos e ISO 45001', icon: HardHat },
  { value: 'nts', description: 'Normas y reglamentos técnicos del sector', icon: FileText },
  { value: 'sos', description: 'ISO 14001, huella de carbono y ESG', icon: Leaf },
  { value: 'planificacion', description: 'Planeación estratégica, BSC y OKR', icon: BarChart3 },
];

interface FormData {
  company_id: string;
  module: PerfilamientoModule;
  needs_certification: boolean;
}

interface StepSetupProps {
  onCreated: (processId: string, module: PerfilamientoModule) => void;
}

export function StepSetup({ onCreated }: StepSetupProps) {
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const startProcess = useStartProcess();
  const [error, setError] = useState<string | null>(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      company_id: '',
      module: 'optimizacion' as PerfilamientoModule,
      needs_certification: false,
    },
    mode: 'onChange',
  });

  const selectedModule = useWatch({ control, name: 'module' });
  const selectedCompany = useWatch({ control, name: 'company_id' });

  // Dedup: once a company is selected, fetch which modules already have an active
  // process so the user cannot start a duplicate.
  const {
    data: duplicates,
    isLoading: duplicatesLoading,
    isFetching: duplicatesFetching,
  } = useProcessDuplicates(selectedCompany || null);
  const takenModules = new Set(duplicates.taken_modules);
  const selectedTaken = takenModules.has(selectedModule);
  const canSubmit = !!selectedCompany && !!selectedModule && !selectedTaken
    && !companiesLoading && !submitting && !duplicatesLoading && !duplicatesFetching;

  async function onSubmit(data: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      const process = await startProcess.mutateAsync({
        company_id: data.company_id,
        perfilamiento_module: data.module,
        needs_certification: data.needs_certification,
      });
      onCreated(process.id, data.module);
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

            {/* Module card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-app-accent/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-app-accent" aria-hidden="true" />
                  </span>
                  Módulo de perfilamiento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {MODULE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = selectedModule === opt.value;
                    const taken = takenModules.has(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-4 border rounded-xl transition-all ${
                          taken
                            ? 'border-app-border bg-app-bg opacity-50 cursor-not-allowed'
                            : selected
                              ? 'border-app-accent bg-app-accent/10 shadow-sm cursor-pointer'
                              : 'border-app-border hover:border-app-accent/50 hover:bg-app-bg cursor-pointer'
                        }`}
                      >
                        <input
                          type="radio"
                          value={opt.value}
                          disabled={taken}
                          {...register('module', { required: 'Seleccione un módulo' })}
                          className="sr-only"
                        />
                        <span
                          className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                            selected && !taken ? 'bg-app-accent text-white' : 'bg-app-bg text-app-muted'
                          }`}
                        >
                          <Icon className="w-5 h-5" aria-hidden="true" />
                        </span>
                        <span className="flex-1">
                          <span className="flex items-center justify-between">
                            <span className="font-semibold text-app-text">{MODULE_LABELS[opt.value]}</span>
                            {taken ? (
                              <span className="inline-flex items-center gap-1 text-xs text-app-muted">
                                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                                Ya existe un proceso
                              </span>
                            ) : selected ? (
                              <span className="w-5 h-5 rounded-full bg-app-accent text-white flex items-center justify-center">
                                <Check className="w-3 h-3" aria-hidden="true" />
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-sm text-app-muted">{opt.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {duplicatesLoading && selectedCompany && (
                  <p className="text-xs text-app-muted mt-2">Verificando módulos disponibles...</p>
                )}
                {errors.module && <p className="text-red-500 text-xs mt-1">{errors.module.message}</p>}

                <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-app-text cursor-pointer select-none">
                  <input
                    type="checkbox"
                    {...register('needs_certification')}
                    className="w-4 h-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                  />
                  Necesita certificación ISO
                </label>
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
