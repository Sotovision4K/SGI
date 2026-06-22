import { AlertCircle, AlertTriangle, CheckCircle, X, type LucideIcon } from 'lucide-react';
import type { ToastType, ToastPosition, ToastAnimation } from './types';

// --- Defaults ---
export const DEFAULT_POSITION: ToastPosition = 'bottom-right';
export const DEFAULT_ANIMATION: ToastAnimation = 'auto';
// INVARIANT: must equal the longest toast-out-* animation duration (Tailwind config)
export const EXIT_LIFECYCLE_MS = 200;

// --- Position → default animation ---
export const POSITION_DEFAULT_ANIMATION = {
  'top-left':      'slideLeft',
  'top-center':    'slideDown',
  'top-right':     'slideRight',
  'bottom-left':   'slideLeft',
  'bottom-center': 'slideUp',
  'bottom-right':  'slideRight',
} as const satisfies Record<ToastPosition, Exclude<ToastAnimation, 'auto'>>;

export function resolveAnimation(
  a: ToastAnimation,
  p: ToastPosition
): Exclude<ToastAnimation, 'auto'> {
  return a === 'auto' ? POSITION_DEFAULT_ANIMATION[p] : a;
}

// --- Position → outer stack classes ---
export const POSITION_STACK_CLASSES = {
  'top-left':       'top-4 left-4 items-start',
  'top-center':     'top-4 left-1/2 -translate-x-1/2 items-center',
  'top-right':      'top-4 right-4 items-end',
  'bottom-left':    'bottom-4 left-4 items-start',
  'bottom-center':  'bottom-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-right':   'bottom-4 right-4 items-end',
} as const satisfies Record<ToastPosition, string>;

export const STACK_BASE = 'pointer-events-none fixed z-50 flex flex-col gap-2 w-full max-w-sm';

// --- Type → visual classes ---
export interface ToastVisual { icon: LucideIcon; container: string; iconColor: string; }
export const TYPE_VISUAL: Record<ToastType, ToastVisual> = {
  danger:  { icon: AlertCircle,   container: 'border-red-200 bg-white',     iconColor: 'text-red-600' },
  warn:    { icon: AlertTriangle, container: 'border-amber-200 bg-white',   iconColor: 'text-amber-500' },
  success: { icon: CheckCircle,   container: 'border-emerald-200 bg-white', iconColor: 'text-success' },
};
export const DISMISS_ICON = X;

// --- Auto-dismiss timing ---
export const AUTO_DISMISS_MS: Record<ToastType, number | null> = {
  danger:  null,   // persists until manually dismissed
  warn:    6000,
  success: 4000,
};

// --- Animation class map ---
export const ANIMATION_CLASS = {
  slideLeft:  { enter: 'animate-toast-in-left',   exit: 'animate-toast-out-left'   },
  slideRight: { enter: 'animate-toast-in-right',   exit: 'animate-toast-out-right' },
  slideDown:  { enter: 'animate-toast-in-down',    exit: 'animate-toast-out-down'   },
  slideUp:    { enter: 'animate-toast-in-up',       exit: 'animate-toast-out-up'     },
} as const satisfies Record<Exclude<ToastAnimation, 'auto'>, { enter: string; exit: string }>;

export const ITEM_BASE = 'pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-md backdrop-blur';
