import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardStepper } from './wizard/WizardStepper';
import { StepSetup } from './wizard/StepSetup';
import { StepPreDiagnosis } from './wizard/StepPreDiagnosis';
import { StepFindings } from './wizard/StepFindings';
import { PlanResultView } from './PlanResultView';
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
  }

  function handlePreDiagnosisDone() {
    setIsDirty(false);
    setStep(2);
  }

  function handlePlanReady(planResult: Plan) {
    setPlan(planResult);
    setIsDirty(false);
    setStep(3);
  }

  function handleViewProcess() {
    if (processId) navigate(`/processes/${processId}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-app-text">Nuevo Proceso de Certificación</h1>
        <p className="text-app-muted mt-1">Complete los pasos para iniciar su certificación ISO</p>
      </div>

      <WizardStepper current={step} steps={STEPS} />

      <div className="bg-white rounded-xl border border-app-border p-6 shadow-sm min-h-[400px]">
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
          className="px-4 py-2 border border-app-border rounded-lg text-sm font-medium text-app-muted hover:text-app-text hover:bg-app-bg transition-colors"
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
  );
}