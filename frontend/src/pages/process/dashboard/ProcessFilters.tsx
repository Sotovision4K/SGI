import { Search, X } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { MultiSelect } from '../../../components/ui/MultiSelect';
import { cn } from '../../../lib/cn';
import { MODULE_LABELS, type PerfilamientoModule } from '../../../api/process';

const ESTADO_OPTIONS = [
  { value: 'in_diagnosis', label: 'En diagnóstico' },
  { value: 'plan_ready', label: 'Plan listo' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completado' },
  { value: 'profiling_pending', label: 'Perfilamiento pendiente' },
];

const MODULO_OPTIONS = (Object.keys(MODULE_LABELS) as PerfilamientoModule[]).map((key) => ({
  value: key,
  label: MODULE_LABELS[key],
}));

interface ProcessFiltersProps {
  selectedEstados: string[];
  setSelectedEstados: (v: string[]) => void;
  selectedModules: string[];
  setSelectedModules: (v: string[]) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}

export function ProcessFilters({
  selectedEstados,
  setSelectedEstados,
  selectedModules,
  setSelectedModules,
  searchQuery,
  setSearchQuery,
}: ProcessFiltersProps) {
  const hasFilters = searchQuery.trim() !== '' ||
    selectedEstados.length > 0 ||
    selectedModules.length > 0;

  function handleClear() {
    setSearchQuery('');
    setSelectedEstados([]);
    setSelectedModules([]);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-app-surface-alt border border-app-border rounded-2xl mb-6">
      {/* Enrichment: fixed-width pill search so it reads as a compact control, not a full-width bar */}
      <div className="relative w-full sm:w-72">
        <Search className="w-4 h-4 text-app-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por empresa o ID..."
          className="pl-9 rounded-full"
          aria-label="Buscar procesos"
        />
      </div>

      <MultiSelect
        label="Estado"
        options={ESTADO_OPTIONS}
        selected={selectedEstados}
        onChange={setSelectedEstados}
        className="w-full sm:w-auto sm:min-w-[170px]"
      />

      <MultiSelect
        label="Módulo"
        options={MODULO_OPTIONS}
        selected={selectedModules}
        onChange={setSelectedModules}
        className="w-full sm:w-auto sm:min-w-[170px]"
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
