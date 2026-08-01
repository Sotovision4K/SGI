import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList } from 'lucide-react';
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

  const [selectedEstados, setSelectedEstados] = useState<string[]>([]);
  const [selectedNormas, setSelectedNormas] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return (processes ?? []).filter((p) => {
      if (selectedEstados.length > 0 && !selectedEstados.includes(p.status)) return false;
      if (selectedNormas.length > 0 && !selectedNormas.includes(p.iso_standard)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesCompany = (p.company_name ?? '').toLowerCase().includes(q);
        const matchesId = p.id.toLowerCase().includes(q);
        if (!matchesCompany && !matchesId) return false;
      }
      return true;
    });
  }, [processes, selectedEstados, selectedNormas, searchQuery]);

  const handleDelete = (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este proceso?')) {
      deleteProcess.mutate(id);
    }
  };

  return (
    <div className="p-4 lg:p-6 min-h-full">
      {/* Enrichment: outer card with shadow + white bg for contrast against the app-bg page background */}
      <div className="bg-white rounded-2xl border border-app-border shadow-md p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-app-text">Procesos de Certificación</h1>
            <p className="text-sm text-app-muted mt-0.5">Gestiona tus procesos de certificación ISO</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/processes/new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-app-primary text-white rounded-lg font-medium hover:bg-app-primary/90 transition-colors self-start text-sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo proceso
        </button>
      </div>

      <StatCards processes={processes ?? []} />

      {isError && (
        <ErrorState
          title="No se pudieron cargar los procesos"
          message={getErrorMessage(error)}
          action={{ label: 'Reintentar', onClick: () => refetch() }}
        />
      )}

      {isLoading && (
        <div className="bg-white rounded-2xl border border-app-border shadow-sm p-12 text-center text-app-muted">
          Cargando procesos...
        </div>
      )}

      {!isLoading && !isError && (processes ?? []).length === 0 && (
        <EmptyState onCreateProcess={() => navigate('/processes/new')} />
      )}

      {!isLoading && !isError && (processes ?? []).length > 0 && (
        <ProcessFilters
          selectedEstados={selectedEstados}
          setSelectedEstados={setSelectedEstados}
          selectedNormas={selectedNormas}
          setSelectedNormas={setSelectedNormas}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {!isLoading && !isError && (processes ?? []).length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          <ProcessTable
            processes={filtered}
            onView={(id) => navigate(`/processes/${id}`)}
            onDelete={handleDelete}
          />
          <div className="space-y-6">
            <ActivityWidget processes={processes ?? []} />
            <CompaniesWidget
              companies={companies}
              navigateToNewProcess={() => navigate('/processes/new')}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
