# Toast Notification System — Portal Refactor Plan

**Status:** Proposed · **Date:** 2026-06-22 · **Scope:** `frontend/src/components/ui/toast*`

## Overview

Refactor the existing inline toast system into a portal-based, position-aware notification system with directional slide animations. Three types only: `danger`, `warn`, `success`. No `info`.

---

## 1. File Architecture

Replace the 3-file flat layout with a single `toast/` folder:

```
frontend/src/components/ui/toast/
├── types.ts              # All TypeScript types
├── constants.ts          # Position→class maps, type→visual maps, animation resolution, timing
├── ToastContext.ts       # createContext (bare)
├── ToastProvider.tsx     # State owner: addToast/dismiss/lifecycle, auto-dismiss timers
├── ToastPortal.tsx       # createPortal(document.body), groups toasts by position into 6 stacks
├── ToastItem.tsx         # Single toast: icon + title + message + dismiss button + animation
├── useToast.ts           # Context consumer hook
├── index.ts              # Barrel re-exports
└── toast.test.tsx        # Tests
```

### File Responsibilities

| File | Lines (est.) | Responsibility | Depends On |
|---|---|---|---|
| `types.ts` | ~45 | Type contracts only | — |
| `constants.ts` | ~60 | Static maps (position→classes, type→visual, animation↔position, timing) | `types.ts` |
| `ToastContext.ts` | ~5 | `createContext<ToastContextValue \| null>(null)` | `types.ts` |
| `ToastProvider.tsx` | ~75 | Owns `toasts[]` state; addToast/dismiss/exit lifecycle; context value | `types.ts`, `ToastContext.ts`, `ToastPortal.tsx` |
| `ToastPortal.tsx` | ~50 | Lazy-creates `#toast-root` div on `document.body`; groups by position | `types.ts`, `constants.ts`, `ToastItem.tsx` |
| `ToastItem.tsx` | ~70 | Single toast render: icon, title, message, dismiss btn, enter/exit class | `types.ts`, `constants.ts` |
| `useToast.ts` | ~8 | `useContext` + null guard | `ToastContext.ts`, `types.ts` |
| `index.ts` | ~10 | Public exports | all |

### Files to Delete
- `frontend/src/components/ui/Toast.tsx`
- `frontend/src/components/ui/ToastContext.ts`
- `frontend/src/components/ui/useToast.ts`

### Files to Modify
- `frontend/src/App.tsx` — update import `./components/ui/Toast` → `./components/ui/toast`
- `frontend/tailwind.config.js` — add custom keyframes + animations
- `frontend/src/hooks/useStartProcess.ts` — `toast.error(...)` → `toast.danger(...)`
- `frontend/src/hooks/usePlan.ts` — 2 callsites
- `frontend/src/hooks/useProcesses.ts` — 2 callsites

---

## 2. Type System

```typescript
// types.ts

/** The 6 anchor positions on the viewport. */
export type ToastPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** Three types only. `danger` is sticky (no auto-dismiss); `warn` and `success` auto-dismiss. */
export type ToastType = 'danger' | 'warn' | 'success';

/** Physical slide direction of the enter animation. Exit always reverses. `auto` resolves based on position. */
export type ToastAnimation = 'slideLeft' | 'slideRight' | 'slideDown' | 'slideUp' | 'auto';

/** Internal persistent record. `state` is lifecycle flag (idle|leaving). */
export interface Toast {
  readonly id: number;
  readonly type: ToastType;
  readonly message: string;
  readonly title?: string;
  readonly position: ToastPosition;
  readonly animation: Exclude<ToastAnimation, 'auto'>;
  readonly createdAt: number;
  state: 'idle' | 'leaving';
}

/** What callers pass to `toast.danger(msg, opts)`. All fields optional except `message`. */
export interface ToastOptions {
  readonly title?: string;
  readonly position?: ToastPosition;
  readonly animation?: ToastAnimation;
}

/** Public hook return type. `error`/`warning` are deprecated aliases forwarding to `danger`/`warn`. */
export interface ToastContextValue {
  danger:  (message: string, options?: ToastOptions) => void;
  warn:    (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  /** @deprecated use `danger` */
  error:   (message: string, options?: ToastOptions) => void;
  /** @deprecated use `warn` */
  warning: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}
```

### Design decisions

- **`Toast.state` is mutable** (not `readonly`) — provider mutates it during exit lifecycle.
- **`ToastOptions.animation` accepts `'auto'`** — resolves to concrete direction inside `addToast`, not at render time.
- **`error`/`warning` aliases** are method-name shims only; produce `'danger'`/`'warn'` toast types. No `'error'` in `ToastType`.
- **`ToastType` has no `'info'`** — confirmed zero callers in codebase.

