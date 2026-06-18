import { apiRequest } from '../lib/api-client';

export interface Company {
  company_id: string;
  user_id: string;
  name: string;
  business_type: string;
  is_active: boolean;
}

export interface CreateCompanyInput {
  name: string;
  business_type?: string;
}

export interface ApiCallOptions {
  token: string | null;
  signal?: AbortSignal;
}

export async function listCompanies({ token, signal }: ApiCallOptions): Promise<Company[]> {
  const data = await apiRequest<{ items: Company[]; total: number }>('/companies', { token, signal });
  return data.items;
}

export async function createCompany(
  input: CreateCompanyInput,
  { token, signal }: ApiCallOptions,
): Promise<Company> {
  return apiRequest<Company>('/companies', {
    method: 'POST',
    body: { name: input.name, business_type: input.business_type ?? 'general' },
    token,
    signal,
  });
}
