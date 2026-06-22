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

/** Imperative toast API surface. `error`/`warning` are deprecated aliases forwarding to `danger`/`warn`. */
export interface ToastAPI {
  danger:  (message: string, options?: ToastOptions) => void;
  warn:    (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  /** @deprecated use `danger` */
  error:   (message: string, options?: ToastOptions) => void;
  /** @deprecated use `warn` */
  warning: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}
