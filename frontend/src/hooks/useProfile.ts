import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api-client';
import { useApiAuthBridge } from '../lib/use-api-auth';

export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

export function useProfile() {
  const { getToken } = useApiAuthBridge();
  return useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) =>
      apiRequest<UserProfile>('/users/me', {
        signal,
        token: getToken(),
      }),
    staleTime: 5 * 60 * 1000,
  });
}
