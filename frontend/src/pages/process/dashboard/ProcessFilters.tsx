import { Search, X } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { MultiSelect } from '../../../components/ui/MultiSelect';
import { cn } from '../../../lib/cn';

const ESTADO_OPTIONS = [
  { value: 'in_diagnosis', label: 'En diagnóstico' },
  { value: 'plan_ready', label: 'En revisión' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completado' },
];

const NORMA_OPTIONS = [
  { value: 'iso9001', label: 'ISO 9001:2015' },
  { value: 'iso14001', label: 'ISO 14001:2015' },
  { value: 'iso45001', label: 'ISO 45001:2018' },
];

interface ProcessFiltersProps {
  selectedEstados: string[];
  setSelectedEstados: (v: string[]) => void;
  selectedNormas: string[];
  setSelectedNormas: (v: string[]) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}

export function ProcessFilters({
  selectedEstados,
  setSelectedEstados,
  selectedNormas,
  setSelectedNormas,
  searchQuery,
  setSearchQuery,
}: ProcessFiltersProps) {
  const hasFilters = searchQuery.trim() !== '' ||
    selectedEstados.length > 0 ||
    selectedNormas.length > 0;

  function handleClear() {
    setSearchQuery('');
    setSelectedEstados([]);
    setSelectedNormas([]);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-app-surface-alt border border-app-border rounded-2xl mb-6">
      <div className="relative flex-1 min-w-[200px]">
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

      <MultiSelect
        label="Estado"
        options={ESTADO_OPTIONS}
        selected={selectedEstados}
        onChange={setSelectedEstados}
        className="min-w-[170px]"
      />

      <MultiSelect
        label="Norma"
        options={NORMA_OPTIONS}
        selected={selectedNormas}
        onChange={setSelectedNormas}
        className="min-w-[170px]"
      />

      {hasFilters && (
        <button
          type="button"
          onClick={handleClear}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors',
            'text-app-muted hover:text-app-text hover:bg-[#EEF2F8]',
          )}
        >
          <X className="w-4 h-4" />
          Limpiar
        </button>
      )}
    </div>
  );
}
