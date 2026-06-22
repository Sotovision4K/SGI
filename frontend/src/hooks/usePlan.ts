import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFindings, saveFindings, generatePlan, type Findings, type Plan } from '../api/plan';
import { useApiAuthBridge } from '../lib/use-api-auth';
import { toast } from '../components/ui/toast';
import { getErrorMessage } from '../lib/error-utils';

export function useFindings(processId: string | null) {
  const { getToken } = useApiAuthBridge();
  return useQuery<Findings>({
    queryKey: ['findings', processId],
    queryFn: ({ signal }) => getFindings(processId!, { token: getToken(), signal }),
    enabled: !!processId,
  });
}

export function useSaveFindings(processId: string) {
  const { getToken } = useApiAuthBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { answers: Record<string, string>; free_text: string }) =>
      saveFindings(processId, input, { token: getToken() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings', processId] });
    },
    onError: (error) => {
      toast.danger(getErrorMessage(error), { title: 'Error' });
    },
  });
}

export function useGeneratePlan(processId: string) {
  const { getToken } = useApiAuthBridge();
  const queryClient = useQueryClient();
  return useMutation<Plan, Error, void>({
    mutationFn: () => generatePlan(processId, { token: getToken() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', processId] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
    onError: (error) => {
      toast.danger(getErrorMessage(error), { title: 'Error' });
    },
  });
}

export function usePlan(processId: string | null) {
  const { getToken } = useApiAuthBridge();
  return useQuery<Plan>({
    queryKey: ['plan', processId],
    queryFn: ({ signal }) => getPlan(processId!, { token: getToken(), signal }),
    enabled: !!processId,
    retry: (failureCount, error) => {
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
