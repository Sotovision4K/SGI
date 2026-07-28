import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import type { Process } from '../../../api/process';

interface ActivityWidgetProps {
  processes: Process[];
}

const STATUS_DOT: Record<Process['status'], string> = {
  in_diagnosis: 'bg-[#F59E0B]',
  plan_ready: 'bg-[#F97316]',
  in_progress: 'bg-[#0066CC]',
  completed: 'bg-[#10B981]',
};

const STATUS_LABEL: Record<Process['status'], { label: string; className: string }> = {
  in_diagnosis: { label: 'En diagnóstico', className: 'bg-status-pending-bg text-status-pending-text' },
  plan_ready: { label: 'En revisión', className: 'bg-status-review-bg text-status-review-text' },
  in_progress: { label: 'En progreso', className: 'bg-status-in-progress-bg text-status-in-progress-text' },
  completed: { label: 'Completado', className: 'bg-status-completed-bg text-status-completed-text' },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ActivityWidget({ processes }: ActivityWidgetProps) {
  const navigate = useNavigate();

  const recent = [...processes]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);

  return (
    <div className="bg-white border border-app-border rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-app-text mb-4">
        <Activity className="w-4 h-4 text-app-accent" />
        Actividad Reciente
      </h3>
      {recent.length === 0 ? (
        <p className="text-sm text-app-muted text-center py-6">No hay actividad reciente</p>
      ) : (
        <ul className="space-y-1">
          {recent.map((process) => {
            const status = STATUS_LABEL[process.status] ?? STATUS_LABEL.in_diagnosis;
            const dotColor = STATUS_DOT[process.status] ?? 'bg-app-accent';
            return (
              <li key={process.id}>
                <button
                  onClick={() => navigate(`/processes/${process.id}`)}
                  className="w-full flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-[#F1F5F9] transition-colors text-left"
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-app-text block truncate">
                      {process.company_name || '(sin empresa)'}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="status" className={status.className}>{status.label}</Badge>
                      <span className="text-xs text-app-muted">{formatDate(process.created_at)}</span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
