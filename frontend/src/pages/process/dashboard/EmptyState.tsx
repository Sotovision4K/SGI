import { FileText, Settings, ClipboardList, ClipboardCheck, ListChecks, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface EmptyStateProps {
  onCreateProcess: () => void;
}

const WIZARD_STEPS = [
  { label: 'Configuración', icon: Settings },
  { label: 'Pre-diagnóstico', icon: ClipboardList },
  { label: 'Diagnóstico ISO', icon: ClipboardCheck },
  { label: 'Plan', icon: ListChecks },
];

export function EmptyState({ onCreateProcess }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-app-border shadow-sm p-12 text-center">
      <div className="w-16 h-16 bg-app-accent/10 rounded-full flex items-center justify-center mx-auto mb-5">
        <FileText className="w-8 h-8 text-app-accent" />
      </div>
      <h3 className="text-lg font-semibold text-app-text mb-2">
        No certification processes yet
      </h3>
      <p className="text-sm text-app-muted mb-6 max-w-md mx-auto">
        Crea tu primer proceso de certificación y recorre el asistente de 4 pasos:
      </p>

      <div className="flex items-center justify-center gap-2 flex-wrap mb-8">
        {WIZARD_STEPS.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-app-bg border border-app-border">
                <Icon className="w-3.5 h-3.5 text-app-accent" />
                <span className="text-xs font-medium text-app-text">{step.label}</span>
              </div>
              {idx < WIZARD_STEPS.length - 1 && (
                <span className="text-app-muted text-xs">→</span>
              )}
            </div>
          );
        })}
      </div>

      <Button variant="secondary" size="md" onClick={onCreateProcess} className="gap-2">
        <Plus className="w-4 h-4" />
        Crear Proceso
      </Button>
    </div>
  );
}