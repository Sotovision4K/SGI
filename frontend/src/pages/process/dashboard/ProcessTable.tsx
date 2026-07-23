import { Eye, Trash2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
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
  return (
    <div className="bg-white rounded-xl border border-app-border shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>ID</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Norma</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha inicio</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {processes.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-center text-app-muted py-8 w-full">
                No hay procesos que coincidan con los filtros
              </TableCell>
            </TableRow>
          ) : (
            processes.map((process) => {
              const status = STATUS_CONFIG[process.status] ?? STATUS_CONFIG.in_diagnosis;
              return (
                <TableRow key={process.id} className="hover:bg-app-bg/50">
                  <TableCell className="font-mono text-xs text-app-muted">
                    {shortId(process.id)}
                  </TableCell>
                  <TableCell className="font-medium text-app-text">
                    {process.company_name || '(sin empresa)'}
                  </TableCell>
                  <TableCell className="text-app-text">
                    {ISO_LABELS[process.iso_standard] ?? process.iso_standard}
                  </TableCell>
                  <TableCell>
                    <Badge variant="status" className={status.className}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-app-muted">
                    {formatDate(process.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onView(process.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-app-accent hover:bg-app-accent/10 rounded-md transition-colors"
                        title="Ver proceso"
                      >
                        <Eye className="w-4 h-4" />
                        Ver
                      </button>
                      <button
                        onClick={() => onDelete(process.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Eliminar proceso"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}