export const CONTACT_ADMIN = 'soporte@sgipro.com';
export const GENERIC_ERROR = 'Error inesperado. Contacta al administrador.';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Datos inválidos enviados al servidor.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'El recurso solicitado no fue encontrado.',
  422: 'Los datos enviados no son válidos.',
  429: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
  500: 'Error interno del servidor. Contacta al administrador.',
  502: 'El servidor no está disponible. Intenta de nuevo más tarde.',
  503: 'Servicio no disponible. Intenta de nuevo más tarde.',
};

export function getStatusMessage(status: number): string {
  const message = STATUS_MESSAGES[status];
  if (message) return message;
  // Log unmapped status for monitoring — never expose to users
  console.error('[ErrorUtils] Unmapped status code:', status);
  return GENERIC_ERROR;
}

export function getErrorMessage(error: unknown): string {
  // ApiError from api-client — always use status-based message, never raw detail
  if (error && typeof error === 'object' && 'status' in error) {
    const apiErr = error as { status: number; detail?: string; message?: string };
    // Log detail for debugging but never expose to users
    if (apiErr.detail) {
      console.error('[ErrorUtils] ApiError detail:', apiErr.detail);
    }
    return getStatusMessage(apiErr.status);
  }

  // Network error (offline, DNS, CORS)
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
  }

  // Never expose raw error.message to users
  if (error instanceof Error) {
    console.error('[ErrorUtils]', new Date().toISOString(), error.message);
    return GENERIC_ERROR;
  }

  return GENERIC_ERROR;
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'Failed to fetch';
}

export function isApiError(error: unknown): error is { status: number; detail?: string } {
  return typeof error === 'object' && error !== null && 'status' in error;
}
