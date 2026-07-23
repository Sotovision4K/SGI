import { Leaf, Settings2, Rocket } from 'lucide-react';
import { Card } from '../../../components/ui/Card';

interface MaturityCardsProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

// Icons mapped per maturity level (by index for the default 3-card layout).
const ICONS = [Leaf, Settings2, Rocket];

// Descriptions mapped per maturity level (by index).
const DESCRIPTIONS = [
  'Procesos informales, sin documentación estandarizada.',
  'Procesos definidos y documentados, mejora parcial.',
  'Procesos optimizados, medición y mejora continua.',
];

function descriptionFor(index: number): string {
  return DESCRIPTIONS[index] ?? '';
}

export function MaturityCards({ options, value, onChange }: MaturityCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {options.map((option, idx) => {
        const Icon = ICONS[idx] ?? ICONS[0];
        const selected = option === value;
        return (
          <Card
            key={option}
            onClick={() => onChange(option)}
            className={`cursor-pointer transition-all p-5 ${
              selected
                ? 'border-app-primary shadow-md bg-app-primary/5'
                : 'border-app-border hover:border-app-accent/50'
            }`}
          >
            <div className="flex flex-col items-center text-center gap-2">
              <Icon
                className={`w-8 h-8 ${selected ? 'text-app-primary' : 'text-app-muted'}`}
                aria-hidden="true"
              />
              <span className="font-semibold text-app-text">{option}</span>
              <p
                data-testid="maturity-desc"
                className="text-sm text-app-muted leading-snug"
              >
                {descriptionFor(idx)}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}