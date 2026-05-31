import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProcesses, createProcess, deleteProcess, type CreateProcessInput } from '../api/process';

export function useProcesses() {
  return useQuery({
    queryKey: ['processes'],
    queryFn: getProcesses,
  });
}

export function useCreateProcess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProcessInput) => createProcess(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}

export function useDeleteProcess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (processId: string) => deleteProcess(processId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
    },
  });
}