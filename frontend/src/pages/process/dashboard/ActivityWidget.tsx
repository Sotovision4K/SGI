import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import type { Process } from '../../../api/process';

interface ActivityWidgetProps {
  processes: Process[];
}

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

export function ActivityWidget({ processes }: ActivityWidgetProps) {
  const navigate = useNavigate();

  const recent = [...processes]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-app-accent" />
          Actividad Reciente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-app-muted text-center py-6">
            No hay actividad reciente
          </p>
        ) : (
          <ul className="space-y-1">
            {recent.map((process) => {
              const status = STATUS_CONFIG[process.status] ?? STATUS_CONFIG.in_diagnosis;
              return (
                <li key={process.id}>
                  <button
                    onClick={() => navigate(`/processes/${process.id}`)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-app-bg transition-colors text-left"
                  >
                    <span className="w-2 h-2 rounded-full bg-app-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-app-text truncate">
                          {process.company_name || '(sin empresa)'}
                        </span>
                        <Badge variant="status" className={status.className}>
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-app-muted mt-0.5">
                        {formatDate(process.created_at)}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-app-muted shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}