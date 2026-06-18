import { apiRequest } from '../lib/api-client';

export interface Process {
  id: string;
  companyId: string;
  companyName: string;
  isoStandard: string;
  status: 'draft' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateProcessInput {
  companyId: string;
  companyName: string;
  isoStandard: string;
}

export interface ApiCallOptions {
  token: string | null;
  signal?: AbortSignal;
}

function isApiError(err: unknown): err is { status: number } {
  return typeof err === 'object' && err !== null && 'status' in err;
}

export async function getProcesses({ token, signal }: ApiCallOptions): Promise<Process[]> {
  return apiRequest<Process[]>('/processes', { token, signal });
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
