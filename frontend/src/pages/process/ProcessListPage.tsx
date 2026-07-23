import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useProcesses, useDeleteProcess } from '../../hooks/useProcesses';
import { useCompanies } from '../../hooks/useCompanies';
import { ErrorState } from '../../components/ui/ErrorState';
import { getErrorMessage } from '../../lib/error-utils';
import { StatCards } from './dashboard/StatCards';
import { ProcessFilters } from './dashboard/ProcessFilters';
import { ProcessTable } from './dashboard/ProcessTable';
import { ActivityWidget } from './dashboard/ActivityWidget';
import { CompaniesWidget } from './dashboard/CompaniesWidget';
import { EmptyState } from './dashboard/EmptyState';

export const ProcessListPage = () => {
  const navigate = useNavigate();
  const { data: processes, isLoading, isError, error, refetch } = useProcesses();
  const { data: companies = [] } = useCompanies();
  const deleteProcess = useDeleteProcess();

  const [isoFilter, setIsoFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return (processes ?? []).filter((p) => {
      if (isoFilter && p.iso_standard !== isoFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesCompany = (p.company_name ?? '').toLowerCase().includes(q);
        const matchesId = p.id.toLowerCase().includes(q);
        if (!matchesCompany && !matchesId) return false;
      }
      return true;
    });
  }, [processes, isoFilter, statusFilter, searchQuery]);

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este proceso?')) {
      deleteProcess.mutate(id);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-text">Procesos de Certificación</h1>
          <p className="text-app-muted mt-1">Gestiona tus procesos de certificación ISO</p>
        </div>
        <button
          onClick={() => navigate('/processes/new')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-app-primary text-white rounded-lg font-medium hover:bg-app-primary/90 transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          Nuevo Proceso
        </button>
      </div>

      <StatCards processes={safeProcesses} />

      {isError && (
        <ErrorState
          title="No se pudieron cargar los procesos"
          message={getErrorMessage(error)}
          action={{ label: 'Reintentar', onClick: () => refetch() }}
        />
      )}

      {isLoading && (
        <div className="bg-white rounded-xl border border-app-border shadow-sm p-12 text-center text-app-muted">
          Cargando procesos...
        </div>
      )}

      {!isLoading && !isError && safeProcesses.length === 0 && (
        <EmptyState onCreateProcess={() => navigate('/processes/new')} />
      )}

      {!isLoading && !isError && safeProcesses.length > 0 && (
        <div>
          <ProcessFilters
            isoFilter={isoFilter}
            setIsoFilter={setIsoFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
          <ProcessTable
            processes={filtered}
            onView={(id) => navigate(`/processes/${id}`)}
            onDelete={handleDelete}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        <ActivityWidget processes={safeProcesses} />
        <CompaniesWidget
          companies={companies}
          navigateToNewProcess={() => navigate('/processes/new')}
        />
      </div>
    </div>
  );
};