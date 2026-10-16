import { useQuery } from '@tanstack/react-query';
import { checkDuplicate, type DuplicateCheck } from '../api/process';
import { useApiAuthBridge } from '../lib/use-api-auth';

const EMPTY: DuplicateCheck = { taken_modules: [], taken_iso_standards: [] };

export function useProcessDuplicates(companyId?: string | null) {
  const { getToken } = useApiAuthBridge();
  const query = useQuery<DuplicateCheck>({
    queryKey: ['process-duplicates', companyId],
    queryFn: ({ signal }) => checkDuplicate(companyId!, { token: getToken(), signal }),
    enabled: !!companyId,
  });
  return {
    data: query.data ?? EMPTY,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}
