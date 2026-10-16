import { useState } from 'react';
import { savePerfilamiento, type PerfilamientoModule } from '../../../api/process';
import { getProfilingQuestionnaire, type ProfilingSubmission } from '../../../api/profiling';
import { ProfilingForm } from '../../profiling/ProfilingForm';
import { useApiAuthBridge } from '../../../lib/use-api-auth';
import { toast } from '../../../components/ui/toast';
import { getErrorMessage } from '../../../lib/error-utils';

interface StepPerfilamientoProps {
  processId: string;
  module: PerfilamientoModule;
  onDone: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  initialValues?: Record<string, string>;
}

export function StepPerfilamiento({ processId, module, onDone, initialValues }: StepPerfilamientoProps) {
  const { getToken } = useApiAuthBridge();
  const questionnaire = getProfilingQuestionnaire();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(submission: ProfilingSubmission) {
    setIsSubmitting(true);
    try {
      await savePerfilamiento(
        processId,
        { answers: submission.answers, pain_points: submission.painPoints },
        { token: getToken() },
      );
      onDone();
    } catch (err) {
      toast.danger(getErrorMessage(err), { title: 'Error al guardar perfilamiento' });
      setIsSubmitting(false);
    }
  }

  return (
    <ProfilingForm
      questionnaire={questionnaire}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      initialModule={module}
      defaultValues={initialValues}
    />
  );
}
