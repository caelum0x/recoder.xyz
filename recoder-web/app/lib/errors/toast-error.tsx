import { toast, type Id } from 'react-toastify';
import { parseError, formatErrorMessage, type ParsedError, type ErrorAction } from './error-handler';
import {
  type ErrorInfo,
  type RecoveryAction,
  errorEvents,
  getUserFriendlyMessage,
  type ApiError,
  ApiErrorException,
  ErrorCode,
  getErrorCategory,
  getRecoverySuggestions,
} from '~/lib/utils/error-handler';
import { useEffect, useState, useCallback } from 'react';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('ToastError');

// Track active error toasts to prevent duplicates
const activeErrorToasts = new Map<string, Id>();

/**
 * Smart toast error that shows actionable solutions
 */
export function showSmartError(error: Error | string, options?: {
  onAction?: (action: ErrorAction) => void;
  autoClose?: number | false;
  dedupe?: boolean;
}) {
  const parsedError = parseError(error);
  const { solution } = parsedError;

  // Dedupe similar errors
  if (options?.dedupe !== false) {
    const errorKey = `${parsedError.type}:${parsedError.message.substring(0, 50)}`;
    const existingToast = activeErrorToasts.get(errorKey);
    if (existingToast) {
      // Update existing toast instead of showing new one
      toast.update(existingToast, {
        render: solution ? (
          <ErrorToastContent error={parsedError} onAction={options?.onAction} />
        ) : parsedError.message,
      });
      return parsedError;
    }
  }

  if (!solution) {
    // Fallback to regular error toast
    const toastId = toast.error(parsedError.message, {
      autoClose: options?.autoClose !== undefined ? options.autoClose : 5000,
    });
    if (options?.dedupe !== false) {
      activeErrorToasts.set(`${parsedError.type}:${parsedError.message.substring(0, 50)}`, toastId);
    }
    return parsedError;
  }

  // Show enhanced error with actions
  const toastId = toast.error(
    <ErrorToastContent
      error={parsedError}
      onAction={options?.onAction}
    />,
    {
      autoClose: options?.autoClose !== undefined ? options.autoClose : false, // Don't auto-close errors with actions
      closeButton: true,
      onClose: () => {
        activeErrorToasts.delete(`${parsedError.type}:${parsedError.message.substring(0, 50)}`);
      },
    }
  );

  if (options?.dedupe !== false) {
    activeErrorToasts.set(`${parsedError.type}:${parsedError.message.substring(0, 50)}`, toastId);
  }

  return parsedError;
}

