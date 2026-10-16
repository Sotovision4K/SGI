import { AlertTriangle, Calculator, Clock, ListChecks } from 'lucide-react';
import type { ProfilingResult } from '../../api/profiling';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';

interface ProfilingResultsProps {
  result: ProfilingResult;
  onBack: () => void;
}

const CONFIDENCE_LABELS: Record<ProfilingResult['cost_estimation']['confidence'], string> = {
  low: 'Baja confianza',
  medium: 'Confianza media',
  high: 'Alta confianza',
};

const CONFIDENCE_VARIANTS: Record<
  ProfilingResult['cost_estimation']['confidence'],
  'outline' | 'secondary' | 'default'
> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
};

export function ProfilingResults({ result, onBack }: ProfilingResultsProps) {
  const costConfidence = result.cost_estimation.confidence;
  const timeConfidence = result.time_estimation.confidence;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-app-accent" />
            Puntos críticos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownRenderer>{result.pain_points_analysis}</MarkdownRenderer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-5 w-5 text-app-accent" />
            Estimación de costos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-app-primary">{result.cost_estimation.range_cop}</p>
          <ul className="mb-3 mt-3 list-inside list-disc space-y-1 text-sm text-app-text">
            {result.cost_estimation.breakdown.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <Badge variant={CONFIDENCE_VARIANTS[costConfidence]}>
            {CONFIDENCE_LABELS[costConfidence]}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-app-accent" />
            Estimación de tiempo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-app-primary">
            {result.time_estimation.months === 0
              ? 'Por definir'
              : `≈ ${result.time_estimation.months} meses`}
          </p>
          <ul className="mb-3 mt-3 list-inside list-disc space-y-1 text-sm text-app-text">
            {result.time_estimation.phases.map((phase, i) => (
              <li key={i}>{phase}</li>
            ))}
          </ul>
          <Badge variant={CONFIDENCE_VARIANTS[timeConfidence]}>
            {CONFIDENCE_LABELS[timeConfidence]}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 text-app-accent" />
            Plan de acción
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.action_plan.phases.length === 0 ? (
            <p className="text-sm text-app-muted">Sin plan definido</p>
          ) : (
            <div className="space-y-4">
              {result.action_plan.phases.map((phase, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-app-text">{phase.name}</p>
                    <span className="text-sm text-app-muted">{phase.duration_weeks} semanas</span>
                  </div>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-app-text">
                    {phase.activities.map((activity, j) => (
                      <li key={j}>{activity}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {result.action_plan.milestones.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-semibold text-app-text">Hitos</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-app-text">
                {result.action_plan.milestones.map((milestone, i) => (
                  <li key={i}>{milestone}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-app-border px-4 py-2 text-sm font-medium text-app-muted hover:bg-app-bg hover:text-app-text"
        >
          Volver
        </button>
      </div>
    </div>
  );
}
