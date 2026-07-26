import { useState } from 'react';
import { CheckCircle, RotateCcw, Eye, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useCompleteProcess, useReopenProcess } from '../../../hooks/useProcesses';
import type { Process } from '../../../api/process';

interface ProcessTableProps {
  processes: Process[];
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

const ISO_LABELS: Record<Process['iso_standard'], string> = {
  iso9001: 'ISO 9001:2015',
  iso14001: 'ISO 14001:2015',
  iso45001: 'ISO 45001:2018',
};

const STATUS_CONFIG: Record<Process['status'], { label: string; className: string }> = {
  in_diagnosis: {
    label: 'En diagnóstico',
    className: 'bg-status-pending-bg text-status-pending-text',
  },
  plan_ready: {
    label: 'Plan listo',
    className: 'bg-status-review-bg text-status-review-text',
  },
  in_progress: {
    label: 'En progreso',
    className: 'bg-status-in-progress-bg text-status-in-progress-text',
  },
  completed: {
    label: 'Completado',
    className: 'bg-status-completed-bg text-status-completed-text',
  },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function ProcessTable({ processes, onView, onDelete }: ProcessTableProps) {
  const completeProcess = useCompleteProcess();
  const reopenProcess = useReopenProcess();
  const [completeTarget, setCompleteTarget] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);

  const colClass = "grid grid-cols-6 items-center px-4";

  return (
    <div className="bg-white rounded-xl border border-app-border shadow-sm overflow-hidden">
      <ConfirmDialog
        open={!!completeTarget}
        onOpenChange={(open) => { if (!open) setCompleteTarget(null); }}
        title="Marcar como completado"
        description="¿Estás seguro de completar este proceso? Podrás reabrirlo después si es necesario."
        confirmLabel="Completar"
        onConfirm={() => { completeProcess.mutate(completeTarget!); setCompleteTarget(null); }}
        loading={completeProcess.isPending}
      />
      <ConfirmDialog
        open={!!reopenTarget}
        onOpenChange={(open) => { if (!open) setReopenTarget(null); }}
        title="Reabrir proceso"
        description="¿Estás seguro de reabrir este proceso? Volverá al estado anterior."
        confirmLabel="Reabrir"
        onConfirm={() => { reopenProcess.mutate(reopenTarget!); setReopenTarget(null); }}
        loading={reopenProcess.isPending}
      />

      {/* Header */}
      <div className={`${colClass} h-10 border-b border-app-border bg-app-bg`}>
        <div className="text-xs font-medium text-app-muted">ID</div>
        <div className="text-xs font-medium text-app-muted">Empresa</div>
        <div className="text-xs font-medium text-app-muted">Norma</div>
        <div className="text-xs font-medium text-app-muted">Estado</div>
        <div className="text-xs font-medium text-app-muted">Fecha inicio</div>
        <div className="text-xs font-medium text-app-muted text-right">Acciones</div>
      </div>

      {/* Body */}
      {processes.length === 0 ? (
        <div className={`${colClass} py-10`}>
          <div className="col-span-6 text-center text-app-muted text-sm">
            No hay procesos que coincidan con los filtros
          </div>
        </div>
      ) : (
        processes.map((process) => {
          const status = STATUS_CONFIG[process.status] ?? STATUS_CONFIG.in_diagnosis;
          return (
            <div
              key={process.id}
              className={`${colClass} py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors`}
            >
              <div className="font-mono text-xs text-app-muted truncate pr-2">
                {shortId(process.id)}
              </div>
              <div className="font-medium text-app-text text-sm truncate pr-2">
                {process.company_name || '(sin empresa)'}
              </div>
              <div className="text-app-text text-sm truncate pr-2">
                {ISO_LABELS[process.iso_standard] ?? process.iso_standard}
              </div>
              <div>
                <Badge variant="status" className={status.className}>
                  {status.label}
                </Badge>
              </div>
              <div className="text-app-muted text-sm truncate pr-2">
                {formatDate(process.created_at)}
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => onView(process.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-app-accent hover:bg-app-accent/10 rounded-md transition-colors"
                  title="Ver proceso"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
                {process.status !== 'completed' && (
                  <button
                    onClick={() => setCompleteTarget(process.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-status-completed-text hover:bg-status-completed-bg rounded-md transition-colors"
                    title="Marcar como completado"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Completar
                  </button>
                )}
                {process.status === 'completed' && (
                  <button
                    onClick={() => setReopenTarget(process.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-app-muted hover:bg-app-bg rounded-md transition-colors"
                    title="Reabrir proceso"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reabrir
                  </button>
                )}
                <button
                  onClick={() => onDelete(process.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Eliminar proceso"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
