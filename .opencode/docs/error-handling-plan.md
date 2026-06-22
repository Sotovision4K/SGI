# Error Handling Plan — SGI Pro

## Part 1: Cognito "Unauthorized Attribute" Fix

### Root Cause

Two bugs converged to produce `"A client attempted to write unauthorized attribute"` during sign-up:

| # | Bug | Detail |
|---|-----|--------|
| 1 | **Missing `write_attributes`** | The Cognito app client only allowed writing `email`, `phone_number`, `name` — but the frontend also sends `custom:gov_id` and `custom:role`. Cognito rejected the unwritable attributes. |
| 2 | **Name mismatch `custom:govId` vs `custom:gov_id`** | Terraform schema defined `custom:gov_id` (snake_case), but frontend and backend both used `custom:govId` (camelCase). Cognito treats these as different attributes. |

### Changes Applied

| File | Change |
|------|--------|
| `infra/modules/cognito/main.tf:100-101` | Added `custom:role`, `custom:gov_id` to both `read_attributes` and `write_attributes` |
| `frontend/src/lib/auth.ts:46,59` | `custom:govId` → `custom:gov_id` in signUp() parameter type and UserAttributes |
| `frontend/src/pages/register/SignUpPage.tsx:86` | `'custom:govId'` → `'custom:gov_id'` in signUp() call |
| `backend/src/trigger/post_signup_trigger.py:33` | `"custom:govId"` → `"custom:gov_id"` in attribute read |
| `backend/tests/unit/test_post_signup_trigger.py:21` | Updated test fixture |
| `.opencode/docs/authentication.cognito.md:17` | Doc updated |

**After merging: run `terraform apply`** to apply the `write_attributes` change to the existing Cognito User Pool Client.

---

## Part 2: Global Error Handling Architecture

### Current State (gaps)

| Gap | Impact |
|-----|--------|
| No `ErrorBoundary` | Unhandled render errors → white screen |
| No network error detection | `fetch()` failures bubble as unhandled rejections |
| No toast system | Mutation failures give zero user feedback |
| No query error states | `ProcessListPage`, `ProcessDetailPage` only handle loading — errors crash to boundary |
| No error logging | Zero telemetry for debugging production issues |
| No "contact admin" fallback | Users left with raw error messages or nothing |

### Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    <ErrorBoundary>                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  <ToastProvider>                      │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              Application Pages                  │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │  │  │
│  │  │  │ Try/Catch│ │ useQuery │ │ useMutation    │  │  │  │
│  │  │  │ + setErr │ │ isError  │ │ onError: toast │  │  │  │
│  │  │  └──────────┘ └──────────┘ └────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │           ▲ all errors bubble up if unhandled          │  │
│  └───────────┼───────────────────────────────────────────┘  │
│              │                                               │
│     <ErrorFallback>  ← "Contacta al administrador"          │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Layer 0: Global Error Boundary (Priority: HIGH)

#### 0.1 — Install dependency

```bash
cd frontend && pnpm add react-error-boundary
```

#### 0.2 — Create `frontend/src/components/ErrorFallback.tsx`

```tsx
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  // Log for debugging — never show raw error to user
  console.error('[ErrorFallback]', new Date().toISOString(), error.message);

  return (
    <div className="min-h-screen bg-bg-soft flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>

        <h1 className="text-xl font-semibold text-text-main mb-3">
          Error inesperado
        </h1>

        <p className="text-text-muted mb-2">
          Ha ocurrido un error inesperado en la aplicaci&oacute;n.
        </p>

        <p className="text-text-muted text-sm mb-6">
          Intenta recargar la p&aacute;gina. Si el problema persiste,
          contacta al administrador en{' '}
          <a href="mailto:soporte@sgipro.com" className="text-accent underline">
            soporte@sgipro.com
          </a>
          .
        </p>

        <Button onClick={resetErrorBoundary} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Recargar p&aacute;gina
        </Button>
      </div>
    </div>
  );
}
```

#### 0.3 — Edit `frontend/src/App.tsx`

Wrap the `<Suspense>` tree with `<ErrorBoundary>`:

```tsx
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './components/ErrorFallback';

// Inside App():
<QueryClientProvider client={queryClient}>
  <CognitoAuthProvider>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* existing routes unchanged */}
        </Routes>
      </Suspense>
    </ErrorBoundary>
  </CognitoAuthProvider>
</QueryClientProvider>
```

---

### Layer 1: API Error Normalizer (Priority: HIGH)

#### 1.1 — Create `frontend/src/lib/error-utils.ts`

