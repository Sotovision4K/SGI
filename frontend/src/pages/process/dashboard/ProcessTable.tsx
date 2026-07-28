import { useState } from 'react';
import { CheckCircle, RotateCcw, Eye, Trash2, Pencil } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table';
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
    label: 'En revisión',
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

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return formatDate(dateString);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function ProcessTable({ processes, onView, onDelete }: ProcessTableProps) {
  const completeProcess = useCompleteProcess();
  const reopenProcess = useReopenProcess();
  const [completeTarget, setCompleteTarget] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-app-border shadow-sm overflow-hidden">
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
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-app-muted font-semibold">ID</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-app-muted font-semibold">Empresa</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-app-muted font-semibold">Norma</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-app-muted font-semibold">Estado</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-app-muted font-semibold">Fecha inicio</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-app-muted font-semibold">Última actualización</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-app-muted font-semibold text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {processes.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="text-center text-app-muted py-8">
                No hay procesos que coincidan con los filtros
              </TableCell>
            </TableRow>
          ) : (
            processes.map((process) => {
              const status = STATUS_CONFIG[process.status] ?? STATUS_CONFIG.in_diagnosis;
              return (
                <TableRow key={process.id} className="hover:bg-[#F1F5F9]">
                  <TableCell>
                    <span className="inline-block font-mono text-xs text-app-muted px-2 py-0.5 rounded-full bg-[#F1F5F9]">
                      {shortId(process.id)}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-app-text text-sm truncate">
                    {process.company_name || '(sin empresa)'}
                  </TableCell>
                  <TableCell className="text-app-text text-sm truncate">
                    {ISO_LABELS[process.iso_standard] ?? process.iso_standard}
                  </TableCell>
                  <TableCell>
                    <Badge variant="status" className={status.className}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-app-muted text-sm truncate">
                    {formatDate(process.created_at)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs text-app-muted px-2 py-1 rounded-full bg-[#F1F5F9]">
                      <Pencil className="w-3 h-3" />
                      {timeAgo(process.updated_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onView(process.id)}
                        data-tooltip="Ver detalles"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-app-muted hover:bg-[#EEF2F8] hover:text-[#0066CC] transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {process.status !== 'completed' && (
                        <button
                          onClick={() => setCompleteTarget(process.id)}
                          data-tooltip="Marcar como completado"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-app-muted hover:bg-[#EEF2F8] hover:text-[#10B981] transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {process.status === 'completed' && (
                        <button
                          onClick={() => setReopenTarget(process.id)}
                          data-tooltip="Reabrir"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-app-muted hover:bg-[#EEF2F8] hover:text-[#0066CC] transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(process.id)}
                        data-tooltip="Eliminar"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-app-muted hover:bg-[#EEF2F8] hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <style>{`
[data-tooltip] {
  position: relative;
}
[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  background: #1E293B;
  color: #fff;
  border-radius: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
[data-tooltip]:hover::after {
  opacity: 1;
}
`}</style>
    </div>
  );
}
