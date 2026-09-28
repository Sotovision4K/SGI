import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, ClipboardCheck, BarChart3, ArrowLeft, CheckCircle, RotateCcw } from 'lucide-react';
import { useProcess } from '../../hooks/useProcess';
import { useFindings } from '../../hooks/usePlan';
import { useCompleteProcess, useReopenProcess } from '../../hooks/useProcesses';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { getErrorMessage } from '../../lib/error-utils';

export const ProcessDetailPage = () => {
  const { processId } = useParams();

  const { data: process, isLoading, isError, error, refetch } = useProcess(processId);
  const { data: findings } = useFindings(processId ?? null);
  const completeProcess = useCompleteProcess();
  const reopenProcess = useReopenProcess();
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  const preDiagnosisDone =
    !!process?.pre_diagnosis && Object.keys(process.pre_diagnosis).length > 0;
  const diagnosisDone = (!!findings?.answers && Object.keys(findings.answers).length > 0)
    || process?.status === 'plan_ready';
  const hasPlan = process?.status === 'plan_ready';

  let ctaLabel = 'Iniciar diagnóstico';
  if (hasPlan) ctaLabel = 'Ver plan';
  else if (preDiagnosisDone && !diagnosisDone) ctaLabel = 'Continuar diagnóstico';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-app-muted">Cargando proceso...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="No se pudo cargar el proceso"
        message={getErrorMessage(error)}
        action={{ label: 'Reintentar', onClick: () => refetch() }}
      />
    );
  }

  if (!process) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-app-muted">Proceso no encontrado</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header section */}
      <div className="mb-6 shrink-0">
        <Link to="/processes" className="inline-flex items-center gap-2 text-app-muted hover:text-app-text transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Volver a procesos
        </Link>
      </div>

      {/* enrichment-intent: outer-container + inner-scroll
          Wraps the page in a single card whose header stays fixed and whose
          body (the module grid) scrolls internally, matching PlanPage. */}
      <div className="flex-1 min-h-0 flex flex-col bg-white border border-app-border rounded-xl shadow-sm overflow-hidden">
        {/* Title & subtitle area */}
        <div className="px-6 pt-6 pb-4 border-b border-app-border shrink-0">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-app-text">
              {process.company_name || '(sin empresa)'}
            </h1>
            <span className="px-3 py-1 bg-app-accent/10 text-app-accent text-sm font-medium rounded-full">
              {process.iso_standard}
            </span>
          </div>
          <p className="text-app-muted">
            Proceso de certificación{' '}
            {process.status === 'in_diagnosis'
              ? 'en diagnóstico'
              : process.status === 'plan_ready'
                ? 'con plan listo'
                : process.status === 'in_progress'
                  ? 'en progreso'
                  : 'completado'}
          </p>

          {process.status !== 'completed' && (
            <button
              onClick={() => setShowCompleteConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-app-accent text-white rounded-lg font-medium hover:bg-app-accent/90 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Marcar como completado
            </button>
          )}
          {process.status === 'completed' && (
            <button
              onClick={() => setShowReopenConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-app-border text-app-text rounded-lg font-medium hover:bg-app-bg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reabrir proceso
            </button>
          )}

          <ConfirmDialog
            open={showCompleteConfirm}
            onOpenChange={setShowCompleteConfirm}
            title="Marcar como completado"
            description="¿Estás seguro de completar este proceso? Podrás reabrirlo después si es necesario."
            confirmLabel="Completar"
            onConfirm={() => { completeProcess.mutate(processId!); setShowCompleteConfirm(false); }}
            loading={completeProcess.isPending}
          />
          <ConfirmDialog
            open={showReopenConfirm}
            onOpenChange={setShowReopenConfirm}
            title="Reabrir proceso"
            description="¿Estás seguro de reabrir este proceso? Volverá al estado anterior."
            confirmLabel="Reabrir"
            onConfirm={() => { reopenProcess.mutate(processId!); setShowReopenConfirm(false); }}
            loading={reopenProcess.isPending}
          />
        </div>

        {/* Module grid — inner scroll */}
        <div className="flex-1 min-h-0 px-6 py-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-app-border p-4 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-9 h-9 bg-app-accent/10 rounded-lg flex items-center justify-center mb-3">
            <ClipboardCheck className="w-5 h-5 text-app-accent" />
          </div>
          <h3 className="text-base font-semibold text-app-text mb-1">Diagnóstico</h3>
          <p className="flex-1 text-app-muted text-sm mb-3">
            Evalúa el estado actual de tu empresa frente a los requisitos ISO.
          </p>
          <Link
            to={hasPlan ? `/processes/${processId}/plan` : `/processes/new?processId=${processId}`}
            className="w-full py-1.5 px-4 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            {ctaLabel}
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-app-border p-4 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-9 h-9 bg-app-accent/10 rounded-lg flex items-center justify-center mb-3">
            <FileText className="w-5 h-5 text-app-accent" />
          </div>
          <h3 className="text-base font-semibold text-app-text mb-1">Documentación</h3>
          <p className="flex-1 text-app-muted text-sm mb-3">
            Genera y gestiona manuales, procedimientos y registros.
          </p>
          <Link
            to={`/processes/${processId}/documents`}
            className="w-full py-1.5 px-4 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            Ver Documentos
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-app-border p-4 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-9 h-9 bg-app-accent/10 rounded-lg flex items-center justify-center mb-3">
            <ClipboardCheck className="w-5 h-5 text-app-accent" />
          </div>
          <h3 className="text-base font-semibold text-app-text mb-1">Auditorías</h3>
          <p className="flex-1 text-app-muted text-sm mb-3">
            Planifica y ejecuta auditorías internas de forma guiada.
          </p>
          <Link
            to={`/processes/${processId}/audits`}
            className="w-full py-1.5 px-4 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            Gestionar Auditorías
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-app-border p-4 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-9 h-9 bg-app-accent/10 rounded-lg flex items-center justify-center mb-3">
            <BarChart3 className="w-5 h-5 text-app-accent" />
          </div>
          <h3 className="text-base font-semibold text-app-text mb-1">Indicadores</h3>
          <p className="flex-1 text-app-muted text-sm mb-3">
            Visualiza KPIs y métricas de desempeño del SGI.
          </p>
          <Link
            to={`/processes/${processId}/indicators`}
            className="w-full py-1.5 px-4 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            Ver Indicadores
          </Link>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
