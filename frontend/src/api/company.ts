import { apiRequest } from '../lib/api-client';

export interface Company {
  company_id: string;
  user_id: string;
  name: string;
  business_type: string;
  is_active: boolean;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  active_process_count: number;
}

export interface CreateCompanyInput {
  name: string;
  business_type?: string;
  business_type_custom?: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
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
    body: {
      name: input.name,
      business_type: input.business_type ?? 'general',
      business_type_custom: input.business_type_custom,
      contact_name: input.contact_name,
      contact_email: input.contact_email,
      contact_phone: input.contact_phone,
    },
    token,
    signal,
  });
}
