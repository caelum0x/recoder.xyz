import { toast, type Id, type ToastOptions } from 'react-toastify';
import { addNotification, type NotificationType } from '~/lib/stores/notifications';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Toast');

/**
 * Toast utility functions for consistent notifications across the app
 * Inspired by dyad's comprehensive toast implementation
 */

// Default durations for different toast types
const DURATIONS = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
} as const;

// Track active toasts to prevent duplicates
const activeToasts = new Map<string, Id>();
let toastCounter = 0;

export interface ToastAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface ShowToastOptions {
  duration?: number | false;
  dedupeKey?: string;
  closeButton?: boolean;
  action?: ToastAction;
  onClose?: () => void;
  /** If true, also add to notification center (default: true for errors/warnings, false for others) */
  addToNotificationCenter?: boolean;
  /** Title for the notification center entry */
  notificationTitle?: string;
}

/**
 * Create a custom toast icon component
 */
function ToastIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <div className={`text-lg ${icon} ${className || ''}`} />
  );
}

/**
 * Show a success toast
 * @param message The message to display
 * @param options Toast options
 */
export function showSuccess(message: string, options?: ShowToastOptions): Id {
  const dedupeKey = options?.dedupeKey;

  if (dedupeKey) {
    const existing = activeToasts.get(dedupeKey);
    if (existing) {
      toast.dismiss(existing);
    }
  }

  const toastId = toast.success(
    options?.action ? (
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <button
          onClick={() => {
            options.action!.onClick();
            toast.dismiss(toastId);
          }}
          className="px-2 py-1 text-xs rounded bg-green-700/50 hover:bg-green-600/50 text-green-100 transition-colors shrink-0"
        >
          {options.action.label}
        </button>
      </div>
    ) : message,
    {
      autoClose: options?.duration !== undefined ? options.duration : DURATIONS.success,
      closeButton: options?.closeButton ?? true,
      icon: <ToastIcon icon="i-ph:check-circle" className="text-green-400" />,
      onClose: () => {
        if (dedupeKey) activeToasts.delete(dedupeKey);
        options?.onClose?.();
      },
    }
  );

  if (dedupeKey) {
    activeToasts.set(dedupeKey, toastId);
  }

  // Add to notification center if requested
  if (options?.addToNotificationCenter) {
    addNotification('success', options.notificationTitle || 'Success', message, false);
  }

  return toastId;
}

/**
 * Show an error toast with copy-to-clipboard button
 * @param message The error message to display
 * @param options Toast options
 */
export function showError(message: string | Error | unknown, options?: ShowToastOptions): Id {
  // Normalize the error message
  const errorMessage = message instanceof Error
    ? message.message
    : typeof message === 'string'
      ? message
      : String(message);

  logger.error('[Toast Error]', message);

  const dedupeKey = options?.dedupeKey || `error:${errorMessage.substring(0, 50)}`;

  // Dedupe similar errors
  const existing = activeToasts.get(dedupeKey);
  if (existing) {
    toast.dismiss(existing);
  }

  let copied = false;

  const handleCopy = () => {
    navigator.clipboard.writeText(errorMessage);
    copied = true;
    // Update the toast to show copied state
    toast.update(toastId, {
      render: <ErrorToastContent message={errorMessage} copied={true} onCopy={handleCopy} onClose={() => toast.dismiss(toastId)} />,
    });

    // Revert after 2 seconds
    setTimeout(() => {
      copied = false;
      toast.update(toastId, {
        render: <ErrorToastContent message={errorMessage} copied={false} onCopy={handleCopy} onClose={() => toast.dismiss(toastId)} />,
      });
    }, 2000);
  };

  const toastId = toast.error(
    <ErrorToastContent
      message={errorMessage}
      copied={copied}
      onCopy={handleCopy}
      onClose={() => toast.dismiss(toastId)}
    />,
    {
      autoClose: options?.duration !== undefined ? options.duration : DURATIONS.error,
      closeButton: false, // We provide our own close button
      icon: false, // We provide our own icon
      onClose: () => {
        activeToasts.delete(dedupeKey);
        options?.onClose?.();
      },
    }
  );

  activeToasts.set(dedupeKey, toastId);

  // Add to notification center by default for errors (unless explicitly disabled)
  if (options?.addToNotificationCenter !== false) {
    addNotification('error', options?.notificationTitle || 'Error', errorMessage, true);
  }

  return toastId;
}

/**
 * Error toast content with copy button
 */
function ErrorToastContent({
  message,
  copied,
  onCopy,
  onClose
}: {
  message: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="i-ph:x-circle text-lg text-red-400 shrink-0" />
          <span className="font-medium text-sm">Error</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-1 text-red-300 hover:text-red-100 hover:bg-red-500/20 rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <div className="i-ph:check w-4 h-4 text-green-400" />
            ) : (
              <div className="i-ph:copy w-4 h-4" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 text-red-300 hover:text-red-100 hover:bg-red-500/20 rounded transition-colors"
            title="Close"
          >
            <div className="i-ph:x w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="text-sm text-gray-200 bg-red-900/30 p-2 rounded border border-red-500/30 break-words">
        {message}
      </div>
    </div>
  );
}

/**
 * Show a warning toast
 * @param message The warning message to display
 * @param options Toast options
 */
