import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useQuestionnaire } from '../../../hooks/useQuestionnaire';
import { saveFindings, generatePlan } from '../../../api/plan';
import { useApiAuthBridge } from '../../../lib/use-api-auth';
import { getErrorMessage } from '../../../lib/error-utils';
import type { Plan } from '../../../api/plan';
import type { Question } from '../../../api/questionnaire';

interface StepFindingsProps {
  processId: string;
  isoStandard: 'iso9001' | 'iso14001' | 'iso45001';
  onPlanReady: (plan: Plan) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function StepFindings({ processId, isoStandard, onPlanReady, onDirtyChange }: StepFindingsProps) {
  const { getToken } = useApiAuthBridge();
  const { data: questionnaire, isLoading, error: loadError } = useQuestionnaire(isoStandard);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isDirty, isSubmitting },
  } = useForm<Record<string, string>>({ defaultValues: {}, mode: 'onChange' });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  async function onSubmit(data: Record<string, string>) {
    setError(null);
    const token = getToken();
    try {
      await saveFindings(processId, { answers: data, free_text: '' }, { token });
    } catch (err) {
      setError(getErrorMessage(err));
      return;
    }

    setGenerating(true);
    try {
      const planResult = await generatePlan(processId, { token });
      onPlanReady(planResult);
    } catch (err) {
      setError(getErrorMessage(err));
      setGenerating(false);
    }
  }

  function renderQuestion(q: Question) {
    if (q.type === 'select') {
      return (
        <select
          {...register(q.id, { required: q.required ? 'Campo requerido' : false })}
          className="w-full px-3 py-2 border border-app-border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent"
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
          className="w-full px-3 py-2 border border-app-border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent resize-y"
        />
      );
    }
    return (
      <input
        type="text"
        {...register(q.id, { required: q.required ? 'Campo requerido' : false })}
        placeholder={q.placeholder}
        className="w-full px-3 py-2 border border-app-border rounded-lg bg-white text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:border-app-accent"
      />
    );
  }

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="w-12 h-12 text-app-accent animate-spin mb-4" />
        <h3 className="text-lg font-semibold text-app-text mb-2">Generando plan de acción</h3>
        <p className="text-app-muted text-sm max-w-md">
          Analizando el diagnóstico y generando un plan personalizado. Esto puede tardar entre 10 y 30 segundos.
        </p>
      </div>
    );
  }

  if (isLoading || !questionnaire) {
    return <div className="text-app-muted text-sm py-12 text-center">Cargando diagnóstico...</div>;
  }

  if (loadError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Error al cargar el cuestionario: {getErrorMessage(loadError)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {questionnaire.groups.map((group) => (
        <div key={group.id}>
          <div className="flex items-baseline gap-2 mb-3">
            <h3 className="text-lg font-semibold text-app-text">{group.title}</h3>
            <span className="text-xs text-app-muted">{group.clauses.join(', ')}</span>
          </div>
          <div className="space-y-4">
            {group.questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-app-text mb-1">
                  {q.label}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {renderQuestion(q)}
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="pt-4 border-t border-app-border flex justify-end">
        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className="px-4 py-2 bg-app-primary text-white rounded-lg text-sm font-medium hover:bg-app-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Generar Plan
        </button>
      </div>
    </div>
  );
}