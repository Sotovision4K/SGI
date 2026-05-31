import { useQuery } from '@tanstack/react-query';
import { getProcess } from '../api/process';

export function useProcess(processId: string | undefined) {
  return useQuery({
    queryKey: ['process', processId],
    queryFn: () => getProcess(processId!),
    enabled: !!processId,
  });
}