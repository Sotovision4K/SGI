import { apiRequest } from '../lib/api-client';
import type { ProfilingResult } from './profiling';

export type IsoStandard = 'iso9001' | 'iso14001' | 'iso45001';
export type PerfilamientoModule = 'optimizacion' | 'sst' | 'nts' | 'sos' | 'planificacion';

export interface Process {
  id: string;
  consultant_id: string;
  company_id: string;
  company_name: string | null;
  iso_standard: IsoStandard | null;
  status: 'in_diagnosis' | 'plan_ready' | 'in_progress' | 'completed' | 'profiling_pending';
  pre_diagnosis?: Record<string, string>;
  perfilamiento_module: PerfilamientoModule | null;
  perfilamiento_answers?: Record<string, unknown>;
  analysis_result?: Record<string, unknown>;
  needs_certification: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProcessInput {
  company_id: string;
  perfilamiento_module?: PerfilamientoModule;
  needs_certification?: boolean;
}

export interface DuplicateCheck {
  taken_modules: string[];
  taken_iso_standards: string[];
}

export const ISO_LABELS: Record<IsoStandard, string> = {
  iso9001: 'ISO 9001:2015',
  iso14001: 'ISO 14001:2015',
  iso45001: 'ISO 45001:2018',
};

export const MODULE_LABELS: Record<PerfilamientoModule, string> = {
  optimizacion: 'Optimización de Procesos',
  sst: 'Seguridad y salud en el trabajo',
  nts: 'Normas técnicas sectoriales',
  sos: 'Sostenibilidad y ambiental',
  planificacion: 'Planificación estratégica',
};

/** ISO label when the process certifies to one, else the requirement module label. */
export function processRequirementLabel(
  p: Pick<Process, 'iso_standard' | 'perfilamiento_module'>,
): string {
  if (p.iso_standard) return ISO_LABELS[p.iso_standard];
  if (p.perfilamiento_module) return MODULE_LABELS[p.perfilamiento_module];
  return '';
}

export interface ApiCallOptions {
  token: string | null;
  signal?: AbortSignal;
}

function isApiError(err: unknown): err is { status: number } {
  return typeof err === 'object' && err !== null && 'status' in err;
}

export async function getProcesses(
  { token, signal, status }: ApiCallOptions & { status?: 'active' | 'completed' },
): Promise<Process[]> {
  const params = status ? `?status=${status}` : '';
  const data = await apiRequest<{ items: Process[]; total: number }>(
    `/processes${params}`,
    { token, signal },
  );
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

export async function checkDuplicate(
  companyId: string,
  { token, signal }: ApiCallOptions,
): Promise<DuplicateCheck> {
  return apiRequest<DuplicateCheck>(`/processes/check-duplicate?company_id=${companyId}`, { token, signal });
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

export async function savePerfilamiento(
  processId: string,
  payload: { answers: Record<string, string>; pain_points: string },
  { token, signal }: ApiCallOptions,
): Promise<Process> {
  return apiRequest<Process>(`/processes/${processId}/perfilamiento`, {
    method: 'PUT',
    body: payload,
    token,
    signal,
  });
}

export async function saveAnalysis(
  processId: string,
  analysisResult: ProfilingResult,
  { token, signal }: ApiCallOptions,
): Promise<Process> {
  return apiRequest<Process>(`/processes/${processId}/analysis`, {
    method: 'PUT',
    body: { analysis_result: analysisResult },
    token,
    signal,
  });
}

export async function completeProcess(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<Process> {
  return apiRequest<Process>(`/processes/${processId}/complete`, {
    method: 'POST',
    token,
    signal,
  });
}

export async function reopenProcess(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<Process> {
  return apiRequest<Process>(`/processes/${processId}/reopen`, {
    method: 'POST',
    token,
    signal,
  });
}

export async function setNeedsCertification(
  processId: string,
  value: boolean,
  { token, signal }: ApiCallOptions,
): Promise<Process> {
  return apiRequest<Process>(`/processes/${processId}/needs-certification`, {
    method: 'PUT',
    body: { value },
    token,
    signal,
  });
}
