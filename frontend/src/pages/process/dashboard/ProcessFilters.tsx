import { Search } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { SelectNative } from '../../../components/ui/Select';

interface ProcessFiltersProps {
  isoFilter: string;
  setIsoFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}

export function ProcessFilters({
  isoFilter,
  setIsoFilter,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
}: ProcessFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por empresa o ID..."
          className="pl-9"
          aria-label="Buscar procesos"
        />
      </div>

      <SelectNative
        value={isoFilter}
        onChange={(e) => setIsoFilter(e.target.value)}
        className="w-auto min-w-[160px]"
        aria-label="Filtrar por norma"
      >
        <option value="">Todas las normas</option>
        <option value="iso9001">ISO 9001:2015</option>
        <option value="iso14001">ISO 14001:2015</option>
        <option value="iso45001">ISO 45001:2018</option>
      </SelectNative>

      <SelectNative
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="w-auto min-w-[160px]"
        aria-label="Filtrar por estado"
      >
        <option value="">Todos los estados</option>
        <option value="in_diagnosis">En diagnóstico</option>
        <option value="plan_ready">Plan listo</option>
        <option value="in_progress">En progreso</option>
        <option value="completed">Completado</option>
      </SelectNative>
    </div>
  );
}