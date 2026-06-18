import { useQuery } from '@tanstack/react-query';
import { getQuestionnaire, type Questionnaire } from '../api/questionnaire';
import { useApiAuthBridge } from '../lib/use-api-auth';

export function useQuestionnaire(
  isoStandard: 'iso9001' | 'iso14001' | 'iso45001' | null,
) {
  const { getToken } = useApiAuthBridge();
  return useQuery<Questionnaire>({
    queryKey: ['questionnaire', isoStandard],
    queryFn: ({ signal }) =>
      getQuestionnaire(isoStandard!, { token: getToken(), signal }),
    enabled: isoStandard !== null,
    staleTime: 5 * 60_000,
  });
}
