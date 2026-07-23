import { FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import type { Process } from '../../../api/process';

interface StatCardsProps {
  processes: Process[];
}

export function StatCards({ processes }: StatCardsProps) {
  const total = processes.length;
  const inProgress = processes.filter((p) => p.status === 'in_progress').length;
  const completed = processes.filter((p) => p.status === 'completed').length;
  const pendingReview = processes.filter(
    (p) => p.status === 'in_diagnosis' || p.status === 'plan_ready',
  ).length;

  const cards = [
    {
      label: 'Total procesos',
      value: total,
      icon: FileText,
      iconClass: 'text-app-accent',
      iconBg: 'bg-app-accent/10',
    },
    {
      label: 'En progreso',
      value: inProgress,
      icon: Clock,
      iconClass: 'text-status-in-progress-text',
      iconBg: 'bg-status-in-progress-bg',
    },
    {
      label: 'Completados',
      value: completed,
      icon: CheckCircle,
      iconClass: 'text-status-completed-text',
      iconBg: 'bg-status-completed-bg',
    },
    {
      label: 'Pendiente revisión',
      value: pendingReview,
      icon: AlertCircle,
      iconClass: 'text-status-review-text',
      iconBg: 'bg-status-review-bg',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="p-6 flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}
            >
              <Icon className={`w-6 h-6 ${card.iconClass}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-app-muted">{card.label}</p>
              <p className="text-2xl font-bold text-app-text mt-0.5">{card.value}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}