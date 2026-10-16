import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { WizardStepper } from './wizard/WizardStepper';
import { StepSetup } from './wizard/StepSetup';
import { StepPerfilamiento } from './wizard/StepPerfilamiento';
import { StepAnalysis } from './wizard/StepAnalysis';
import { toast } from '../../components/ui/toast';
import { useProcess } from '../../hooks/useProcess';
import type { PerfilamientoModule } from '../../api/process';

type Step = 0 | 1 | 2;

const STEPS = ['Configuración', 'Perfilamiento', 'Análisis LLM'];

export function NewProcessWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeProcessId = searchParams.get('processId');
  const isEditing = searchParams.get('edit') != null;

  const resume = useProcess(resumeProcessId ?? undefined);
  const processData = resume?.data;

  const [step, setStep] = useState<Step>(0);
  const [createdProcessId, setCreatedProcessId] = useState<string | null>(null);
  const [createdModule, setCreatedModule] = useState<PerfilamientoModule | null>(null);
  const [resumeApplied, setResumeApplied] = useState(false);

  const processId = resumeProcessId ?? createdProcessId;
  const module = processData?.perfilamiento_module ?? createdModule;

  // When resuming a process whose plan is already generated (and not explicitly
  // editing), redirect to the detail page instead of landing on a wizard step.
  useEffect(() => {
    if (resumeProcessId && processData?.status === 'plan_ready' && !isEditing) {
      navigate(`/processes/${resumeProcessId}`);
    }
  }, [resumeProcessId, processData?.status, isEditing, navigate]);

  // Resume semantics: never re-run step 0 (it would create a duplicate process).
  // Land on step 1 (Perfilamiento), seeded from server perfilamiento_answers.
  if (resumeProcessId && processData && !resumeApplied) {
    setResumeApplied(true);
    setStep(1);
  }

  const handleCreated = (id: string, module: PerfilamientoModule) => {
    setCreatedProcessId(id);
    setCreatedModule(module);
    setStep(1);
    toast.success('Proceso creado correctamente', { position: 'bottom-center' });
  };

  if (resumeProcessId && !resumeApplied) {
    if (resume?.isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center text-app-muted">
          Cargando proceso...
        </div>
      );
    }
    if (resume?.isError) {
      return (
        <div className="min-h-screen flex items-center justify-center text-app-muted">
          No se pudo cargar el proceso para reanudar. Vuelva a intentarlo.
        </div>
      );
    }
    if (processData === null) {
      return (
        <div className="min-h-screen flex items-center justify-center text-app-muted">
          Proceso no encontrado.
        </div>
      );
    }
  }

  const perfilamientoAnswers = processData?.perfilamiento_answers as Record<string, string> | undefined;

  return (
    <div className="h-full overflow-hidden p-3 sm:p-4 lg:p-6">
      <div className="max-w-4xl mx-auto h-full flex flex-col">
        {/* Enrichment: hero header gives the wizard page structure and a clear step context */}
        <header className="shrink-0 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-app-accent/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-app-accent" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-app-text">Nuevo Proceso</h1>
              <p className="text-app-muted mt-0.5">Complete los pasos para iniciar el proceso</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-app-accent/10 text-app-accent text-xs font-semibold">
            Paso {step + 1} de {STEPS.length} · {STEPS[step]}
          </span>
        </header>

        <div className="shrink-0"><WizardStepper current={step} steps={STEPS} /></div>

        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-app-border p-4 sm:p-6 lg:p-8 shadow-md flex flex-col">
          <div key={step} className="flex-1 min-h-0 flex flex-col animate-slide-in-right">
            {step === 0 && <StepSetup onCreated={handleCreated} />}
            {step === 1 && processId && module && (
              <StepPerfilamiento
                processId={processId}
                module={module}
                onDone={() => setStep(2)}
                initialValues={perfilamientoAnswers}
              />
            )}
            {step === 2 && processId && (
              <StepAnalysis
                processId={processId}
                onDone={() => navigate(`/processes/${processId}`)}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="shrink-0 flex justify-between mt-6">
          <button
            onClick={() => navigate('/processes')}
            className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Salir
          </button>
        </footer>
      </div>
    </div>
  );
}
