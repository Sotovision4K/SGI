import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCompanies, createCompany, type Company, type CreateCompanyInput } from '../api/company';
import { useApiAuthBridge } from '../lib/use-api-auth';
import { toast } from '../components/ui/toast';
import { getErrorMessage } from '../lib/error-utils';

export function useCompanies() {
  const { getToken } = useApiAuthBridge();
  return useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: ({ signal }) => listCompanies({ token: getToken(), signal }),
    staleTime: 60_000,
  });
}

export function useCreateCompany() {
  const { getToken } = useApiAuthBridge();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCompanyInput) =>
      createCompany(input, { token: getToken() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success('Empresa registrada exitosamente');
    },
    onError: (error) => {
      toast.danger(getErrorMessage(error), { title: 'Error al registrar empresa' });
    },
  });
}
