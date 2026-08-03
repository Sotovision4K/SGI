import { useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { WizardStepper } from './wizard/WizardStepper';
import { StepSetup } from './wizard/StepSetup';
import { StepPreDiagnosis, type StepPreDiagnosisHandle } from './wizard/StepPreDiagnosis';
import { StepFindings, type StepFindingsHandle } from './wizard/StepFindings';
import { PlanResultView } from './PlanResultView';
import { toast } from '../../components/ui/toast';
import { useProcess } from '../../hooks/useProcess';
import { usePlan, useFindings } from '../../hooks/usePlan';
import { loadDraft, saveDraft, clearDraft, formatLastSaved } from '../../lib/process-draft';
import type { Plan } from '../../api/plan';

type ISOStandard = 'iso9001' | 'iso14001' | 'iso45001';
type Step = 0 | 1 | 2 | 3;

const STEPS = ['Configuración', 'Pre-diagnóstico', 'Diagnóstico ISO', 'Plan'];

export function NewProcessWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeProcessId = searchParams.get('processId');

  const resume = useProcess(resumeProcessId ?? undefined);
  const resumePlan = usePlan(resumeProcessId ?? null);

  const preDiagnosisDone =
    !!resume?.pre_diagnosis && Object.keys(resume.pre_diagnosis).length > 0;
  const hasPlan = resume?.status === 'plan_ready';
  const resumeFindings = useFindings(preDiagnosisDone ? resumeProcessId ?? null : null);

  const [step, setStep] = useState<Step>(0);
  const [createdProcessId, setCreatedProcessId] = useState<string | null>(null);
  const [createdIso, setCreatedIso] = useState<ISOStandard | null>(null);
  const [planOverride, setPlanOverride] = useState<Plan | null>(null);
  const [, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [resumeApplied, setResumeApplied] = useState(false);

  const preDiagnosisRef = useRef<StepPreDiagnosisHandle>(null);
  const findingsRef = useRef<StepFindingsHandle>(null);

  const processId = resumeProcessId ?? createdProcessId;
  const isoStandard = resume?.iso_standard ?? createdIso;

  // Resume landing step, derived from server state + draft (never re-run step 0,
  // which would create a duplicate process; never land on step 3 without a plan).
  const loadedDraft = resumeProcessId && resume ? loadDraft(resumeProcessId) : null;
  const serverStep: Step = hasPlan ? 3 : preDiagnosisDone ? 1 : 0;
  const draftStep = loadedDraft?.step ?? 0;
  const landingStep: Step = resumeProcessId
    ? Math.max(1, serverStep, draftStep) > 2 && !hasPlan
      ? 2
      : (Math.max(1, serverStep, draftStep) as Step)
    : 0;

  // Adjust state during render (React's recommended pattern): apply the resume
  // landing step once per processId as soon as server data is available.
  if (resumeProcessId && resume && !resumeApplied) {
    setResumeApplied(true);
    setStep(landingStep);
  }

  const lastSavedTime = lastSaved ?? loadedDraft?.updatedAt ?? null;

  const handleExit = useCallback(() => {
    if (processId && step === 1 && preDiagnosisRef.current) {
      const { answers, subStep } = preDiagnosisRef.current.getDraftState();
      const updated = saveDraft(processId, { step: 1, subStep, preDiagnosis: answers });
      if (updated) setLastSaved(updated.updatedAt);
    } else if (processId && step === 2 && findingsRef.current) {
      const { answers } = findingsRef.current.getDraftState();
      const updated = saveDraft(processId, { step: 2, findings: answers });
      if (updated) setLastSaved(updated.updatedAt);
    }
    navigate('/processes');
  }, [processId, step, navigate]);

  const handleCreated = (id: string, iso: ISOStandard) => {
    setCreatedProcessId(id);
    setCreatedIso(iso);
    setIsDirty(false);
    setStep(1);
    toast.success('Proceso creado correctamente', { position: 'bottom-center' });
  };

  const handlePreDiagnosisProgress = useCallback((answers: Record<string, string>, nextSubStep: number) => {
    if (!processId) return;
    const updated = saveDraft(processId, { step: 1, subStep: nextSubStep, preDiagnosis: answers });
    if (updated) setLastSaved(updated.updatedAt);
  }, [processId]);

  const handlePreDiagnosisDone = () => {
    if (processId) clearDraft(processId);
    setLastSaved(null);
    setIsDirty(false);
    setStep(2);
  };

  const handlePlanReady = (planResult: Plan) => {
    if (processId) clearDraft(processId);
    setPlanOverride(planResult);
    setLastSaved(null);
    setIsDirty(false);
    setStep(3);
    toast.success('Plan de acción generado', { position: 'bottom-center' });
  };

  const handleViewProcess = () => {
    if (processId) navigate(`/processes/${processId}`);
  };

  const showAutosave = step === 1 || step === 2;

  // Resume-mode seeding precedence: server > draft > questionnaire defaults.
  const initialPreDiagnosis =
    (resume?.pre_diagnosis && Object.keys(resume.pre_diagnosis).length > 0
      ? resume.pre_diagnosis
      : loadedDraft?.preDiagnosis) ?? undefined;
  const initialFindings =
    (resumeFindings.data?.answers && Object.keys(resumeFindings.data.answers).length > 0
      ? resumeFindings.data.answers
      : loadedDraft?.findings) ?? undefined;

  const plan = resumeProcessId && hasPlan && resumePlan.data ? resumePlan.data : planOverride;
  const planLoading = resumeProcessId && hasPlan && !plan;

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
  }

  return (
    <div className="h-screen overflow-hidden p-4 lg:p-6">
      <div className="max-w-4xl mx-auto h-full flex flex-col">
        {/* Enrichment: hero header gives the wizard page structure and a clear step context */}
        <header className="shrink-0 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-app-accent/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-app-accent" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-app-text">Nuevo Proceso de Certificación</h1>
              <p className="text-app-muted mt-0.5">Complete los pasos para iniciar su certificación ISO</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {showAutosave && (
              <span className="text-xs text-app-muted">
                Guardado automático activado · Último guardado:{' '}
                {lastSavedTime ? formatLastSaved(lastSavedTime) : 'ahora'}
              </span>
            )}
            <span className="px-3 py-1 rounded-full bg-app-accent/10 text-app-accent text-xs font-semibold">
              Paso {step + 1} de {STEPS.length} · {STEPS[step]}
            </span>
          </div>
        </header>

        <div className="shrink-0"><WizardStepper current={step} steps={STEPS} /></div>

        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-app-border p-6 lg:p-8 shadow-md flex flex-col">
          <div key={step} className="flex-1 min-h-0 flex flex-col animate-slide-in-right">
            {step === 0 && <StepSetup onCreated={handleCreated} onDirtyChange={setIsDirty} />}
            {step === 1 && processId && (
              <StepPreDiagnosis
                ref={preDiagnosisRef}
                processId={processId}
                isoStandard={isoStandard!}
                onDone={handlePreDiagnosisDone}
                onDirtyChange={setIsDirty}
                initialValues={initialPreDiagnosis}
                initialSubStep={loadedDraft?.subStep}
                startAtReview={preDiagnosisDone}
                onProgressSave={handlePreDiagnosisProgress}
              />
            )}
            {step === 2 && processId && isoStandard && (
              <StepFindings
                ref={findingsRef}
                processId={processId}
                isoStandard={isoStandard}
                onPlanReady={handlePlanReady}
                onDirtyChange={setIsDirty}
                initialValues={initialFindings}
              />
            )}
            {step === 3 && planLoading && (
              <div className="flex items-center justify-center h-full text-app-muted text-sm">
                Cargando plan...
              </div>
            )}
            {step === 3 && plan && (
              <PlanResultView plan={plan} />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="shrink-0 flex justify-between mt-6">
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