---

## 3. Constants & Mappings

```typescript
// constants.ts

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
```

---

## 4. Animation Strategy (Pure Tailwind)

### 4.1 Keyframes — add to `tailwind.config.js`

Under `theme.extend.keyframes` and `theme.extend.animation`:

```javascript
// tailwind.config.js — theme.extend
keyframes: {
  'toast-in-left':   { '0%': { transform: 'translateX(-110%)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
  'toast-out-left':  { '0%': { transform: 'translateX(0)', opacity: '1' },     '100%': { transform: 'translateX(-110%)', opacity: '0' } },
  'toast-in-right':  { '0%': { transform: 'translateX(110%)', opacity: '0' },  '100%': { transform: 'translateX(0)', opacity: '1' } },
  'toast-out-right': { '0%': { transform: 'translateX(0)', opacity: '1' },      '100%': { transform: 'translateX(110%)', opacity: '0' } },
  'toast-in-down':   { '0%': { transform: 'translateY(-110%)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
  'toast-out-down':  { '0%': { transform: 'translateY(0)', opacity: '1' },      '100%': { transform: 'translateY(-110%)', opacity: '0' } },
  'toast-in-up':     { '0%': { transform: 'translateY(110%)', opacity: '0' },  '100%': { transform: 'translateY(0)', opacity: '1' } },
  'toast-out-up':    { '0%': { transform: 'translateY(0)', opacity: '1' },      '100%': { transform: 'translateY(110%)', opacity: '0' } },
},
animation: {
  'toast-in-left':   'toast-in-left 250ms cubic-bezier(0.22,1,0.36,1)',
  'toast-out-left':  'toast-out-left 200ms ease-in forwards',
  'toast-in-right':  'toast-in-right 250ms cubic-bezier(0.22,1,0.36,1)',
  'toast-out-right': 'toast-out-right 200ms ease-in forwards',
  'toast-in-down':   'toast-in-down 250ms cubic-bezier(0.22,1,0.36,1)',
  'toast-out-down':  'toast-out-down 200ms ease-in forwards',
  'toast-in-up':     'toast-in-up 250ms cubic-bezier(0.22,1,0.36,1)',
  'toast-out-up':    'toast-out-up 200ms ease-in forwards',
},
```

### 4.2 Position → default animation mapping

| Position | Default enter | Slide path |
|---|---|---|
| `top-left` | `slideLeft` | left off-screen → moves right |
| `top-center` | `slideDown` | above viewport → moves down |
| `top-right` | `slideRight` | right off-screen → moves left |
| `bottom-left` | `slideLeft` | left off-screen → moves right |
| `bottom-center` | `slideUp` | below viewport → moves up |
| `bottom-right` | `slideRight` | right off-screen → moves left |

**Decision: No animation library.** Pure Tailwind saves 16-35 kB vs `framer-motion`. Exit is handled via provider-owned `state='leaving'` + `setTimeout(EXIT_LIFECYCLE_MS)`.

---

## 5. Portal Architecture

**Single `#toast-root` div, lazy-created on `document.body`, with 6 absolutely-positioned flex stacks inside.**

- **Creation:** `useRef` + `useEffect(..., [])` — NEVER `useMemo` (React Compiler may discard memoized DOM nodes).
- **One host, 6 stacks:** `groupByPosition()` on each render produces up to 6 `<div>` elements (only non-empty positions render).
- **Stack direction:** For `bottom-*` positions, newest toast (pushed last) renders closest to the anchor edge. Using `flex-col` where last element = visually at bottom = correct.

### Portal lifecycle

```
Provider mount → useEffect creates <div id="toast-root"> → appendChild(document.body)
Every render → groupByPosition(toasts) → createPortal(stacks, hostRef.current)
Provider unmount → useEffect cleanup → host.remove()
```

---

## 6. Component Implementations

### 6.1 `ToastContext.ts`

```typescript
import { createContext } from 'react';
import type { ToastContextValue } from './types';
export const ToastContext = createContext<ToastContextValue | null>(null);
```

### 6.2 `ToastProvider.tsx`

