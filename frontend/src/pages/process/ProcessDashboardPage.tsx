import { useParams, Link } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { FileText, ClipboardCheck, BarChart3, LogOut, ArrowLeft } from 'lucide-react';
import { useProcess } from '../../hooks/useProcess';

export const ProcessDashboardPage = () => {
  const { processId } = useParams();
  const { user, signoutRedirect } = useAuth();

  const { data: process, isLoading } = useProcess(processId);

  const fullName = user?.profile?.name || user?.profile?.email || 'Usuario';
  const email = user?.profile?.email || '';

  const handleLogout = () => {
    signoutRedirect();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-soft flex items-center justify-center">
        <div className="text-text-muted">Cargando proceso...</div>
      </div>
    );
  }

  if (!process) {
    return (
      <div className="min-h-screen bg-bg-soft flex items-center justify-center">
        <div className="text-text-muted">Proceso no encontrado</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="bg-white border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Link to="/api/v1/process" className="flex items-center gap-2 text-text-muted hover:text-primary transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white text-sm font-extrabold">
                SGI
              </div>
              <span className="text-xl font-bold text-primary">SGI Pro</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-text-main">{fullName}</p>
                <p className="text-xs text-text-muted">{email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-text-muted hover:text-red-500 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-primary">{process.companyName}</h1>
            <span className="px-3 py-1 bg-accent-light text-accent text-sm font-medium rounded-full">
              {process.isoStandard}
            </span>
          </div>
          <p className="text-text-muted">
            Proceso de certificación {process.status === 'in_progress' ? 'en progreso' : process.status === 'draft' ? 'en borrador' : 'completado'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <ClipboardCheck className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Diagnóstico</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Evalúa el estado actual de tu empresa frente a los requisitos ISO.
            </p>
            <Link
              to={`/api/v1/process/${processId}/diagnose`}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors text-center"
            >
              Iniciar Diagnóstico
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Documentación</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Genera y gestiona manuales, procedimientos y registros.
            </p>
            <Link
              to={`/api/v1/process/${processId}/documents`}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors text-center"
            >
              Ver Documentos
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <ClipboardCheck className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Auditorías</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Planifica y ejecuta auditorías internas de forma guiada.
            </p>
            <Link
              to={`/api/v1/process/${processId}/audits`}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors text-center"
            >
              Gestionar Auditorías
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-12 h-12 bg-accent-light rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">Indicadores</h3>
            <p className="flex-1 min-h-[60px] text-text-muted text-sm mb-4">
              Visualiza KPIs y métricas de desempeño del SGI.
            </p>
            <Link
              to={`/api/v1/process/${processId}/indicators`}
              className="w-full py-2 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors text-center"
            >
              Ver Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}