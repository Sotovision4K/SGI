import { getStatusMessage } from './error-utils';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const API_VERSION = '/api/v1';

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export type ApiErrorHandler = (status: number) => void;

let onUnauthorized: ApiErrorHandler | null = null;

export function setUnauthorizedHandler(handler: ApiErrorHandler | null) {
  onUnauthorized = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  token?: string | null;
}

function buildUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${API_VERSION}${cleanPath}`;
}

async function parseError(response: Response): Promise<ApiError> {
  let detail: string | undefined;
  try {
    const body = await response.json();
    detail = body.detail ?? body.message;
  } catch {
    // Response wasn't JSON — use status text
  }
  // Log raw backend detail for debugging — never expose to users
  if (detail) {
    console.error('[ApiError]', new Date().toISOString(), response.status, detail);
  }
  return new ApiError(
    response.status,
    getStatusMessage(response.status),
    detail
  );
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, token } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(0, 'No se pudo conectar con el servidor. Verifica tu conexión a internet.');
    }
    throw error;
  }

  if (response.status === 401) {
    onUnauthorized?.(401);
    throw await parseError(response);
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