export function showWarning(message: string, options?: ShowToastOptions): Id {
  logger.warn('[Toast Warning]', message);

  const dedupeKey = options?.dedupeKey;

  if (dedupeKey) {
    const existing = activeToasts.get(dedupeKey);
    if (existing) {
      toast.dismiss(existing);
    }
  }

  const toastId = toast.warning(
    options?.action ? (
      <div className="flex flex-col gap-2">
        <span>{message}</span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              options.action!.onClick();
              toast.dismiss(toastId);
            }}
            className="px-2 py-1 text-xs rounded bg-yellow-600/50 hover:bg-yellow-500/50 text-yellow-100 transition-colors"
          >
            {options.action.label}
          </button>
        </div>
      </div>
    ) : message,
    {
      autoClose: options?.duration !== undefined ? options.duration : DURATIONS.warning,
      closeButton: options?.closeButton ?? true,
      icon: <ToastIcon icon="i-ph:warning" className="text-yellow-400" />,
      onClose: () => {
        if (dedupeKey) activeToasts.delete(dedupeKey);
        options?.onClose?.();
      },
    }
  );

  if (dedupeKey) {
    activeToasts.set(dedupeKey, toastId);
  }

  // Add to notification center by default for warnings (unless explicitly disabled)
  if (options?.addToNotificationCenter !== false) {
    addNotification('warning', options?.notificationTitle || 'Warning', message, true);
  }

  return toastId;
}

/**
 * Show an info toast
 * @param message The info message to display
 * @param options Toast options
 */
export function showInfo(message: string, options?: ShowToastOptions): Id {
  const dedupeKey = options?.dedupeKey;

  if (dedupeKey) {
    const existing = activeToasts.get(dedupeKey);
    if (existing) {
      toast.dismiss(existing);
    }
  }

  const toastId = toast.info(
    options?.action ? (
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <button
          onClick={() => {
            options.action!.onClick();
            toast.dismiss(toastId);
          }}
          className="px-2 py-1 text-xs rounded bg-blue-600/50 hover:bg-blue-500/50 text-blue-100 transition-colors shrink-0"
        >
          {options.action.label}
        </button>
      </div>
    ) : message,
    {
      autoClose: options?.duration !== undefined ? options.duration : DURATIONS.info,
      closeButton: options?.closeButton ?? true,
      icon: <ToastIcon icon="i-ph:info" className="text-blue-400" />,
      onClose: () => {
        if (dedupeKey) activeToasts.delete(dedupeKey);
        options?.onClose?.();
      },
    }
  );

  if (dedupeKey) {
    activeToasts.set(dedupeKey, toastId);
  }

  // Add to notification center if requested
  if (options?.addToNotificationCenter) {
    addNotification('info', options.notificationTitle || 'Info', message, false);
  }

  return toastId;
}

/**
 * Show a loading toast for async operations
 * Returns a key that can be used to update or dismiss the toast
 * @param message The loading message to display
 * @param key Optional key for the toast (for later updates)
 */
export function showLoading(message: string, key?: string): string {
  const toastKey = key || `loading-${++toastCounter}`;

  // Dismiss any existing toast with the same key
  const existingId = activeToasts.get(toastKey);
  if (existingId) {
    toast.dismiss(existingId);
  }

  const toastId = toast.loading(
    <div className="flex items-center gap-2">
      <div className="i-ph:spinner-gap animate-spin text-lg text-blue-400" />
      <span>{message}</span>
    </div>,
    {
      closeButton: false,
    }
  );

  activeToasts.set(toastKey, toastId);
  return toastKey;
}

/**
 * Update a loading toast message
 * @param key The toast key returned from showLoading
 * @param message The new message
 */
export function updateLoading(key: string, message: string): void {
  const toastId = activeToasts.get(key);
  if (toastId) {
    toast.update(toastId, {
      render: (
        <div className="flex items-center gap-2">
          <div className="i-ph:spinner-gap animate-spin text-lg text-blue-400" />
          <span>{message}</span>
        </div>
      ),
    });
  }
}

/**
 * Dismiss a loading toast and optionally show a result
 * @param key The toast key returned from showLoading
 * @param result Optional result to show (success/error message)
 */
export function dismissLoading(
  key: string,
  result?: { success: boolean; message?: string }
): void {
  const toastId = activeToasts.get(key);
  if (toastId) {
    if (result) {
      toast.update(toastId, {
        render: result.message || (result.success ? 'Done!' : 'Failed'),
        type: result.success ? 'success' : 'error',
        isLoading: false,
        autoClose: 2000,
        closeButton: true,
        icon: result.success
          ? <ToastIcon icon="i-ph:check-circle" className="text-green-400" />
          : <ToastIcon icon="i-ph:x-circle" className="text-red-400" />,
      });
    } else {
      toast.dismiss(toastId);
    }
    activeToasts.delete(key);
  }
}

/**
 * Dismiss all toasts
 */
export function dismissAll(): void {
  toast.dismiss();
  activeToasts.clear();
}

/**
 * Dismiss a specific toast by ID
 */
export function dismiss(toastId: Id): void {
  toast.dismiss(toastId);
}

/**
 * Promise-based toast that shows loading, then success/error
 * @param promise The promise to track
 * @param messages Messages for each state
 */
export async function showPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((err: unknown) => string);
  }
): Promise<T> {
  const key = showLoading(messages.loading);

  try {
    const result = await promise;
    const successMessage = typeof messages.success === 'function'
      ? messages.success(result)
      : messages.success;
    dismissLoading(key, { success: true, message: successMessage });
    return result;
  } catch (error) {
    const errorMessage = typeof messages.error === 'function'
      ? messages.error(error)
      : messages.error;
    dismissLoading(key, { success: false, message: errorMessage });
    throw error;
  }
}

// Re-export the underlying toast for advanced usage
export { toast };
