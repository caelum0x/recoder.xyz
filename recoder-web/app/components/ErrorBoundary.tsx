import React, { Component, type ErrorInfo, type ReactNode, useState, useCallback } from 'react';

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
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showStack: boolean;
}

/**
 * Enhanced Error Boundary with better UX
 * - Shows user-friendly error messages
 * - Provides retry functionality
 * - Shows detailed stack trace in development
 * - Supports custom actions
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, showStack: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to error reporting service in production
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo);
    }
  }

  private reportError(error: Error, errorInfo: ErrorInfo) {
    // Send to error reporting service (e.g., Sentry, LogRocket)
    try {
      console.error('[Error Report]', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      });
    } catch (e) {
      // Ignore reporting errors
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined, showStack: false });
  };

  handleReload = () => {
    if (typeof window !== 'undefined') {
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
      '',
      'Stack Trace:',
      error?.stack,
      '',
      'Component Stack:',
      errorInfo?.componentStack,
    ].join('\n');

    navigator.clipboard.writeText(errorText).then(() => {
      // Could show a toast here
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showStack } = this.state;
      const { title = 'Something went wrong', showDetails = process.env.NODE_ENV !== 'production', actions } = this.props;

      // Categorize error for better UX
      const errorCategory = this.categorizeError(error);

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
            <h2 className="text-xl font-semibold text-white text-center mb-2">
              {errorCategory.title || title}
            </h2>

            {/* Description */}
            <p className="text-gray-400 text-sm text-center mb-6">
              {errorCategory.description || error?.message || 'An unexpected error occurred'}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <div className="i-ph:arrow-clockwise w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
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
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* Error Details (Development) */}
            {showDetails && error && (
              <div className="mt-6 border-t border-gray-700 pt-4">
                <button
                  onClick={this.toggleStack}
                  className="flex items-center gap-2 text-gray-400 hover:text-gray-300 text-sm mb-3"
                >
                  <div className={`i-ph:caret-right w-4 h-4 transition-transform ${showStack ? 'rotate-90' : ''}`} />
                  {showStack ? 'Hide' : 'Show'} Error Details
                </button>

                {showStack && (
                  <div className="relative">
                    <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-64 text-xs font-mono text-gray-300">
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
                      className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                      title="Copy error details"
                    >
                      <div className="i-ph:copy w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Help Link */}
            <div className="text-center mt-4">
              <a
                href="https://github.com/recoder-xyz/recoder/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              >
                <div className="i-ph:github-logo w-4 h-4" />
                Report this issue
              </a>
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

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
      return {
        title: 'Connection Error',
        description: 'Unable to connect to the server. Please check your internet connection.',
        icon: 'i-ph:wifi-slash',
        textColor: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
      };
    }

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('auth') || message.includes('session')) {
      return {
        title: 'Session Expired',
        description: 'Your session has expired. Please log in again.',
        icon: 'i-ph:lock',
        textColor: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
      };
    }

    // Container errors
    if (message.includes('container') || message.includes('workspace')) {
      return {
        title: 'Workspace Error',
        description: 'There was an issue with your workspace. Please try again.',
        icon: 'i-ph:cube',
        textColor: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
      };
    }

    // Chunk loading errors (common in SPAs)
    if (message.includes('chunk') || message.includes('loading chunk')) {
      return {
        title: 'Update Available',
        description: 'A new version is available. Please reload the page.',
        icon: 'i-ph:arrow-circle-up',
        textColor: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
      };
    }

    // Default error
    return {
      title: 'Something went wrong',
      description: error.message || 'An unexpected error occurred.',
      icon: 'i-ph:warning-circle',
      textColor: 'text-red-400',
      bgColor: 'bg-red-500/10',
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
      <div className="i-ph:cloud-slash text-4xl text-gray-500 mb-4" />
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 mb-4">
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
