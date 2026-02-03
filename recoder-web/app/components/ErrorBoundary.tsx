import React, { Component, type ErrorInfo, type ReactNode, useState, useCallback, useEffect } from 'react';
import { reportError, type ErrorInfo as ErrorInfoType, errorEvents } from '~/lib/utils/error-handler';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Show detailed error info in development */
  showDetails?: boolean;
  /** Custom error title */
  title?: string;
  /** Custom action buttons */
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
  /** Scope identifier for error reporting */
  scope?: string;
  /** Auto-retry after specified milliseconds */
  autoRetryMs?: number;
  /** Show a less intrusive inline error instead of full page */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showStack: boolean;
  retryCount: number;
  isReporting: boolean;
  reportSuccess: boolean;
}

/**
 * Enhanced Error Boundary with better UX
 * - Shows user-friendly error messages
 * - Provides retry functionality
 * - Shows detailed stack trace in development
 * - Supports custom actions
 * - Auto-retry capability
 * - Error reporting to support
 * - Inline mode for non-critical errors
 */
export class ErrorBoundary extends Component<Props, State> {
  private autoRetryTimer?: ReturnType<typeof setTimeout>;
  private readonly MAX_AUTO_RETRIES = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      showStack: false,
      retryCount: 0,
      isReporting: false,
      reportSuccess: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Report to centralized error system
    reportError(error, {
      details: {
        scope: this.props.scope,
        componentStack: errorInfo.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      },
    });

    // Log to error reporting service
    this.logError(error, errorInfo);

