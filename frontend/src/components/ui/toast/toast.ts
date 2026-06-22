import {
  AUTO_DISMISS_MS,
  DEFAULT_ANIMATION,
  DEFAULT_POSITION,
  EXIT_LIFECYCLE_MS,
  resolveAnimation,
} from './constants';
import type { Toast, ToastOptions, ToastType } from './types';

// ── Module-level state ───────────────────────────────────────────────────────

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l());
}

function remove(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  emit();
}

function add(type: ToastType, message: string, options?: ToastOptions) {
  const id = nextId++;
  const position = options?.position ?? DEFAULT_POSITION;
  const animation = resolveAnimation(options?.animation ?? DEFAULT_ANIMATION, position);

  const toast: Toast = {
    id,
    type,
    message,
    title: options?.title,
    position,
    animation,
    createdAt: Date.now(),
    state: 'idle',
  };

  toasts = [...toasts, toast];
  emit();

  const autoMs = AUTO_DISMISS_MS[type];
  if (autoMs !== null) {
    const timer = setTimeout(() => dismiss(id), autoMs);
    timers.set(id, timer);
  }
}

// ── Public imperative API ────────────────────────────────────────────────────

function dismiss(id: number) {
  // Clear any pending auto-dismiss timer
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }

  // Set state to 'leaving' for exit animation
  toasts = toasts.map((t) =>
    t.id === id && t.state === 'idle' ? { ...t, state: 'leaving' as const } : t,
  );
  emit();

  // Schedule removal after exit animation completes
  const exitTimer = setTimeout(() => remove(id), EXIT_LIFECYCLE_MS);
  timers.set(id, exitTimer);
}

/**
 * Imperative toast API — import and call from anywhere.
 * No hooks, no context, no provider wrapping required.
 *
 * @example
 * ```ts
 * import { toast } from '@/components/ui/toast';
 * toast.danger('Something broke', { title: 'Error' });
 * toast.success('Saved successfully');
 * ```
 */
export const toast = {
  danger: (message: string, options?: ToastOptions) => add('danger', message, options),
  warn: (message: string, options?: ToastOptions) => add('warn', message, options),
  success: (message: string, options?: ToastOptions) => add('success', message, options),
  /** @deprecated use {@link toast.danger} */
  error: (message: string, options?: ToastOptions) => add('danger', message, options),
  /** @deprecated use {@link toast.warn} */
  warning: (message: string, options?: ToastOptions) => add('warn', message, options),
  dismiss,
};

// ── Internal store (for ToastContainer subscription) ─────────────────────────

/**
 * Internal store contract for {@link ToastContainer}.
 * Uses the `useSyncExternalStore` pattern: getSnapshot + subscribe.
 */
export const toastStore = {
  getSnapshot: (): Toast[] => toasts,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Clean up all pending timers. Called on ToastContainer unmount. */
  cleanup: () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  },
};

// ── Test utilities ───────────────────────────────────────────────────────────

/** Reset all module-level state. For test isolation only. */
export function __resetToasts() {
  nextId = 1;
  toasts = [];
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  listeners.clear();
}
