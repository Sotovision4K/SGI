import { useState, useEffect } from 'react';
import { toastStore, toast } from './toast';
import { ToastPortal } from './ToastPortal';

/**
 * Renders the toast portal and subscribes to the module-level toast store.
 *
 * Render this once, near the root of your app:
 * ```tsx
 * <ToastContainer />
 * ```
 *
 * No provider wrapping needed — toasts are triggered imperatively via
 * the `toast` API imported anywhere.
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState(toastStore.getSnapshot());

  useEffect(() => {
    return toastStore.subscribe(() => {
      setToasts(toastStore.getSnapshot());
    });
  }, []);

  useEffect(() => {
    return () => {
      toastStore.cleanup();
    };
  }, []);

  return <ToastPortal toasts={toasts} onDismiss={toast.dismiss} />;
}
