import { apiRequest } from '../lib/api-client';

export interface Findings {
  process_id: string;
  answers: Record<string, string>;
  free_text: string;
  updated_at: string;
}

export interface UpsertFindingsInput {
  answers: Record<string, string>;
  free_text: string;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimated_effort: string;
  owner_role: string;
  sort_order: number;
}

export interface Plan {
  process_id: string;
  summary_md: string;
  generated_at: string;
  tasks: PlanTask[];
}

export interface ApiCallOptions {
  token: string | null;
  signal?: AbortSignal;
}

export async function getFindings(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<Findings> {
  return apiRequest<Findings>(`/processes/${processId}/findings`, { token, signal });
}

export async function saveFindings(
  processId: string,
  input: UpsertFindingsInput,
  { token, signal }: ApiCallOptions,
): Promise<Findings> {
  return apiRequest<Findings>(`/processes/${processId}/findings`, {
    method: 'PUT',
    body: input,
    token,
    signal,
  });
}

export async function generatePlan(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<Plan> {
  return apiRequest<Plan>(`/processes/${processId}/generate-plan`, {
    method: 'POST',
    token,
    signal,
  });
}
