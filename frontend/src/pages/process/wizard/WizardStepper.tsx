import { Check } from 'lucide-react';

interface WizardStepperProps {
  current: 0 | 1 | 2 | 3;
  steps: string[];
}

export function WizardStepper({ current, steps }: WizardStepperProps) {
  return (
    <nav aria-label="Progreso del asistente" className="mb-8">
      <ol className="flex items-center justify-between">
        {steps.map((label, i) => {
          const isActive = i === current;
          const isCompleted = i < current;
          const isPending = i > current;
          return (
            <li key={i} className="flex-1 flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isCompleted
                      ? 'bg-success text-white'
                      : isActive
                        ? 'bg-app-primary text-white'
                        : 'bg-app-bg text-app-muted border border-app-border'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                </span>
                <span
                  className={`text-sm font-medium hidden sm:inline ${
                    isActive ? 'text-app-accent' : isCompleted ? 'text-success' : 'text-app-muted'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    isCompleted ? 'bg-success' : isPending ? 'bg-app-border' : 'bg-app-border'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}