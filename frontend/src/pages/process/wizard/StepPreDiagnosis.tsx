import { useEffect, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { Loader2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { useQuestionnaire } from '../../../hooks/useQuestionnaire';
import { savePreDiagnosis } from '../../../api/process';
import { useApiAuthBridge } from '../../../lib/use-api-auth';
import { getErrorMessage } from '../../../lib/error-utils';
import type { Question, QuestionGroup } from '../../../api/questionnaire';
import { Card, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Progress } from '../../../components/ui/Progress';
import { MaturityCards } from './MaturityCards';
import { ObjectiveChips } from './ObjectiveChips';
import { getSuggestedObjectives } from './ai-suggestions';

export type ISOStandard = 'iso9001' | 'iso14001' | 'iso45001';

interface StepPreDiagnosisProps {
  processId: string;
  isoStandard?: ISOStandard;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Split a comma-joined chips value into items. */
function splitChips(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function StepPreDiagnosis({ processId, isoStandard, onDone, onDirtyChange }: StepPreDiagnosisProps) {
  const { getToken } = useApiAuthBridge();
  const { data: questionnaire, isLoading, error: loadError } = useQuestionnaire('pre_diagnosis');
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty, isSubmitting },
    setError,
  } = useForm<Record<string, string>>({ defaultValues: {}, mode: 'onChange' });

  // Subscribe to all form values so the component re-renders on every change,
  // enabling us to compute the Next-button enabled state synchronously.
  const values = useWatch({ control });

  const [subStep, setSubStep] = useState(0);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  if (!isoStandard) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Falta la norma ISO para cargar el cuestionario. Vuelva al paso de configuración.
      </div>
    );
  }

  async function onSubmit(data: Record<string, string>) {
    try {
      await savePreDiagnosis(processId, data, { token: getToken() });
      onDone();
    } catch (err) {
      setError('root', { message: getErrorMessage(err) });
    }
  }

  /** Whether the current group has any *required* field still empty. */
  function groupHasUnfilledRequired(group: QuestionGroup): boolean {
    return group.questions.some((q) => q.required && !String((values as Record<string, string>)[q.id] ?? '').trim());
  }

  function renderQuestion(q: Question) {
    const errorMsg = errors[q.id]?.message as string | undefined;

    if (q.type === 'cards') {
      return (
        <Controller
          control={control}
          name={q.id}
          rules={{ required: q.required ? 'Campo requerido' : false }}
          render={({ field }) => (
            <MaturityCards
              options={q.options ?? []}
              value={field.value ?? ''}
              onChange={field.onChange}
            />
          )}
        />
      );
    }

    if (q.type === 'chips') {
      return (
        <Controller
          control={control}
          name={q.id}
          rules={{ required: q.required ? 'Campo requerido' : false }}
          render={({ field }) => (
            <ObjectiveChips
              options={q.options ?? []}
              value={field.value ?? ''}
              onChange={field.onChange}
            />
          )}
        />
      );
    }

    if (q.type === 'select') {
      return (
        <select
          {...register(q.id, { required: q.required ? 'Campo requerido' : false })}
          className={`w-full px-3 py-2 border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent ${errorMsg ? 'border-red-400' : 'border-app-border'}`}
        >
          <option value="">Seleccione...</option>
          {q.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (q.type === 'textarea') {
      return (
        <textarea
          {...register(q.id, { required: q.required ? 'Campo requerido' : false })}
          placeholder={q.placeholder}
          rows={3}
          className={`w-full px-3 py-2 border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent resize-y ${errorMsg ? 'border-red-400' : 'border-app-border'}`}
        />
      );
    }

    return (
      <input
        type="text"
        {...register(q.id, { required: q.required ? 'Campo requerido' : false })}
        placeholder={q.placeholder}
        className={`w-full px-3 py-2 border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent ${errorMsg ? 'border-red-400' : 'border-app-border'}`}
      />
    );
  }

  function handleSuggestObjectives(q: Question) {
    const suggested = getSuggestedObjectives(isoStandard!);
    setValue(q.id, suggested.join(', '), { shouldDirty: true });
    setSuggested(true);
  }

  if (isLoading || !questionnaire) {
    return <div className="text-app-muted text-sm py-12 text-center">Cargando pre-diagnóstico...</div>;
  }

  if (loadError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Error al cargar el cuestionario: {getErrorMessage(loadError)}
      </div>
    );
  }

  const groups = questionnaire.groups;
  const isReview = subStep === groups.length;
  const totalSteps = groups.length + 1; // groups + review
  const progress = (subStep / groups.length) * 100;

  // Review sub-step ----------------------------------------------------------------
  if (isReview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <span className="text-app-muted text-sm">Paso {subStep + 1} de {totalSteps}</span>
          <span className="text-app-muted text-sm">Revisión</span>
        </div>
        <Progress value={progress} />

        <Card>
          <CardContent className="space-y-5">
            <h3 className="text-lg font-semibold text-app-text">Revisar respuestas</h3>
            {groups.map((group) => (
              <div key={group.id} className="space-y-3">
                <h4 className="font-semibold text-app-text">{group.title}</h4>
                <div className="space-y-2">
                  {group.questions.map((q) => {
                    const raw = String((values as Record<string, string>)[q.id] ?? '');
                    return (
                      <div key={q.id} className="text-sm">
                        <div className="text-app-muted">{q.label}</div>
                        {q.type === 'chips' ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {splitChips(raw).length === 0 ? (
                              <span className="text-app-muted italic">—</span>
                            ) : (
                              splitChips(raw).map((chip) => (
                                <Badge key={chip} variant="default">{chip}</Badge>
                              ))
                            )}
                          </div>
                        ) : q.type === 'cards' ? (
                          <div className="mt-1 font-medium text-app-text">
                            {raw || <span className="text-app-muted italic">—</span>}
                          </div>
                        ) : (
                          <div className="mt-1 text-app-text">
                            {raw || <span className="text-app-muted italic">—</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {errors.root && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{errors.root.message}</span>
          </div>
        )}

        <div className="pt-4 border-t border-app-border flex justify-between">
          <button
            type="button"
            onClick={() => setSubStep((s) => s - 1)}
            className="px-4 py-2 border border-app-border rounded-lg text-sm font-medium text-app-muted hover:text-app-text hover:bg-app-bg transition-colors"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar pre-diagnóstico
          </button>
        </div>
      </div>
    );
  }

  // Group sub-step -----------------------------------------------------------------
  const currentGroup = groups[subStep];
  const nextDisabled = groupHasUnfilledRequired(currentGroup);
  const isLastGroup = subStep === groups.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <span className="text-app-muted text-sm">Paso {subStep + 1} de {totalSteps}</span>
        <span className="text-app-muted text-sm">Pre-diagnóstico</span>
      </div>
      <Progress value={progress} />

      <div key={currentGroup.id} className="animate-slide-in-right">
        <h3 className="text-lg font-semibold text-app-text mb-3">{currentGroup.title}</h3>
        <div className="space-y-4">
          {currentGroup.questions.map((q) => (
            <div key={q.id}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-app-text">
                  {q.label}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {q.type === 'chips' && (
                  <button
                    type="button"
                    onClick={() => handleSuggestObjectives(q)}
                    className="inline-flex items-center gap-1 text-sm text-app-accent border border-app-accent rounded-lg px-2 py-1 hover:bg-app-accent/10 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Sugerir con IA
                  </button>
                )}
              </div>
              {renderQuestion(q)}
              {errors[q.id] && (
                <p className="text-red-500 text-xs mt-1">{errors[q.id]?.message as string}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {errors.root && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errors.root.message}</span>
        </div>
      )}

      <div className="pt-4 border-t border-app-border flex justify-between">
        {subStep > 0 ? (
          <button
            type="button"
            onClick={() => setSubStep((s) => s - 1)}
            className="px-4 py-2 border border-app-border rounded-lg text-sm font-medium text-app-muted hover:text-app-text hover:bg-app-bg transition-colors"
          >
            Anterior
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setSubStep((s) => s + 1)}
          disabled={nextDisabled}
          className="px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {isLastGroup ? 'Revisar' : 'Siguiente'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}