```typescript
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext } from './ToastContext';
import { ToastPortal } from './ToastPortal';
import {
  EXIT_LIFECYCLE_MS, AUTO_DISMISS_MS, DEFAULT_ANIMATION, DEFAULT_POSITION,
  resolveAnimation,
} from './constants';
import type { Toast, ToastOptions, ToastType, ToastContextValue } from './types';

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timersRef.current.get(id);
    if (tm) { clearTimeout(tm); timersRef.current.delete(id); }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id && t.state === 'idle' ? { ...t, state: 'leaving' as const } : t)),
    );
    setTimeout(() => remove(id), EXIT_LIFECYCLE_MS);
  }, [remove]);

  const addToast = useCallback((type: ToastType, message: string, opts?: ToastOptions) => {
    const id = nextId++;
    const position = opts?.position ?? DEFAULT_POSITION;
    const animation = resolveAnimation(opts?.animation ?? DEFAULT_ANIMATION, position);
    const toast: Toast = {
      id, type, message, title: opts?.title,
      position, animation, createdAt: Date.now(), state: 'idle',
    };
    setToasts((prev) => [...prev, toast]);

    const ttl = AUTO_DISMISS_MS[type];
    if (ttl != null) {
      const tm = setTimeout(() => dismiss(id), ttl);
      timersRef.current.set(id, tm);
    }
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({
    danger:  (m, o) => addToast('danger',  m, o),
    warn:    (m, o) => addToast('warn',    m, o),
    success: (m, o) => addToast('success', m, o),
    error:   (m, o) => addToast('danger',  m, o),  // deprecated alias
    warning: (m, o) => addToast('warn',    m, o),  // deprecated alias
    dismiss,
  }), [addToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastPortal toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
```

### 6.3 `ToastPortal.tsx`

```typescript
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { POSITION_STACK_CLASSES, STACK_BASE } from './constants';
import type { Toast, ToastPosition } from './types';
import { ToastItem } from './ToastItem';

interface Props { toasts: Toast[]; onDismiss: (id: number) => void; }

// Assume `cn` utility exists at ../../lib/cn; create if not present
function cn(...inputs: (string | undefined | false | null)[]): string {
  return inputs.filter(Boolean).join(' ');
}

export function ToastPortal({ toasts, onDismiss }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = document.createElement('div');
    host.id = 'toast-root';
    host.dataset.testid = 'toast-root';
    document.body.appendChild(host);
    hostRef.current = host;
    return () => { host.remove(); hostRef.current = null; };
  }, []);

  if (!hostRef.current) return null;

  // Group by position; preserve insertion order within each group
  const groups = new Map<ToastPosition, Toast[]>();
  for (const t of toasts) {
    const arr = groups.get(t.position) ?? [];
    arr.push(t);
    groups.set(t.position, arr);
  }

  return createPortal(
    <>
      {([...groups.keys()] as ToastPosition[]).map((position) => (
        <div key={position} className={cn(STACK_BASE, POSITION_STACK_CLASSES[position])}>
          {groups.get(position)!.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
          ))}
        </div>
      ))}
    </>,
    hostRef.current,
  );
}
```

### 6.4 `ToastItem.tsx`

```typescript
import { ANIMATION_CLASS, DISMISS_ICON, ITEM_BASE, TYPE_VISUAL } from './constants';
import type { Toast } from './types';

interface Props { toast: Toast; onDismiss: (id: number) => void; }

function cn(...inputs: (string | undefined | false | null)[]): string {
  return inputs.filter(Boolean).join(' ');
}

export function ToastItem({ toast, onDismiss }: Props) {
  const visual = TYPE_VISUAL[toast.type];
  const Icon = visual.icon;
  const cls = ANIMATION_CLASS[toast.animation];
  const animClass = toast.state === 'leaving' ? cls.exit : cls.enter;

  return (
    <div
      role="alert"
      className={cn(ITEM_BASE, visual.container, animClass)}
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', visual.iconColor)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-medium text-sm text-text-main mb-0.5">{toast.title}</p>
        )}
        <p className="text-sm text-text-main break-words">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar notificación"
        className="text-text-muted transition-colors hover:text-text-main flex-shrink-0 self-start mt-0.5"
      >
        <DISMISS_ICON className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
```

### 6.5 `useToast.ts`

