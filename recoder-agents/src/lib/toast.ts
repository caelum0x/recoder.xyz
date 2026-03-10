/**
 * Toast wrapper around sonner.
 *
 * Previously success/error were no-ops to "reduce UI noise", but that
 * silently swallowed all user-facing feedback — errors, confirmations,
 * everything. All toast types now pass through to sonner as intended.
 */
import { toast as sonnerToast, type ExternalToast } from 'sonner';

// Thin re-export so the rest of the codebase imports from one place.
export const toast = Object.assign(
  (message: string | React.ReactNode, data?: ExternalToast) => sonnerToast(message, data),
  {
    success: sonnerToast.success,
    error: sonnerToast.error,
    warning: sonnerToast.warning,
    info: sonnerToast.info,
    loading: sonnerToast.loading,
    promise: sonnerToast.promise,
    custom: sonnerToast.custom,
    message: sonnerToast.message,
    dismiss: sonnerToast.dismiss,
  }
);

// Re-export everything else from sonner
export { Toaster } from 'sonner';
export type { ExternalToast, ToasterProps } from 'sonner';





