import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProcesses, createProcess, deleteProcess, type CreateProcessInput } from '../api/process';
import { useApiAuthBridge } from '../lib/use-api-auth';

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
  });
}
