/**
 * Global Error Handler Hook
 * Catches unhandled errors and promise rejections at the window level
 *
 * Features:
 * - Catches unhandled exceptions
 * - Catches unhandled promise rejections
 * - Reports errors to centralized error system
 * - Shows user-friendly toasts for common errors
 * - Prevents error flood with debouncing
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  reportError,
  createErrorInfo,
  ErrorCode,
  createErrorReporter,
} from '~/lib/utils/error-handler';
import {
  showSmartError,
  showNetworkError,
  showAuthError,
} from '~/lib/errors/toast-error';

interface UseGlobalErrorHandlerOptions {
  /** Show toast notifications for errors (default: true) */
  showToasts?: boolean;
  /** Log errors to console (default: true in development) */
  logToConsole?: boolean;
  /** Callback when error is caught */
  onError?: (error: Error, context: string) => void;
  /** Errors to ignore (by message substring) */
  ignorePatterns?: string[];
}

/**
 * Hook to handle global errors at the application level
 */
export function useGlobalErrorHandler(options: UseGlobalErrorHandlerOptions = {}) {
  const {
    showToasts = true,
    logToConsole = process.env.NODE_ENV !== 'production',
    onError,
    ignorePatterns = [
      // Common ignorable errors
      'ResizeObserver loop',
      'Script error',
      'Non-Error exception captured',
      'Network request failed', // Will be handled by specific network error handlers
    ],
  } = options;

  // Debounced reporter to prevent error flood
  const debouncedReporter = useRef(
    createErrorReporter((error, context) => {
      if (logToConsole) {
        console.error('[GlobalError]', context, error);
      }
      onError?.(error, context?.type as string || 'unknown');
    }, 3000)
  );

  // Check if error should be ignored
  const shouldIgnore = useCallback(
    (message: string): boolean => {
      return ignorePatterns.some((pattern) =>
        message.toLowerCase().includes(pattern.toLowerCase())
      );
    },
    [ignorePatterns]
  );

  // Handle window error event
  const handleError = useCallback(
    (event: ErrorEvent) => {
      const { message, error, filename, lineno, colno } = event;

      // Ignore certain errors
      if (shouldIgnore(message)) {
        return;
      }

      // Create error info
      const errorInfo = createErrorInfo(error || new Error(message), {
        details: {
          filename,
          lineno,
          colno,
          type: 'uncaught_exception',
        },
      });

      // Report to centralized system
      reportError(error || new Error(message), {
        details: { filename, lineno, colno },
      });

      // Show toast if enabled
      if (showToasts) {
        // Handle specific error types differently
        if (errorInfo.category === 'network') {
          showNetworkError(message);
        } else if (errorInfo.category === 'auth') {
          showAuthError(errorInfo.code === ErrorCode.AUTH_TOKEN_EXPIRED);
        } else if (errorInfo.category !== 'unknown') {
          // Only show toast for categorized errors
          showSmartError(error || new Error(message), { dedupe: true });
        }
      }

      // Report via debounced reporter
      debouncedReporter.current(error || new Error(message), {
        type: 'uncaught_exception',
        filename,
        lineno,
        colno,
      });
    },
    [shouldIgnore, showToasts]
  );

  // Handle unhandled promise rejection
  const handleRejection = useCallback(
    (event: PromiseRejectionEvent) => {
      const error =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason));

      // Ignore certain errors
      if (shouldIgnore(error.message)) {
        return;
      }

      // Create error info
      const errorInfo = createErrorInfo(error, {
        details: { type: 'unhandled_rejection' },
      });

      // Report to centralized system
      reportError(error, {
        details: { type: 'unhandled_rejection' },
      });

      // Show toast if enabled (less aggressive for promise rejections)
      if (showToasts && errorInfo.category !== 'unknown') {
        if (errorInfo.category === 'network') {
          showNetworkError(error.message);
        } else if (errorInfo.category === 'auth') {
          showAuthError(errorInfo.code === ErrorCode.AUTH_TOKEN_EXPIRED);
        }
        // Don't show generic toast for unhandled rejections - too noisy
      }

      // Report via debounced reporter
      debouncedReporter.current(error, { type: 'unhandled_rejection' });
    },
    [shouldIgnore, showToasts]
  );

  // Set up global listeners
  useEffect(() => {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    // Listen for reconnect-all event
    const handleReconnectAll = () => {
      // This will be handled by individual connection components
      console.log('[GlobalErrorHandler] Reconnect-all event received');
    };
    window.addEventListener('recoder:reconnect-all', handleReconnectAll);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('recoder:reconnect-all', handleReconnectAll);
    };
  }, [handleError, handleRejection]);

  return {
    reportError: (error: Error, context?: Record<string, unknown>) => {
      reportError(error, { details: context });
      debouncedReporter.current(error, context);
    },
  };
}

/**
 * Utility to wrap async functions with error handling
 */
export function createSafeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    onError?: (error: Error) => void;
    showToast?: boolean;
  }
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options?.onError?.(err);

      if (options?.showToast !== false) {
        showSmartError(err, { dedupe: true });
      }

      throw error;
    }
  }) as T;
}

export default useGlobalErrorHandler;
