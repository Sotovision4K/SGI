import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProcess, type CreateProcessInput } from '../api/process';
import { useApiAuthBridge } from '../lib/use-api-auth';

export function useStartProcess() {
  const { getToken } = useApiAuthBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProcessInput) => createProcess(input, { token: getToken() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}
