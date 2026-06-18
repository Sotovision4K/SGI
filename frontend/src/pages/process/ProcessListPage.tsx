import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Plus, Trash2, Building2, LogOut, FileText } from 'lucide-react';
import { useProcesses, useDeleteProcess } from '../../hooks/useProcesses';
import { StartProcessModal } from './StartProcessModal';
import type { Process } from '../../api/process';

const ISO_LABELS: Record<Process['iso_standard'], string> = {
  iso9001: 'ISO 9001:2015',
  iso14001: 'ISO 14001:2015',
  iso45001: 'ISO 45001:2018',
};

const STATUS_LABELS: Record<Process['status'], { label: string; className: string }> = {
  in_diagnosis: { label: 'En diagnóstico', className: 'bg-amber-100 text-amber-700' },
  plan_ready: { label: 'Plan listo', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'En progreso', className: 'bg-purple-100 text-purple-700' },
  completed: { label: 'Completado', className: 'bg-green-100 text-green-700' },
};

export const ProcessListPage = () => {
  const navigate = useNavigate();
  const { user, signoutRedirect } = useAuth();
  const { data: processes, isLoading } = useProcesses();
  const deleteProcess = useDeleteProcess();
  const [showStartModal, setShowStartModal] = useState(false);

  const fullName = user?.profile?.name || user?.profile?.email || 'Usuario';
  const email = user?.profile?.email || '';

  const handleLogout = () => {
    signoutRedirect();
  };

  const handleDelete = (processId: string) => {
    if (window.confirm('¿Estás seguro de eliminar este proceso?')) {
      deleteProcess.mutate(processId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-bg-soft">
      <header className="bg-white border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-primary">Procesos de Certificación</h1>
            <p className="text-text-muted mt-1">Gestiona tus procesos de certificación ISO</p>
          </div>
          <button
            onClick={() => setShowStartModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Proceso
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-text-muted">Cargando procesos...</div>
          </div>
        ) : processes && processes.length > 0 ? (
          <div className="grid gap-4">
            {processes.map((process) => {
              const statusInfo = STATUS_LABELS[process.status] ?? STATUS_LABELS.in_diagnosis;
              return (
                <div
                  key={process.id}
                  className="bg-white rounded-xl border border-border p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-primary">
                          {process.company_name || '(sin empresa)'}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-text-muted">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {ISO_LABELS[process.iso_standard] ?? process.iso_standard}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          Creado: {formatDate(process.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleDelete(process.id)}
                        className="p-2 text-text-muted hover:text-red-500 transition-colors"
                        title="Eliminar proceso"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => navigate(`/processes/${process.id}`)}
                        className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
                      >
                        Ver Proceso
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border p-12 text-center">
            <div className="w-16 h-16 bg-accent-light rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">No hay procesos</h3>
            <p className="text-text-muted mb-4">
              Crea tu primer proceso de certificación para comenzar
            </p>
            <button
              onClick={() => setShowStartModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Crear Proceso
            </button>
          </div>
        )}
      </main>

      {showStartModal && <StartProcessModal onClose={() => setShowStartModal(false)} />}
    </div>
  );
}