```typescript
export const CONTACT_ADMIN = 'soporte@sgipro.com';
export const GENERIC_ERROR = 'Error inesperado. Contacta al administrador.';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Datos inv&aacute;lidos enviados al servidor.',
  403: 'No tienes permiso para realizar esta acci&oacute;n.',
  404: 'El recurso solicitado no fue encontrado.',
  422: 'Los datos enviados no son v&aacute;lidos.',
  429: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
  500: 'Error interno del servidor. Contacta al administrador.',
  502: 'El servidor no est&aacute; disponible. Intenta de nuevo m&aacute;s tarde.',
  503: 'Servicio no disponible. Intenta de nuevo m&aacute;s tarde.',
};

export function getStatusMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? `Error inesperado (${status}). Contacta al administrador.`;
}

export function getErrorMessage(error: unknown): string {
  // ApiError from api-client
  if (error && typeof error === 'object' && 'status' in error) {
    const apiErr = error as { status: number; detail?: string; message?: string };
    if (apiErr.detail) return apiErr.detail;
    return getStatusMessage(apiErr.status);
  }

  // Network error (offline, DNS, CORS)
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'No se pudo conectar con el servidor. Verifica tu conexi&oacute;n a internet.';
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
```

#### 1.2 — Edit `frontend/src/lib/api-client.ts`

Enhance the `parseError` and `apiRequest` functions:

```typescript
// Add to parseError() — handle non-JSON responses gracefully
async function parseError(response: Response): Promise<ApiError> {
  let detail: string | undefined;
  try {
    const body = await response.json();
    detail = body.detail ?? body.message;
  } catch {
    // Response wasn't JSON — use status text
  }
  return new ApiError(
    response.status,
    detail ?? getStatusMessage(response.status),
    detail
  );
}

// Add network error catch to apiRequest():
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // ... existing setup ...

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ApiError(0, 'No se pudo conectar con el servidor. Verifica tu conexi&oacute;n a internet.');
    }
    throw error;
  }

  // ... rest unchanged ...
}
```

---

### Layer 2: Toast Notification System (Priority: HIGH)

#### 2.1 — Create `frontend/src/components/ui/Toast.tsx`

```tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'error' | 'success' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextValue {
  error: (message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

const iconMap: Record<ToastType, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap: Record<ToastType, string> = {
  error: 'border-red-300 bg-red-50 text-red-800',
  success: 'border-green-300 bg-green-50 text-green-800',
  warning: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  info: 'border-blue-300 bg-blue-50 text-blue-800',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, title, message }]);

    // Auto-dismiss non-error toasts after 6 seconds
    if (type !== 'error') {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    error: (msg, title) => addToast('error', msg, title),
    success: (msg, title) => addToast('success', msg, title),
    warning: (msg, title) => addToast('warning', msg, title),
    info: (msg, title) => addToast('info', msg, title),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast stack — fixed top-right */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto border rounded-lg p-4 shadow-lg flex items-start gap-3 ${colorMap[toast.type]}`}
              role="alert"
            >
              <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <p className="font-medium text-sm">{toast.title}</p>
                )}
                <p className="text-sm">{toast.message}</p>
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 opacity-60 hover:opacity-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

#### 2.2 — Edit `frontend/src/App.tsx`

Add `<ToastProvider>` inside the provider tree, outside `<ErrorBoundary>`:

```tsx
<QueryClientProvider client={queryClient}>
  <CognitoAuthProvider>
    <ToastProvider>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>...</Routes>
        </Suspense>
      </ErrorBoundary>
    </ToastProvider>
  </CognitoAuthProvider>
</QueryClientProvider>
```

---

### Layer 3: Cognito Error Classifiers (Priority: MEDIUM)

#### 3.1 — Edit `frontend/src/lib/auth.ts`

Add these functions after the existing classifiers:

```typescript
export function isUnauthorizedAttributeError(error: string): boolean {
  return error.includes('write unauthorized attribute') ||
         error.includes('InvalidParameterException');
}

export function isLimitExceededError(error: string): boolean {
  return error.includes('LimitExceededException');
}

export function isCodeMismatchError(error: string): boolean {
  return error.includes('CodeMismatchException');
}

export function isNotAuthorizedError(error: string): boolean {
  return error.includes('NotAuthorizedException');
}
```

---

### Layer 4: Reusable Error State Component (Priority: MEDIUM)

#### 4.1 — Create `frontend/src/components/ui/ErrorState.tsx`

```tsx
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function ErrorState({ title, message, action }: ErrorStateProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-lg border border-red-200 p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-text-main mb-2">{title}</h2>
        <p className="text-sm text-text-muted mb-4">{message}</p>
        {action && (
          <Button variant="outline" onClick={action.onClick} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
```

---

### Layer 5: Query Error States (Priority: MEDIUM)

#### 5.1 — Edit `frontend/src/pages/process/ProcessListPage.tsx`

