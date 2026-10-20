import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import type { ProfilingQuestionnaire, ProfilingQuestion, ProfilingSubmission } from '../../api/profiling';
import { MODULE_LABELS, type PerfilamientoModule } from '../../api/process';
import { moduleFromLabel, isAlwaysVisibleGroup } from './module-map';
import { Card, CardContent } from '../../components/ui/Card';
import { Progress } from '../../components/ui/Progress';

interface ProfilingFormProps {
  questionnaire: ProfilingQuestionnaire;
  onSubmit: (submission: ProfilingSubmission) => void;
  isSubmitting?: boolean;
  /** Pre-seed the base_08 selector with this module (still user-changeable). */
  initialModule?: PerfilamientoModule;
  /** Existing answers (resume/edit). Overrides the initialModule seed. */
  defaultValues?: Record<string, string>;
}

const INPUT_CLASS =
  'w-full px-3 py-2 border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent border-app-border';

/** Split a comma-joined chips value into items. */
function splitChips(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function ProfilingForm({ questionnaire, onSubmit, isSubmitting, initialModule, defaultValues }: ProfilingFormProps) {
  const { register, getValues, setValue, control } = useForm<Record<string, string>>({
    defaultValues: {
      ...(initialModule ? { base_08: MODULE_LABELS[initialModule] } : {}),
      ...defaultValues,
    },
    mode: 'onChange',
  });

  const values = useWatch({ control });

  const [painPoints, setPainPoints] = useState(defaultValues?.pain_points ?? '');

  const selectedModule = moduleFromLabel(String((values as Record<string, string>).base_08 ?? ''));

  const visibleGroups = questionnaire.groups.filter(
    (group) => isAlwaysVisibleGroup(group.id) || group.id === selectedModule,
  );

  const visibleRequired = visibleGroups.flatMap((group) =>
    group.questions.filter((q) => q.required),
  );

  const filledRequired = visibleRequired.filter((q) =>
    String((values as Record<string, string>)[q.id] ?? '').trim(),
  ).length;

  const progress =
    visibleRequired.length === 0
      ? 0
      : Math.min(100, Math.max(0, (filledRequired / visibleRequired.length) * 100));

  const hasUnfilledRequired = visibleRequired.some(
    (q) => !String((values as Record<string, string>)[q.id] ?? '').trim(),
  );

  function toggleChip(q: ProfilingQuestion, option: string) {
    const current = splitChips(String((values as Record<string, string>)[q.id] ?? ''));
    const next = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    setValue(q.id, next.join(', '), { shouldDirty: true });
  }

  function renderQuestion(q: ProfilingQuestion) {
    if (q.type === 'select') {
      return (
        <select {...register(q.id)} className={INPUT_CLASS}>
          <option value="">Seleccione...</option>
          {q.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (q.type === 'chips') {
      const selected = splitChips(String((values as Record<string, string>)[q.id] ?? ''));
      return (
        <div className="flex flex-wrap gap-2">
          {(q.options ?? []).map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                type="button"
                key={option}
                onClick={() => toggleChip(q, option)}
                aria-pressed={isSelected}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-app-primary text-white'
                    : 'bg-app-bg text-app-text hover:bg-app-border'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === 'text') {
      return <input type="text" {...register(q.id)} placeholder={q.placeholder} className={INPUT_CLASS} />;
    }

    return <input type="text" {...register(q.id)} placeholder={q.placeholder} className={INPUT_CLASS} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-app-muted">Perfilamiento Adaptativo</h2>
        <Progress value={progress} />
      </div>

      {visibleGroups.map((group) => (
        <Card key={group.id}>
          <CardContent className="space-y-5">
            <h3 className="text-lg font-semibold text-app-text">{group.title}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5">
              {group.questions.map((q) => {
                const fullWidth = q.type === 'chips';
                return (
                  <div key={q.id} className={fullWidth ? 'md:col-span-2' : undefined}>
                    <label className="block text-sm font-medium text-app-text mb-1">
                      {q.label}
                      {q.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderQuestion(q)}
                    {q.hint && <p className="text-xs text-app-muted mt-1">{q.hint}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {selectedModule === null && (
        <div className="px-4 py-3 rounded-lg bg-app-accent/10 text-app-muted text-sm">
          Seleccione la necesidad principal para ver las preguntas específicas del módulo.
        </div>
      )}

      <Card>
        <CardContent className="space-y-2">
          <label className="block text-sm font-medium text-app-text">
            Puntos críticos / Observaciones del auditor
          </label>
          <textarea
            value={painPoints}
            onChange={(e) => setPainPoints(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-app-border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent resize-y"
          />
        </CardContent>
      </Card>

      <div className="pt-4 border-t border-app-border flex justify-end">
        <button
          type="button"
          onClick={() => onSubmit({ answers: getValues(), painPoints, module: selectedModule })}
          disabled={isSubmitting || hasUnfilledRequired}
          className="px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Generar análisis
        </button>
      </div>
    </div>
  );
}