```typescript
import { useContext } from 'react';
import { ToastContext } from './ToastContext';
import type { ToastContextValue } from './types';

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

### 6.6 `index.ts` (barrel)

```typescript
export { ToastProvider } from './ToastProvider';
export { useToast } from './useToast';
export type {
  ToastType, ToastPosition, ToastAnimation,
  ToastOptions, Toast, ToastContextValue,
} from './types';
```

---

## 7. Consumer Updates

All 6 existing call sites use `toast.error(message, 'Error')` and must become `toast.danger(message, { title: 'Error' })`:

### `useStartProcess.ts`
```typescript
// Before:
toast.error(getErrorMessage(error), 'Error');
// After:
toast.danger(getErrorMessage(error), { title: 'Error' });
```

### `usePlan.ts` (2 callsites: `useSaveFindings` + `useGeneratePlan`)
```typescript
// Before:
onError: (error) => { toast.error(getErrorMessage(error), 'Error'); },
// After:
onError: (error) => { toast.danger(getErrorMessage(error), { title: 'Error' }); },
```

### `useProcesses.ts` (2 callsites: `useCreateProcess` + `useDeleteProcess`)
```typescript
// Before:
onError: (error) => { toast.error(getErrorMessage(error), 'Error'); },
// After:
onError: (error) => { toast.danger(getErrorMessage(error), { title: 'Error' }); },
```

---

## 8. Migration Plan

### Phase A — Build new system (zero blast radius)
1. Create `toast/` folder with all 8 files
2. Add Tailwind keyframes/animations to `tailwind.config.js`
3. Verify `cn` utility exists in `frontend/src/lib/cn.ts`; create if not
4. Add unit tests under `toast/toast.test.tsx`
5. Ship to `main` — new module is unused, no behavior change

### Phase B — Swap provider (backward-compatible)
6. Update `App.tsx`: `import { ToastProvider } from './components/ui/toast'`
7. Verify toasts render via portal at `bottom-right` with `slideRight` animation
8. Existing `toast.error(...)` calls still work via deprecated alias
9. Ship as single commit: `refactor(toast): move to portal+positioning system (back-compat aliases)`

### Phase C — Update call sites, drop aliases
10. Update 6 callsites: `toast.error(m, t)` → `toast.danger(m, { title: t })`
11. Grep to confirm zero `toast.error(`, `toast.warning(`, `toast.info(` remain
12. Remove `error`/`warning` from `ToastContextValue` and provider
13. Ship: `refactor(toast): drop deprecated aliases`

### Phase D — Cleanup
14. Delete old files: `Toast.tsx`, `ToastContext.ts`, `useToast.ts`

---

## 9. Key Invariant

**`EXIT_LIFECYCLE_MS` (200) must equal the longest `toast-out-*` CSS animation duration.** Pin with comments in `constants.ts` and `tailwind.config.js`. Test asserts via fake timers that the element is removed exactly after `EXIT_LIFECYCLE_MS`.

---

## 10. Test Coverage

`toast.test.tsx` should cover:

- `danger` toast renders with `role="alert"` and persists (no auto-dismiss — advance timers past 6000ms, assert element still present)
- `success` toast auto-removes after `4000ms + EXIT_LIFECYCLE_MS`
- Manual dismiss: clicking close button clears auto-dismiss timer
- Portal host exists at `document.body` with `id="toast-root"`
- Grouping: 6 toasts in 6 positions → each in its own stack with correct `POSITION_STACK_CLASSES`
- Animation: `bottom-right` toast mounts with `animate-toast-in-right`; dismiss flips to `animate-toast-out-right`
- Use `vi.useFakeTimers()` and `@testing-library/react` `screen` queries (toast lives outside render container due to portal)

---

## 11. Design Decisions (Trade-offs)

| Decision | Choice | Rationale |
|---|---|---|
| **Animation library** | Pure Tailwind | Zero bundle cost; `framer-motion` rejected (16–35 kB vs 0). For 6 visual states, manual exit is ~10 lines. |
| **Portal host creation** | `useRef` + `useEffect` | React Compiler may discard `useMemo` DOM nodes. `useRef` is stable across re-renders. |
| **Portal count** | Single `#toast-root` with 6 stacks | One DOM insertion; 6 portals would multiply bookkeeping with zero isolation benefit. |
| **Stack layout** | Per-position flex stacks | Callers can target different positions simultaneously; simpler than unified layout with flow logic. |
| **Lifecycle ownership** | Provider owns `toast.state` | Prevents double-timer race between auto-dismiss and manual click. Single `setTimeout` chain controlled by provider. |
| **Visual style** | White cards + colored borders | Uses existing design tokens; accessible contrast (`text-main` on white passes WCAG AA). No new surface colors needed. |
| **ID generation** | Module-scoped integer | Deterministic in tests; `crypto.randomUUID()` adds zero value. |
| **Default position** | `bottom-right` | Modern UX convention; newest toast appears closest to the anchor edge. |

### Explicitly excluded
- Toast queue cap (max 5, drop oldest) — follow-up ticket
- Toast action buttons (e.g., "Undo") — future feature
- `info` type — confirmed zero callers
- `z-index` scale beyond `z-50` — existing modals/headers also use `z-50`, no conflict until Radix Dialog introduces body-portaled overlays
