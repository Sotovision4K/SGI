import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProcesses, createProcess, deleteProcess, type CreateProcessInput } from '../api/process';
import { useApiAuthBridge } from '../lib/use-api-auth';
import { toast } from '../components/ui/toast';
import { getErrorMessage } from '../lib/error-utils';

export function useProcesses() {
  const { getToken } = useApiAuthBridge();
  return useQuery({
    queryKey: ['processes'],
    queryFn: ({ signal }) => getProcesses({ token: getToken(), signal }),
  });
}

export function useCreateProcess() {
  const { getToken } = useApiAuthBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProcessInput) =>
      createProcess(input, { token: getToken() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
    onError: (error) => {
      toast.danger(getErrorMessage(error), { title: 'Error' });
    },
  });
}

export function useDeleteProcess() {
  const { getToken } = useApiAuthBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (processId: string) => deleteProcess(processId, { token: getToken() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
    onError: (error) => {
      toast.danger(getErrorMessage(error), { title: 'Error' });
    },
  });
}