// Toast content component
function ErrorToastContent({ 
  error, 
  onAction 
}: { 
  error: ParsedError; 
  onAction?: (action: ErrorAction) => void;
}) {
  const { solution } = error;

  if (!solution) {
    return <div>{error.message}</div>;
  }

  const handleAction = (action: ErrorAction) => {
    // Execute the action
    onAction?.(action);
    
    // Handle different action types
    switch (action.type) {
      case 'copy':
        navigator.clipboard.writeText(action.action);
        toast.success('Copied to clipboard!', { autoClose: 2000 });
        break;
      case 'link':
        window.open(action.action, '_blank');
        break;
      case 'command':
        // The parent component should handle command execution
        toast.info(`Run: ${action.action}`, { autoClose: 3000 });
        break;
      case 'fix':
        toast.info('Attempting auto-fix...', { autoClose: 2000 });
        break;
    }
    
    // Close the error toast after action
    toast.dismiss();
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="font-semibold text-sm mb-1">{solution.title}</div>
        <div className="text-xs text-bolt-elements-textSecondary">{solution.description}</div>
      </div>
      
      {solution.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {solution.actions.slice(0, 2).map((action, index) => (
            <button
              key={index}
              onClick={() => handleAction(action)}
              className="px-2 py-1 text-xs rounded bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover text-bolt-elements-button-secondary-text border border-bolt-elements-borderColor transition-colors"
            >
              <span className="mr-1">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Quick error notification for simple errors
 */
export function showQuickError(message: string) {
  toast.error(message, {
    autoClose: 3000,
  });
}

/**
 * Success notification with action
 */
export function showSuccess(message: string, action?: { label: string; onClick: () => void }) {
  if (action) {
    toast.success(
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <button
          onClick={() => {
            action.onClick();
            toast.dismiss();
          }}
          className="px-2 py-1 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
        >
          {action.label}
        </button>
      </div>,
      { autoClose: 5000 }
    );
  } else {
    toast.success(message, { autoClose: 3000 });
  }
}

/**
 * Info notification
 */
export function showInfo(message: string) {
  toast.info(message, {
    autoClose: 3000,
  });
}

/**
 * Warning notification
 */
export function showWarning(message: string) {
  toast.warning(message, {
    autoClose: 4000,
  });
}

/**
 * Show error with recovery actions
 */
export function showErrorWithRecovery(
  error: Error | string | ErrorInfo,
  recoveryActions?: RecoveryAction[]
) {
  let errorInfo: ErrorInfo;

  if (typeof error === 'string') {
    errorInfo = {
      code: ErrorCode.UNKNOWN_ERROR,
      message: error,
      userMessage: error,
      category: 'unknown',
      canRetry: true,
      recoveryActions,
    };
  } else if ('code' in error && 'userMessage' in error) {
    errorInfo = { ...error, recoveryActions: recoveryActions || error.recoveryActions };
  } else {
    const err = error as Error;
    errorInfo = {
      code: err instanceof ApiErrorException ? err.code : ErrorCode.UNKNOWN_ERROR,
      message: err.message,
      userMessage: err instanceof ApiErrorException
        ? getUserFriendlyMessage(err as ApiError)
        : err.message,
      category: err instanceof ApiErrorException ? getErrorCategory(err.code) : 'unknown',
      canRetry: err instanceof ApiErrorException ? err.canRetry : true,
      recoveryActions,
    };
  }

  const toastId = toast.error(
    <RecoveryErrorToast errorInfo={errorInfo} />,
    {
      autoClose: false,
      closeButton: true,
    }
  );

  return toastId;
}

/**
 * Toast content with recovery actions
 */
function RecoveryErrorToast({ errorInfo }: { errorInfo: ErrorInfo }) {
  const [isExecuting, setIsExecuting] = useState(false);

  const handleAction = useCallback(async (action: RecoveryAction) => {
    setIsExecuting(true);
    try {
      await action.action();
      toast.dismiss();
    } catch (e) {
      logger.error('Recovery action failed:', e);
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const categoryIcons: Record<string, string> = {
    network: 'i-ph:wifi-slash',
    auth: 'i-ph:lock',
    file: 'i-ph:file-x',
    container: 'i-ph:cube',
    server: 'i-ph:server-crash',
    unknown: 'i-ph:warning-circle',
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className={`${categoryIcons[errorInfo.category]} text-lg mt-0.5`} />
        <div className="flex-1">
          <div className="font-medium text-sm">{errorInfo.userMessage}</div>
          {errorInfo.message !== errorInfo.userMessage && (
            <div className="text-xs opacity-70 mt-1">{errorInfo.message}</div>
          )}
        </div>
      </div>

      {errorInfo.recoveryActions && errorInfo.recoveryActions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {errorInfo.recoveryActions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleAction(action)}
              disabled={isExecuting}
              className={`px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 ${
                action.primary
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {errorInfo.canRetry && (!errorInfo.recoveryActions || errorInfo.recoveryActions.length === 0) && (
        <div className="text-xs text-gray-400 mt-1">
          You can try again or reload the page
        </div>
      )}
    </div>
  );
}

/**
 * Show file operation error with retry option
 */
export function showFileError(
  operation: 'read' | 'write' | 'delete' | 'create',
  filePath: string,
  error: Error | string,
  onRetry?: () => void
) {
  const message = typeof error === 'string' ? error : error.message;
  const operationLabels = {
    read: 'reading',
    write: 'saving',
    delete: 'deleting',
    create: 'creating',
  };

  const recoveryActions: RecoveryAction[] = [];
  if (onRetry) {
    recoveryActions.push({
      label: 'Retry',
      action: onRetry,
      primary: true,
    });
  }

  return showErrorWithRecovery(
    {
      code: ErrorCode.FILE_WRITE_FAILED,
      message,
      userMessage: `Error ${operationLabels[operation]} "${filePath.split('/').pop()}"`,
      category: 'file',
      canRetry: true,
      recoveryActions,
      details: { filePath, operation },
    }
  );
}

/**
 * Show network error with retry
 */
export function showNetworkError(message?: string, onRetry?: () => void) {
  const recoveryActions: RecoveryAction[] = [];
  if (onRetry) {
    recoveryActions.push({
      label: 'Retry',
      action: onRetry,
      primary: true,
    });
  }
  recoveryActions.push({
    label: 'Reload Page',
    action: () => window.location.reload(),
  });

  return showErrorWithRecovery(
    {
      code: ErrorCode.NETWORK_ERROR,
      message: message || 'Network error',
      userMessage: 'Unable to connect to the server. Please check your connection.',
      category: 'network',
      canRetry: true,
      recoveryActions,
    }
  );
}

/**
 * Show auth error with login redirect
 */
export function showAuthError(isExpired: boolean = false) {
  const loginUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace('app.', '')}/login?redirect=${encodeURIComponent(window.location.href)}`
    : '/login';

  return showErrorWithRecovery(
    {
      code: isExpired ? ErrorCode.AUTH_TOKEN_EXPIRED : ErrorCode.AUTH_REQUIRED,
      message: isExpired ? 'Session expired' : 'Authentication required',
      userMessage: isExpired ? 'Your session has expired. Please log in again.' : 'Please log in to continue.',
      category: 'auth',
      canRetry: false,
      recoveryActions: [
        {
          label: 'Log In',
          action: () => { window.location.href = loginUrl; },
          primary: true,
        },
      ],
    }
  );
}

/**
 * Show batch file operation results
 */
export function showBatchFileResult(results: {
  totalCount: number;
  successCount: number;
  failedCount: number;
  results: Array<{ path: string; success: boolean; error?: string }>;
}) {
  if (results.failedCount === 0) {
    showSuccess(`Successfully saved ${results.successCount} file${results.successCount !== 1 ? 's' : ''}`);
    return;
  }

  const failedFiles = results.results.filter((r) => !r.success);

  toast.error(
    <div className="flex flex-col gap-2">
      <div className="font-medium text-sm">
        {results.failedCount} of {results.totalCount} files failed to save
      </div>
      <div className="text-xs max-h-24 overflow-auto">
        {failedFiles.slice(0, 5).map((f, i) => (
          <div key={i} className="flex items-center gap-1 py-0.5">
            <div className="i-ph:x-circle text-red-400" />
            <span className="truncate">{f.path.split('/').pop()}</span>
          </div>
        ))}
        {failedFiles.length > 5 && (
          <div className="text-gray-400">...and {failedFiles.length - 5} more</div>
        )}
      </div>
    </div>,
    { autoClose: false }
  );
}

/**
 * Hook to subscribe to global error events and show toasts
 */
export function useErrorToasts() {
  useEffect(() => {
    const unsubscribe = errorEvents.subscribe((errorInfo) => {
      // Don't show toast for errors that are handled by ErrorBoundary
      if (errorInfo.category === 'unknown' && !errorInfo.recoveryActions) {
        return;
      }

      showErrorWithRecovery(errorInfo);
    });

    return unsubscribe;
  }, []);
}

/**
 * Connection status toast management
 */
let connectionToastId: Id | null = null;

export function showConnectionLost(onRetry?: () => void) {
  if (connectionToastId) {
    toast.dismiss(connectionToastId);
  }

  connectionToastId = toast.warning(
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="i-ph:wifi-slash text-lg" />
        <span className="font-medium">Connection Lost</span>
      </div>
      <div className="text-xs text-gray-300">
        Trying to reconnect...
      </div>
      {onRetry && (
        <button
          onClick={() => {
            onRetry();
            toast.dismiss(connectionToastId!);
            connectionToastId = null;
          }}
          className="px-3 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors mt-1"
        >
          Retry Now
        </button>
      )}
    </div>,
    {
      autoClose: false,
      closeButton: false,
    }
  );

  return connectionToastId;
}

export function showConnectionRestored() {
  if (connectionToastId) {
    toast.dismiss(connectionToastId);
    connectionToastId = null;
  }

  toast.success('Connection restored', {
    autoClose: 2000,
    icon: <div className="i-ph:wifi-high text-lg text-green-500" />,
  });
}

export function showReconnecting(attempt: number, maxAttempts: number) {
  if (connectionToastId) {
    toast.update(connectionToastId, {
      render: (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="i-ph:spinner animate-spin text-lg" />
            <span className="font-medium">Reconnecting...</span>
          </div>
          <div className="text-xs text-gray-300">
            Attempt {attempt} of {maxAttempts}
          </div>
        </div>
      ),
    });
  }
}

/**
 * Show a loading toast that can be updated or dismissed later
 * Useful for async operations that might take time
 */
let loadingToastCounter = 0;
const activeLoadingToasts = new Map<string, Id>();

export function showLoadingToast(message: string, key?: string): string {
  const toastKey = key || `loading-${++loadingToastCounter}`;

  // Dismiss any existing toast with the same key
  const existingId = activeLoadingToasts.get(toastKey);
  if (existingId) {
    toast.dismiss(existingId);
  }

  const toastId = toast.loading(
    <div className="flex items-center gap-2">
      <div className="i-ph:spinner-gap animate-spin text-lg" />
      <span>{message}</span>
    </div>,
    { closeButton: false }
  );

  activeLoadingToasts.set(toastKey, toastId);
  return toastKey;
}

export function updateLoadingToast(key: string, message: string) {
  const toastId = activeLoadingToasts.get(key);
  if (toastId) {
    toast.update(toastId, {
      render: (
        <div className="flex items-center gap-2">
          <div className="i-ph:spinner-gap animate-spin text-lg" />
          <span>{message}</span>
        </div>
      ),
    });
  }
}

export function dismissLoadingToast(key: string, result?: { success: boolean; message?: string }) {
  const toastId = activeLoadingToasts.get(key);
  if (toastId) {
    if (result) {
      toast.update(toastId, {
        render: result.message || (result.success ? 'Done!' : 'Failed'),
        type: result.success ? 'success' : 'error',
        isLoading: false,
        autoClose: 2000,
        closeButton: true,
      });
    } else {
      toast.dismiss(toastId);
    }
    activeLoadingToasts.delete(key);
  }
}

/**
 * Show a contextual error with helpful suggestions based on the operation being performed
 */
export function showContextualError(
  operation: 'save' | 'load' | 'connect' | 'build' | 'run' | 'deploy' | 'auth',
  error: Error | string,
  onRetry?: () => void
) {
  const errorMessage = typeof error === 'string' ? error : error.message;

  const contextMessages: Record<string, { title: string; suggestions: string[] }> = {
    save: {
      title: 'Failed to save',
      suggestions: [
        'Check your internet connection',
        'Your changes are saved locally and will sync when connected',
        'Try saving again in a few seconds',
      ],
    },
    load: {
      title: 'Failed to load',
      suggestions: [
        'Refresh the page to try again',
        'Check if the resource still exists',
        'Your cached version may be available',
      ],
    },
    connect: {
      title: 'Connection failed',
      suggestions: [
        'Check your internet connection',
        'The server may be temporarily unavailable',
        'Try again in a few seconds',
      ],
    },
    build: {
      title: 'Build failed',
      suggestions: [
        'Check the terminal output for specific errors',
        'Make sure all dependencies are installed',
        'Try clearing the cache and rebuilding',
      ],
    },
    run: {
      title: 'Failed to run',
      suggestions: [
        'Check for syntax errors in your code',
        'Make sure all dependencies are installed',
        'Check if another process is using the same port',
      ],
    },
    deploy: {
      title: 'Deployment failed',
      suggestions: [
        'Check the build output for errors',
        'Verify your deployment configuration',
        'Try building locally first to identify issues',
      ],
    },
    auth: {
      title: 'Authentication failed',
      suggestions: [
        'Your session may have expired - try logging in again',
        'Check if you have permission for this action',
        'Clear your cookies and try again',
      ],
    },
  };

  const context = contextMessages[operation] || {
    title: 'Operation failed',
    suggestions: ['Try again', 'Refresh the page if the issue persists'],
  };

  const recoveryActions: RecoveryAction[] = [];
  if (onRetry) {
    recoveryActions.push({
      label: 'Try Again',
      action: onRetry,
      primary: true,
    });
  }

  toast.error(
    <div className="flex flex-col gap-2">
      <div className="font-medium text-sm">{context.title}</div>
      <div className="text-xs opacity-80">{errorMessage}</div>
      <div className="mt-1 border-t border-gray-700 pt-2">
        <div className="text-xs text-gray-400 mb-1">Suggestions:</div>
        <ul className="text-xs text-gray-300 list-disc list-inside space-y-0.5">
          {context.suggestions.slice(0, 2).map((suggestion, i) => (
            <li key={i}>{suggestion}</li>
          ))}
        </ul>
      </div>
      {recoveryActions.length > 0 && (
        <div className="flex gap-2 mt-2">
          {recoveryActions.map((action, index) => (
            <button
              key={index}
              onClick={() => action.action()}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                action.primary
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>,
    { autoClose: false, closeButton: true }
  );
}

/**
 * Show a dismissible warning banner for non-critical issues
 */
export function showWarningBanner(
  message: string,
  details?: string,
  actions?: Array<{ label: string; onClick: () => void }>
) {
  toast.warning(
    <div className="flex flex-col gap-2">
      <div className="font-medium text-sm">{message}</div>
      {details && <div className="text-xs opacity-80">{details}</div>}
      {actions && actions.length > 0 && (
        <div className="flex gap-2 mt-1">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick();
                toast.dismiss();
              }}
              className="px-2 py-1 text-xs bg-yellow-600/30 hover:bg-yellow-600/50 text-yellow-200 rounded transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>,
    { autoClose: 8000, closeButton: true }
  );
}