    // Schedule auto-retry if configured and under limit
    if (this.props.autoRetryMs && this.state.retryCount < this.MAX_AUTO_RETRIES) {
      this.scheduleAutoRetry();
    }
  }

  componentWillUnmount() {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
    }
  }

  private scheduleAutoRetry() {
    const { autoRetryMs } = this.props;
    if (!autoRetryMs) return;

    this.autoRetryTimer = setTimeout(() => {
      this.handleRetry(true);
    }, autoRetryMs);
  }

  private logError(error: Error, errorInfo: ErrorInfo) {
    // Send to error reporting service (e.g., Sentry, LogRocket)
    try {
      const errorReport = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        scope: this.props.scope,
        retryCount: this.state.retryCount,
      };

      console.error('[Error Report]', errorReport);

      // Store in localStorage for debugging (limited to last 10 errors)
      if (typeof localStorage !== 'undefined') {
        try {
          const storedErrors = JSON.parse(localStorage.getItem('recoder_errors') || '[]');
          storedErrors.unshift(errorReport);
          localStorage.setItem('recoder_errors', JSON.stringify(storedErrors.slice(0, 10)));
        } catch {
          // Ignore localStorage errors
        }
      }
    } catch (e) {
      // Ignore reporting errors
    }
  }

  handleRetry = (isAutoRetry: boolean = false) => {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
    }
    this.setState((prev) => ({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      showStack: false,
      retryCount: isAutoRetry ? prev.retryCount + 1 : 0,
      reportSuccess: false,
    }));
  };

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleClearCacheAndReload = () => {
    if (typeof window !== 'undefined') {
      // Clear service worker caches
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
      // Clear localStorage build cache
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('cache') || key.includes('vite'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      } catch {
        // Ignore
      }
      // Reload
      window.location.reload();
    }
  };

  toggleStack = () => {
    this.setState((prev) => ({ showStack: !prev.showStack }));
  };

  copyError = () => {
    const { error, errorInfo } = this.state;
    const errorText = [
      `Error: ${error?.message}`,
      `Name: ${error?.name}`,
      `Timestamp: ${new Date().toISOString()}`,
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'unknown'}`,
      `Scope: ${this.props.scope || 'unknown'}`,
      '',
      'Stack Trace:',
      error?.stack,
      '',
      'Component Stack:',
      errorInfo?.componentStack,
    ].join('\n');

    navigator.clipboard.writeText(errorText).then(() => {
      // Visual feedback would be nice here
    });
  };

  handleReportIssue = async () => {
    const { error, errorInfo } = this.state;
    this.setState({ isReporting: true });

    try {
      // Create a GitHub issue URL with pre-filled content
      const title = encodeURIComponent(`[Bug] ${error?.name}: ${error?.message?.substring(0, 50)}`);
      const body = encodeURIComponent([
        '## Error Details',
        '',
        `**Error:** ${error?.name}: ${error?.message}`,
        `**URL:** ${typeof window !== 'undefined' ? window.location.href : 'unknown'}`,
        `**Timestamp:** ${new Date().toISOString()}`,
        `**User Agent:** ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
        '',
        '## Stack Trace',
        '```',
        error?.stack?.substring(0, 2000),
        '```',
        '',
        '## Component Stack',
        '```',
        errorInfo?.componentStack?.substring(0, 1000),
        '```',
        '',
        '## Steps to Reproduce',
        '1. ',
        '',
        '## Expected Behavior',
        '',
        '## Additional Context',
      ].join('\n'));

      const issueUrl = `https://github.com/recoder-xyz/recoder/issues/new?title=${title}&body=${body}&labels=bug`;
      window.open(issueUrl, '_blank');
      this.setState({ reportSuccess: true });
    } catch (e) {
      console.error('Failed to report issue:', e);
    } finally {
      this.setState({ isReporting: false });
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showStack, retryCount, isReporting, reportSuccess } = this.state;
      const {
        title = 'Something went wrong',
        showDetails = process.env.NODE_ENV !== 'production',
        actions,
        inline,
        autoRetryMs,
      } = this.props;

      // Categorize error for better UX
      const errorCategory = this.categorizeError(error);

      // Inline mode for less intrusive errors
      if (inline) {
        return (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg m-4">
            <div className={`${errorCategory.icon} text-xl ${errorCategory.textColor} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">{errorCategory.title || title}</p>
              <p className="text-xs text-bolt-elements-textTertiary truncate">{error?.message}</p>
            </div>
            <button
              onClick={() => this.handleRetry(false)}
              className="px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors flex-shrink-0"
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] h-full p-8 bg-bolt-elements-background-depth-1">
          <div className="max-w-lg w-full">
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${errorCategory.bgColor}`}>
                <div className={`${errorCategory.icon} text-3xl ${errorCategory.textColor}`} />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl font-semibold text-bolt-elements-textPrimary text-center mb-2">
              {errorCategory.title || title}
            </h2>

            {/* Description */}
            <p className="text-bolt-elements-textTertiary text-sm text-center mb-2">
              {errorCategory.description || error?.message || 'An unexpected error occurred'}
            </p>

            {/* Auto-retry indicator */}
            {autoRetryMs && retryCount < this.MAX_AUTO_RETRIES && (
              <p className="text-yellow-400 text-xs text-center mb-4 animate-pulse">
                Auto-retrying in {Math.round(autoRetryMs / 1000)}s... (attempt {retryCount + 1}/{this.MAX_AUTO_RETRIES})
              </p>
            )}

            {/* Recovery Suggestions */}
            {errorCategory.suggestions && errorCategory.suggestions.length > 0 && (
              <div className="bg-bolt-elements-background-depth-2 rounded-lg p-3 mb-6">
                <p className="text-xs text-bolt-elements-textTertiary mb-2">Try these steps:</p>
                <ul className="text-xs text-bolt-elements-textSecondary space-y-1">
                  {errorCategory.suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-bolt-elements-textTertiary">{idx + 1}.</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                onClick={() => this.handleRetry(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <div className="i-ph:arrow-clockwise w-4 h-4" />
                Try Again
              </button>

              {errorCategory.showClearCache && (
                <button
                  onClick={this.handleClearCacheAndReload}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <div className="i-ph:broom w-4 h-4" />
                  Clear Cache & Reload
                </button>
              )}

              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <div className="i-ph:arrow-counter-clockwise w-4 h-4" />
                Reload Page
              </button>

              {actions?.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    action.variant === 'primary'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* Error Details (Development) */}
            {showDetails && error && (
              <div className="mt-6 border-t border-bolt-elements-borderColor pt-4">
                <button
                  onClick={this.toggleStack}
                  className="flex items-center gap-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary text-sm mb-3"
                >
                  <div className={`i-ph:caret-right w-4 h-4 transition-transform ${showStack ? 'rotate-90' : ''}`} />
                  {showStack ? 'Hide' : 'Show'} Error Details
                </button>

                {showStack && (
                  <div className="relative">
                    <div className="bg-bolt-elements-background-depth-1 rounded-lg p-4 overflow-auto max-h-64 text-xs font-mono text-bolt-elements-textSecondary">
                      <div className="text-red-400 mb-2 font-semibold">{error.name}: {error.message}</div>
                      {error.stack && (
                        <pre className="whitespace-pre-wrap break-words opacity-70">
                          {error.stack.split('\n').slice(1).join('\n')}
                        </pre>
                      )}
                      {errorInfo?.componentStack && (
                        <>
                          <div className="text-yellow-400 mt-4 mb-2 font-semibold">Component Stack:</div>
                          <pre className="whitespace-pre-wrap break-words opacity-70">
                            {errorInfo.componentStack}
                          </pre>
                        </>
                      )}
                    </div>
                    <button
                      onClick={this.copyError}
                      className="absolute top-2 right-2 p-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 rounded text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
                      title="Copy error details"
                    >
                      <div className="i-ph:copy w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Report Issue */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={this.handleReportIssue}
                disabled={isReporting}
                className="text-sm text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <div className={`i-ph:github-logo w-4 h-4 ${isReporting ? 'animate-spin' : ''}`} />
                {isReporting ? 'Opening...' : reportSuccess ? 'Issue Opened!' : 'Report Issue'}
              </button>
              <button
                onClick={this.copyError}
                className="text-sm text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary inline-flex items-center gap-1"
              >
                <div className="i-ph:copy w-4 h-4" />
                Copy Error
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }

  private categorizeError(error?: Error): {
    title: string;
    description: string;
    icon: string;
    textColor: string;
    bgColor: string;
    suggestions?: string[];
    showClearCache?: boolean;
  } {
    if (!error) {
      return {
        title: 'Unknown Error',
        description: 'An unexpected error occurred.',
        icon: 'i-ph:warning-circle',
        textColor: 'text-red-400',
        bgColor: 'bg-red-500/10',
      };
    }

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
      return {
        title: 'Connection Error',
        description: 'Unable to connect to the server.',
        icon: 'i-ph:wifi-slash',
        textColor: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        suggestions: [
          'Check your internet connection',
          'Try refreshing the page',
          'The server might be temporarily unavailable',
        ],
      };
    }

    // Timeout errors
    if (message.includes('timeout') || name === 'aborterror') {
      return {
        title: 'Request Timeout',
        description: 'The request took too long to complete.',
        icon: 'i-ph:clock',
        textColor: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        suggestions: [
          'Check your internet connection speed',
          'Try again - the server might be busy',
          'If this persists, the operation might be too large',
        ],
      };
    }

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('401') || message.includes('session expired')) {
      return {
        title: 'Session Expired',
        description: 'Your session has expired. Please log in again.',
        icon: 'i-ph:lock',
        textColor: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        suggestions: [
          'Click "Reload Page" to log in again',
          'Your work has been auto-saved',
        ],
      };
    }

    // Permission/Auth errors
    if (message.includes('forbidden') || message.includes('403') || message.includes('access denied')) {
      return {
        title: 'Access Denied',
        description: 'You do not have permission to perform this action.',
        icon: 'i-ph:shield-warning',
        textColor: 'text-red-400',
        bgColor: 'bg-red-500/10',
        suggestions: [
          'Make sure you own this project',
          'Try logging in with a different account',
        ],
      };
    }

    // Container/Workspace errors
    if (message.includes('container') || message.includes('workspace')) {
      return {
        title: 'Workspace Error',
        description: 'There was an issue with your workspace.',
        icon: 'i-ph:cube',
        textColor: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        suggestions: [
          'Try reloading the page',
          'Your workspace may have timed out - it will restart automatically',
          'Check if you have any running processes that crashed',
        ],
      };
    }

    // Chunk loading errors (common in SPAs after deployments)
    if (message.includes('chunk') || message.includes('loading chunk') || message.includes('dynamically imported module')) {
      return {
        title: 'Update Available',
        description: 'A new version of the app is available.',
        icon: 'i-ph:arrow-circle-up',
        textColor: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        suggestions: [
          'Click "Clear Cache & Reload" to get the latest version',
        ],
        showClearCache: true,
      };
    }

    // Memory/Resource errors
    if (message.includes('out of memory') || message.includes('heap') || message.includes('stack')) {
      return {
        title: 'Resource Limit',
        description: 'The application ran out of memory.',
        icon: 'i-ph:cpu',
        textColor: 'text-red-400',
        bgColor: 'bg-red-500/10',
        suggestions: [
          'Reload the page to free up memory',
          'Close other browser tabs',
          'If working with large files, try smaller batches',
        ],
        showClearCache: true,
      };
    }

    // File operation errors
    if (message.includes('file') || message.includes('write') || message.includes('read') || message.includes('permission')) {
      return {
        title: 'File Operation Failed',
        description: 'Could not complete the file operation.',
        icon: 'i-ph:file-x',
        textColor: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        suggestions: [
          'Try the operation again',
          'Check if the file path is valid',
          'The file might be locked by another process',
        ],
      };
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many') || message.includes('429')) {
      return {
        title: 'Too Many Requests',
        description: 'Please wait a moment before trying again.',
        icon: 'i-ph:clock-countdown',
        textColor: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        suggestions: [
          'Wait a few seconds and try again',
          'Avoid rapid repeated actions',
        ],
      };
    }

    // Server errors (5xx)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('internal server')) {
      return {
        title: 'Server Error',
        description: 'The server encountered an error.',
        icon: 'i-ph:server-crash',
        textColor: 'text-red-400',
        bgColor: 'bg-red-500/10',
        suggestions: [
          'Wait a moment and try again',
          'The issue is on our end - we\'re working on it',
          'Your work is safe and will sync when service is restored',
        ],
      };
    }

    // React specific errors
    if (message.includes('hydration') || message.includes('minified react')) {
      return {
        title: 'Rendering Error',
        description: 'The page failed to render correctly.',
        icon: 'i-ph:code',
        textColor: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        suggestions: [
          'Clear cache and reload the page',
          'This might be caused by a browser extension',
        ],
        showClearCache: true,
      };
    }

    // WebSocket connection errors
    if (message.includes('websocket') || message.includes('ws://') || message.includes('wss://')) {
      return {
        title: 'Connection Interrupted',
        description: 'Lost connection to the live update service.',
        icon: 'i-ph:plugs-connected',
        textColor: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        suggestions: [
          'Check if you are connected to the internet',
          'The app will automatically attempt to reconnect',
          'If reconnection fails, reload the page',
        ],
      };
    }

    // JSON parsing errors
    if (message.includes('json') || message.includes('unexpected token') || message.includes('syntax error')) {
      return {
        title: 'Data Error',
        description: 'Received invalid data from the server.',
        icon: 'i-ph:brackets-curly',
        textColor: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        suggestions: [
          'Try refreshing the page',
          'This is usually a temporary issue',
          'Clear your browser cache if it persists',
        ],
        showClearCache: true,
      };
    }

    // CORS errors
    if (message.includes('cors') || message.includes('cross-origin') || message.includes('blocked by cors')) {
      return {
        title: 'Access Blocked',
        description: 'The request was blocked due to security settings.',
        icon: 'i-ph:shield-slash',
        textColor: 'text-red-400',
        bgColor: 'bg-red-500/10',
        suggestions: [
          'Check if you are on the correct domain',
          'Disable any browser extensions that modify requests',
          'This may be a temporary server configuration issue',
        ],
      };
    }

    // Local storage errors
    if (message.includes('localstorage') || message.includes('quota') || message.includes('storage')) {
      return {
        title: 'Storage Error',
        description: 'Could not save data to your browser.',
        icon: 'i-ph:database',
        textColor: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        suggestions: [
          'Clear some browser data to free up space',
          'Check if private browsing mode is enabled',
          'Enable cookies for this site',
        ],
      };
    }

    // Default error
    return {
      title: 'Something went wrong',
      description: error.message || 'An unexpected error occurred.',
      icon: 'i-ph:warning-circle',
      textColor: 'text-red-400',
      bgColor: 'bg-red-500/10',
      suggestions: [
        'Try again',
        'If the problem persists, reload the page',
      ],
    };
  }
}

/**
 * Hook-based error boundary wrapper for functional components
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
): React.FC<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Inline error display for non-critical errors
 */
export function InlineError({
  error,
  onRetry,
  className = '',
}: {
  error: Error | string;
  onRetry?: () => void;
  className?: string;
}) {
  const message = typeof error === 'string' ? error : error.message;

  return (
    <div className={`flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg ${className}`}>
      <div className="i-ph:warning-circle text-red-400 text-xl flex-shrink-0" />
      <p className="text-sm text-red-300 flex-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Suspense-like loading error component
 */
export function LoadingError({
  error,
  onRetry,
  title = 'Failed to load',
}: {
  error?: Error | string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="i-ph:cloud-slash text-4xl text-bolt-elements-textTertiary mb-4" />
      <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">{title}</h3>
      <p className="text-sm text-bolt-elements-textTertiary mb-4">
        {typeof error === 'string' ? error : error?.message || 'Please try again later.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;
