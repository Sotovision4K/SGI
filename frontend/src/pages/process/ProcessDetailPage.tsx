import { useParams, Link } from 'react-router-dom';
import { FileText, ClipboardCheck, BarChart3, ArrowLeft } from 'lucide-react';
import { useProcess } from '../../hooks/useProcess';
import { ErrorState } from '../../components/ui/ErrorState';
import { getErrorMessage } from '../../lib/error-utils';

export const ProcessDetailPage = () => {
  const { processId } = useParams();

  const { data: process, isLoading, isError, error, refetch } = useProcess(processId);

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
    <div className="py-8">
      <div className="mb-8">
        <Link to="/processes" className="inline-flex items-center gap-2 text-app-muted hover:text-app-text transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Volver a procesos
        </Link>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-app-border p-6 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-12 h-12 bg-app-accent/10 rounded-lg flex items-center justify-center mb-4">
            <ClipboardCheck className="w-6 h-6 text-app-accent" />
          </div>
          <h3 className="text-lg font-semibold text-app-text mb-2">Diagnóstico</h3>
          <p className="flex-1 min-h-[60px] text-app-muted text-sm mb-4">
            Evalúa el estado actual de tu empresa frente a los requisitos ISO.
          </p>
          <Link
            to={`/processes/${processId}/diagnose`}
            className="w-full py-2 px-4 bg-app-primary text-white rounded-lg font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            Iniciar Diagnóstico
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-app-border p-6 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-12 h-12 bg-app-accent/10 rounded-lg flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-app-accent" />
          </div>
          <h3 className="text-lg font-semibold text-app-text mb-2">Documentación</h3>
          <p className="flex-1 min-h-[60px] text-app-muted text-sm mb-4">
            Genera y gestiona manuales, procedimientos y registros.
          </p>
          <Link
            to={`/processes/${processId}/documents`}
            className="w-full py-2 px-4 bg-app-primary text-white rounded-lg font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            Ver Documentos
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-app-border p-6 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-12 h-12 bg-app-accent/10 rounded-lg flex items-center justify-center mb-4">
            <ClipboardCheck className="w-6 h-6 text-app-accent" />
          </div>
          <h3 className="text-lg font-semibold text-app-text mb-2">Auditorías</h3>
          <p className="flex-1 min-h-[60px] text-app-muted text-sm mb-4">
            Planifica y ejecuta auditorías internas de forma guiada.
          </p>
          <Link
            to={`/processes/${processId}/audits`}
            className="w-full py-2 px-4 bg-app-primary text-white rounded-lg font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            Gestionar Auditorías
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-app-border p-6 hover:shadow-md transition-shadow flex flex-col">
          <div className="w-12 h-12 bg-app-accent/10 rounded-lg flex items-center justify-center mb-4">
            <BarChart3 className="w-6 h-6 text-app-accent" />
          </div>
          <h3 className="text-lg font-semibold text-app-text mb-2">Indicadores</h3>
          <p className="flex-1 min-h-[60px] text-app-muted text-sm mb-4">
            Visualiza KPIs y métricas de desempeño del SGI.
          </p>
          <Link
            to={`/processes/${processId}/indicators`}
            className="w-full py-2 px-4 bg-app-primary text-white rounded-lg font-medium hover:bg-app-primary/90 transition-colors text-center"
          >
            Ver Indicadores
          </Link>
        </div>
      </div>
    </div>
  );
}
