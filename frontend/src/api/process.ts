import { apiRequest } from '../lib/api-client';

export interface Process {
  id: string;
  consultant_id: string;
  company_id: string;
  company_name: string | null;
  iso_standard: 'iso9001' | 'iso14001' | 'iso45001';
  status: 'in_diagnosis' | 'plan_ready' | 'in_progress' | 'completed';
  pre_diagnosis?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface CreateProcessInput {
  company_id: string;
  iso_standard: 'iso9001' | 'iso14001' | 'iso45001';
}

export interface ApiCallOptions {
  token: string | null;
  signal?: AbortSignal;
}

function isApiError(err: unknown): err is { status: number } {
  return typeof err === 'object' && err !== null && 'status' in err;
}

export async function getProcesses({ token, signal }: ApiCallOptions): Promise<Process[]> {
  const data = await apiRequest<{ items: Process[]; total: number }>('/processes', { token, signal });
  return data.items;
}

export async function getProcess(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<Process | null> {
  try {
    return await apiRequest<Process>(`/processes/${processId}`, { token, signal });
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function createProcess(
  input: CreateProcessInput,
  { token, signal }: ApiCallOptions,
): Promise<Process> {
  return apiRequest<Process>('/processes', {
    method: 'POST',
    body: input,
    token,
    signal,
  });
}

export async function deleteProcess(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<void> {
  await apiRequest<void>(`/processes/${processId}`, {
    method: 'DELETE',
    token,
    signal,
  });
}

export async function savePreDiagnosis(
  processId: string,
  answers: Record<string, string>,
  { token, signal }: ApiCallOptions,
): Promise<Process> {
  return apiRequest<Process>(`/processes/${processId}/pre-diagnosis`, {
    method: 'PUT',
    body: { answers },
    token,
    signal,
  });
}
