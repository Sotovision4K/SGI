import { useQuery } from '@tanstack/react-query';
import { getProcess } from '../api/process';
import { useApiAuthBridge } from '../lib/use-api-auth';

export function useProcess(processId: string | undefined) {
  const { getToken } = useApiAuthBridge();
  return useQuery({
    queryKey: ['process', processId],
    queryFn: ({ signal }) => getProcess(processId!, { token: getToken(), signal }),
    enabled: !!processId,
  });
}
