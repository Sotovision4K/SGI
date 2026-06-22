import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';
import { POSITION_STACK_CLASSES, STACK_BASE } from './constants';
import { ToastItem } from './ToastItem';
import type { Toast } from './types';

interface ToastPortalProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

/**
 * Groups toasts by position preserving insertion order,
 * renders each group in a stacked portal container.
 *
 * The portal host (`#toast-root`) is lazily created during the initial
 * render via `useState` lazy initializer so that toasts queued before
 * the first mount are visible immediately.
 */
export function ToastPortal({ toasts, onDismiss }: ToastPortalProps) {
  // Lazy-get or create the portal host. Using useState (not useRef) so
  // the host is available during render without violating the React
  // Compiler rule against reading ref.current during render.
  const [host] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('toast-root') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-root';
      document.body.appendChild(el);
    }
    return el;
  });

  // Clean up the host on unmount (only if no children remain).
  useEffect(() => {
    return () => {
      const el = document.getElementById('toast-root');
      if (el && el.childElementCount === 0) {
        el.remove();
      }
    };
  }, []);

  if (!host) {
    return null;
  }

  // Group toasts by position, preserving insertion order
  const grouped = new Map<string, Toast[]>();
  for (const toast of toasts) {
    const list = grouped.get(toast.position);
    if (list) {
      list.push(toast);
    } else {
      grouped.set(toast.position, [toast]);
    }
  }

  return createPortal(
    <>
      {Array.from(grouped.entries()).map(([position, groupToasts]) => (
        <div
          key={position}
          className={`${STACK_BASE} ${POSITION_STACK_CLASSES[position as keyof typeof POSITION_STACK_CLASSES]}`}
        >
          {groupToasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
          ))}
        </div>
      ))}
    </>,
    host,
  );
}
