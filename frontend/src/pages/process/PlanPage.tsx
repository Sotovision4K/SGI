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
    <div className="py-8">
      <div className="mb-8">
        <Link
          to={`/processes/${processId}`}
          className="inline-flex items-center gap-2 text-app-muted hover:text-app-text transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al proceso
        </Link>
        <h1 className="text-3xl font-bold text-app-text mb-2">Plan de acción</h1>
        {process && (
          <p className="text-app-muted">
            {process.company_name || '(sin empresa)'} · {process.iso_standard}
          </p>
        )}
      </div>

      <PlanResultView plan={plan} readOnly />
    </div>
  );
};
