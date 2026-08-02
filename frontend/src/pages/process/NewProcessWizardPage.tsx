import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { WizardStepper } from './wizard/WizardStepper';
import { StepSetup } from './wizard/StepSetup';
import { StepPreDiagnosis } from './wizard/StepPreDiagnosis';
import { StepFindings } from './wizard/StepFindings';
import { PlanResultView } from './PlanResultView';
import { toast } from '../../components/ui/toast';
import type { Plan } from '../../api/plan';

type ISOStandard = 'iso9001' | 'iso14001' | 'iso45001';

const STEPS = ['Configuración', 'Pre-diagnóstico', 'Diagnóstico ISO', 'Plan'];

export function NewProcessWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [processId, setProcessId] = useState<string | null>(null);
  const [isoStandard, setIsoStandard] = useState<ISOStandard | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Stopper: beforeunload when form is dirty
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const handleExit = useCallback(() => {
    if (!isDirty) {
      navigate('/processes');
      return;
    }
    const ok = window.confirm(
      '¿Salir del asistente? Los cambios no guardados se perderán. ' +
      'Los datos ya enviados en pasos anteriores se conservan.'
    );
    if (ok) navigate('/processes');
  }, [isDirty, navigate]);

  function handleCreated(id: string, iso: ISOStandard) {
    setProcessId(id);
    setIsoStandard(iso);
    setIsDirty(false);
    setStep(1);
    toast.success('Proceso creado correctamente', { position: 'bottom-center' });
  }

  function handlePreDiagnosisDone() {
    setIsDirty(false);
    setStep(2);
  }

  function handlePlanReady(planResult: Plan) {
    setPlan(planResult);
    setIsDirty(false);
    setStep(3);
    toast.success('Plan de acción generado', { position: 'bottom-center' });
  }

  function handleViewProcess() {
    if (processId) navigate(`/processes/${processId}`);
  }

  return (
    <div className="p-4 lg:p-6 min-h-full">
      <div className="max-w-4xl mx-auto">
        {/* Enrichment: hero header gives the wizard page structure and a clear step context */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-app-accent/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-app-accent" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-app-text">Nuevo Proceso de Certificación</h1>
              <p className="text-app-muted mt-0.5">Complete los pasos para iniciar su certificación ISO</p>
            </div>
          </div>
          <span className="self-start sm:self-center px-3 py-1 rounded-full bg-app-accent/10 text-app-accent text-xs font-semibold">
            Paso {step + 1} de {STEPS.length} · {STEPS[step]}
          </span>
        </header>

        <WizardStepper current={step} steps={STEPS} />

        <div className="bg-white rounded-2xl border border-app-border p-6 lg:p-8 shadow-md min-h-[400px]">
          <div key={step} className="animate-slide-in-right">
            {step === 0 && <StepSetup onCreated={handleCreated} onDirtyChange={setIsDirty} />}
            {step === 1 && processId && (
              <StepPreDiagnosis
                processId={processId}
                isoStandard={isoStandard!}
                onDone={handlePreDiagnosisDone}
                onDirtyChange={setIsDirty}
              />
            )}
            {step === 2 && processId && isoStandard && (
              <StepFindings
                processId={processId}
                isoStandard={isoStandard}
                onPlanReady={handlePlanReady}
                onDirtyChange={setIsDirty}
              />
            )}
            {step === 3 && plan && (
              <PlanResultView plan={plan} />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex justify-between mt-6">
          <button
            onClick={handleExit}
            className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
          >
            {step === 3 ? 'Cerrar' : 'Salir'}
          </button>
          {step === 3 && (
            <button
              onClick={handleViewProcess}
              className="px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 transition-colors"
            >
              Ver proceso
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}