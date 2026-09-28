import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useProcess } from '../../hooks/useProcess';
import { usePlan } from '../../hooks/usePlan';
import { ErrorState } from '../../components/ui/ErrorState';
import { getErrorMessage } from '../../lib/error-utils';
import { PlanResultView } from './PlanResultView';

export const PlanPage = () => {
  const { processId } = useParams();

  const { data: process } = useProcess(processId);
  const { data: plan, isLoading, isError, error, refetch } = usePlan(processId ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-app-muted">Cargando plan...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="No se pudo cargar el plan"
        message={getErrorMessage(error)}
        action={{ label: 'Reintentar', onClick: () => refetch() }}
      />
    );
  }

  if (!plan) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-app-muted">No se encontró el plan para este proceso.</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header section */}
      <div className="mb-6 shrink-0">
        <Link
          to={`/processes/${processId}`}
          className="inline-flex items-center gap-2 text-app-muted hover:text-app-text transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al proceso
        </Link>
      </div>

      {/* enrichment-intent: outer-container + separated-subtitle
          Wraps the page content in a single card with a header divider so the
          subtitle (company · standard) is visually distinct from the plan body.
          The card fills the viewport height and scrolls its body internally. */}
      <div className="flex-1 min-h-0 flex flex-col bg-white border border-app-border rounded-xl shadow-sm overflow-hidden">
        {/* Title & subtitle area */}
        <div className="px-6 pt-6 pb-4 border-b border-app-border shrink-0">
          <h1 className="text-3xl font-bold text-app-text mb-2">Plan de acción</h1>
          {process && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-app-text">
                {process.company_name || '(sin empresa)'}
              </span>
              <span className="text-sm text-app-muted">·</span>
              <span className="inline-flex items-center rounded-full bg-app-bg px-3 py-1 text-xs font-medium text-app-muted">
                {process.iso_standard}
              </span>
            </div>
          )}
        </div>

        {/* Plan content — inner scroll */}
        <div className="flex-1 min-h-0 px-6 py-6 overflow-y-auto">
          <PlanResultView plan={plan} />
        </div>
      </div>
    </div>
  );
};
