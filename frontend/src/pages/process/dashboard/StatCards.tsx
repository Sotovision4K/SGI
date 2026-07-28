import { FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import type { Process } from '../../../api/process';

interface StatCardsProps {
  processes: Process[];
}

const cards = [
  {
    label: 'Total procesos',
    key: 'total' as const,
    icon: FileText,
    iconBg: 'bg-stat-total',
  },
  {
    label: 'En progreso',
    key: 'progreso' as const,
    icon: Clock,
    iconBg: 'bg-stat-progreso',
  },
  {
    label: 'Completados',
    key: 'completado' as const,
    icon: CheckCircle,
    iconBg: 'bg-stat-completado',
  },
  {
    label: 'Pendiente revisión',
    key: 'revision' as const,
    icon: AlertCircle,
    iconBg: 'bg-stat-revision',
  },
];

export function StatCards({ processes }: StatCardsProps) {
  const total = processes.length;
  const inProgress = processes.filter((p) => p.status === 'in_progress').length;
  const completed = processes.filter((p) => p.status === 'completed').length;
  const pendingReview = processes.filter(
    (p) => p.status === 'in_diagnosis' || p.status === 'plan_ready',
  ).length;

  const values: Record<string, number> = {
    total,
    progreso: inProgress,
    completado: completed,
    revision: pendingReview,
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className="relative bg-app-surface-alt border border-app-border rounded-2xl p-5 transition-colors hover:border-app-border-hover"
          >
            <div
              className={`absolute top-3 right-3 w-9 h-9 rounded-lg flex items-center justify-center ${card.iconBg}`}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-[28px] font-bold text-app-text leading-none">{values[card.key]}</p>
            <p className="text-sm text-app-muted mt-2">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
