import { apiRequest, ApiError } from '../lib/api-client';
import { getStatusMessage } from '../lib/error-utils';

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
  department: string;
  status: TaskStatus;
  sort_order: number;
  source_clause: string;
  require_document: boolean;
  document_title: string | null;
}

export type TaskStatus = 'pending' | 'started' | 'completed';

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  estimated_effort?: string;
  owner_role?: string;
  department?: string;
  status?: TaskStatus;
  require_document?: boolean;
  document_title?: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
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

function isApiError(err: unknown): err is { status: number } {
  return typeof err === 'object' && err !== null && 'status' in err;
}

export async function getPlan(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<Plan | null> {
  try {
    return await apiRequest<Plan>(`/processes/${processId}/plan`, { token, signal });
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export interface GeneratePlanResponse {
  job_id: string;
  status: string;
}

export interface PlanGenerationStatus {
  process_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error: string | null;
  segments: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const PLAN_POLL_INTERVAL_MS = 2000;
const PLAN_POLL_TIMEOUT_MS = 300_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generatePlan(
  processId: string,
  { token, signal }: ApiCallOptions,
): Promise<Plan> {
  await apiRequest<GeneratePlanResponse>(`/processes/${processId}/generate-plan`, {
    method: 'POST',
    token,
    signal,
  });

  const deadline = Date.now() + PLAN_POLL_TIMEOUT_MS;
  for (;;) {
    if (signal?.aborted) throw new ApiError(0, getStatusMessage(0));
    const status = await apiRequest<PlanGenerationStatus>(
      `/processes/${processId}/plan-generation/status`,
      { token, signal },
    );

    if (status.status === 'completed') break;
    if (status.status === 'failed') {
      throw new ApiError(500, getStatusMessage(500), status.error ?? 'plan_generation_failed');
    }
    if (Date.now() > deadline) {
      throw new ApiError(504, getStatusMessage(504));
    }
    await sleep(PLAN_POLL_INTERVAL_MS);
  }

  const plan = await getPlan(processId, { token, signal });
  if (!plan) {
    throw new ApiError(404, getStatusMessage(404));
  }
  return plan;
}

export async function updateTask(
  processId: string,
  taskId: string,
  input: UpdateTaskInput,
  { token, signal }: ApiCallOptions,
): Promise<PlanTask> {
  return apiRequest<PlanTask>(`/processes/${processId}/plan/tasks/${taskId}`, {
    method: 'PUT',
    body: input,
    token,
    signal,
  });
}

export async function getTaskComments(
  processId: string,
  taskId: string,
  { token, signal }: ApiCallOptions,
): Promise<TaskComment[]> {
  return apiRequest<TaskComment[]>(
    `/processes/${processId}/plan/tasks/${taskId}/comments`,
    { token, signal },
  );
}

export async function addTaskComment(
  processId: string,
  taskId: string,
  body: string,
  { token, signal }: ApiCallOptions,
): Promise<TaskComment> {
  return apiRequest<TaskComment>(
    `/processes/${processId}/plan/tasks/${taskId}/comments`,
    { method: 'POST', body: { body }, token, signal },
  );
}
