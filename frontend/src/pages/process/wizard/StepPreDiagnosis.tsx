import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, AlertCircle } from 'lucide-react';
import { useQuestionnaire } from '../../../hooks/useQuestionnaire';
import { savePreDiagnosis } from '../../../api/process';
import { useApiAuthBridge } from '../../../lib/use-api-auth';
import { getErrorMessage } from '../../../lib/error-utils';
import type { Question } from '../../../api/questionnaire';

interface StepPreDiagnosisProps {
  processId: string;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function StepPreDiagnosis({ processId, onDone, onDirtyChange }: StepPreDiagnosisProps) {
  const { getToken } = useApiAuthBridge();
  const { data: questionnaire, isLoading, error: loadError } = useQuestionnaire('pre_diagnosis');
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    setError,
  } = useForm<Record<string, string>>({ defaultValues: {}, mode: 'onChange' });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  async function onSubmit(data: Record<string, string>) {
    try {
      await savePreDiagnosis(processId, data, { token: getToken() });
      onDone();
    } catch (err) {
      setError('root', { message: getErrorMessage(err) });
    }
  }

  function renderQuestion(q: Question) {
    const errorMsg = errors[q.id]?.message;
    if (q.type === 'select') {
      return (
        <select
          {...register(q.id, { required: q.required ? 'Campo requerido' : false })}
          className={`w-full px-3 py-2 border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent ${errorMsg ? 'border-red-400' : 'border-border'}`}
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
          className={`w-full px-3 py-2 border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-y ${errorMsg ? 'border-red-400' : 'border-border'}`}
        />
      );
    }
    return (
      <input
        type="text"
        {...register(q.id, { required: q.required ? 'Campo requerido' : false })}
        placeholder={q.placeholder}
        className={`w-full px-3 py-2 border rounded-lg bg-white text-text-main focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent ${errorMsg ? 'border-red-400' : 'border-border'}`}
      />
    );
  }

  if (isLoading || !questionnaire) {
    return <div className="text-text-muted text-sm py-12 text-center">Cargando pre-diagnóstico...</div>;
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
          <h3 className="text-lg font-semibold text-primary mb-3">{group.title}</h3>
          <div className="space-y-4">
            {group.questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-text-main mb-1">
                  {q.label}
                  {q.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {renderQuestion(q)}
                {errors[q.id] && (
                  <p className="text-red-500 text-xs mt-1">{errors[q.id]?.message as string}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {errors.root && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errors.root.message}</span>
        </div>
      )}

      <div className="pt-4 border-t border-border flex justify-end">
        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Continuar
        </button>
      </div>
    </div>
  );
}