```tsx
// Add after existing imports:
import { ErrorState } from '../../components/ui/ErrorState';
import { getErrorMessage } from '../../lib/error-utils';

// Inside component, after isLoading check:
const { data, isLoading, isError, error, refetch } = useProcesses();

if (isLoading) return <Spinner />;

if (isError) {
  return (
    <ErrorState
      title="No se pudieron cargar los procesos"
      message={getErrorMessage(error)}
      action={{ label: 'Reintentar', onClick: () => refetch() }}
    />
  );
}
```

#### 5.2 — Edit `frontend/src/pages/process/ProcessDetailPage.tsx`

Same pattern with `useProcess(processId)`.

---

### Layer 6: Mutation Error Callbacks (Priority: LOW)

#### 6.1 — Edit all mutation hooks

Add `onError` to every `useMutation` call in:

| Hook | File |
|------|------|
| `useStartProcess` | `frontend/src/hooks/useStartProcess.ts` |
| `useProfile` | `frontend/src/hooks/useProfile.ts` |
| `useCompanies` | `frontend/src/hooks/useCompanies.ts` |
| `useQuestionnaire` | `frontend/src/hooks/useQuestionnaire.ts` |
| `usePlan` | `frontend/src/hooks/usePlan.ts` |

Pattern:

```typescript
import { useToast } from '../components/ui/Toast';
import { getErrorMessage } from '../lib/error-utils';

// Inside component:
const toast = useToast();

const mutation = useMutation({
  mutationFn: /* existing */,
  onError: (error) => {
    toast.error(getErrorMessage(error), 'Error');
  },
});
```

---

### Layer 7: Auth Error Screen (Priority: MEDIUM)

#### 7.1 — Edit `frontend/src/components/auth/ProtectedRoute.tsx`

```tsx
// Add import:
import { ErrorState } from '../ui/ErrorState';

// Add after isLoading check, before isAuthenticated check:
if (auth.error) {
  return (
    <ErrorState
      title="Error de autenticaci&oacute;n"
      message="No se pudo verificar tu sesi&oacute;n. Contacta al administrador si el problema persiste."
      action={{ label: 'Intentar de nuevo', onClick: () => auth.signinRedirect() }}
    />
  );
}
```

---

## File Manifest

| # | File | Action | Priority |
|---|------|--------|----------|
| 0 | `pnpm add react-error-boundary` | Install dependency | HIGH |
| 1 | `frontend/src/lib/error-utils.ts` | **Create** | HIGH |
| 2 | `frontend/src/components/ErrorFallback.tsx` | **Create** | HIGH |
| 3 | `frontend/src/components/ui/ErrorState.tsx` | **Create** | HIGH |
| 4 | `frontend/src/components/ui/Toast.tsx` | **Create** | HIGH |
| 5 | `frontend/src/App.tsx` | **Edit** — add ErrorBoundary + ToastProvider | HIGH |
| 6 | `frontend/src/lib/api-client.ts` | **Edit** — network error + message map | HIGH |
| 7 | `frontend/src/lib/auth.ts` | **Edit** — 4 new error classifiers | MEDIUM |
| 8 | `frontend/src/components/auth/ProtectedRoute.tsx` | **Edit** — auth error state | MEDIUM |
| 9 | `frontend/src/pages/process/ProcessListPage.tsx` | **Edit** — error state | MEDIUM |
| 10 | `frontend/src/pages/process/ProcessDetailPage.tsx` | **Edit** — error state | MEDIUM |
| 11 | `frontend/src/hooks/useStartProcess.ts` | **Edit** — onError toast | LOW |
| 12 | `frontend/src/hooks/useProfile.ts` | **Edit** — onError toast | LOW |
| 13 | `frontend/src/hooks/useCompanies.ts` | **Edit** — onError toast | LOW |
| 14 | `frontend/src/hooks/useQuestionnaire.ts` | **Edit** — onError toast | LOW |
| 15 | `frontend/src/hooks/usePlan.ts` | **Edit** — onError toast | LOW |

---

## Error Message Convention

All user-facing messages follow these rules:

1. **Always in Spanish** — the app UI is Spanish
2. **Never expose raw error details** — log to console, show user-friendly message
3. **Always include fallback path** — `"Contacta al administrador en soporte@sgipro.com"` for unrecoverable errors
4. **Always offer retry** — when the error is transient (network, timeout, 5xx)
5. **Classify before displaying** — use `getErrorMessage()` to normalize all errors into user-friendly text

---

## Verification Checklist

After implementation, verify each layer:

- [ ] Throw `new Error('test')` in a component → ErrorFallback renders with contact info
- [ ] Disconnect network → API calls show "Verifica tu conexi&oacute;n a internet"
- [ ] Trigger a mutation error → toast appears top-right
- [ ] Simulate query error → ErrorState renders with "Reintentar" button
- [ ] Trigger Cognito auth error → ProtectedRoute shows error screen
- [ ] Sign-up with custom attributes → no more "unauthorized attribute" error
