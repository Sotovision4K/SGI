import { useQuery } from '@tanstack/react-query';
import { listCompanies, type Company } from '../api/company';
import { useApiAuthBridge } from '../lib/use-api-auth';

export function useCompanies() {
  const { getToken } = useApiAuthBridge();
  return useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: ({ signal }) => listCompanies({ token: getToken(), signal }),
    staleTime: 60_000,
  });
}
