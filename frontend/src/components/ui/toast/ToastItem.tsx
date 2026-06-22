import { cn } from '../../../lib/cn';
import { ANIMATION_CLASS, DISMISS_ICON, ITEM_BASE, TYPE_VISUAL } from './constants';
import type { Toast } from './types';

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: number) => void;
}

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const visual = TYPE_VISUAL[toast.type];
  const anim = ANIMATION_CLASS[toast.animation];
  const animClass = toast.state === 'leaving' ? anim.exit : anim.enter;
  const Icon = visual.icon;

  return (
    <div
      role={toast.type === 'danger' ? 'alert' : 'status'}
      data-toastid={toast.id}
      className={cn(ITEM_BASE, visual.container, animClass)}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', visual.iconColor)} aria-hidden="true" />

      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-semibold text-sm text-text-main" data-title="true">
            {toast.title}
          </p>
        )}
        <p className="text-sm text-text-muted">{toast.message}</p>
      </div>

      <button
        type="button"
        aria-label="Close"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md p-1 text-text-muted hover:text-text-main hover:bg-bg-soft transition-colors"
      >
        <DISMISS_ICON className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
