'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Send error to analytics
    this.trackError(error, errorInfo);
  }

  private trackError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      await fetch('/api/analytics/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      });
    } catch (trackingError) {
      console.error('Failed to track error:', trackingError);
    }
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private reportBug = () => {
    const { error, errorInfo } = this.state;
    const bugReport = {
      error: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    const githubUrl = `https://github.com/recoderxyz/recoder.xyz/issues/new?title=${encodeURIComponent(`Bug Report: ${error?.message}`)}&body=${encodeURIComponent(`
## Error Description
${error?.message}

## Stack Trace
\`\`\`
${error?.stack}
\`\`\`

## Component Stack
\`\`\`
${errorInfo?.componentStack}
\`\`\`

## Environment
- URL: ${window.location.href}
- Timestamp: ${new Date().toISOString()}
- User Agent: ${navigator.userAgent}

## Additional Context
Please describe what you were doing when this error occurred.
    `)}`;

    window.open(githubUrl, '_blank');
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo } = this.state;

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <AlertTriangle className="w-16 h-16 text-red-500" />
              </div>
              <CardTitle className="text-2xl text-red-600">
                Oops! Something went wrong
              </CardTitle>
              <CardDescription>
                We encountered an unexpected error. Our team has been notified.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Error Details */}
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                  Error Details
                </h3>
                <p className="text-red-700 dark:text-red-300 text-sm">
                  {error?.message || 'An unknown error occurred'}
                </p>
              </div>

              {/* Stack Trace (Development only) */}
              {process.env.NODE_ENV === 'development' && error?.stack && (
                <details className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <summary className="font-semibold cursor-pointer mb-2">
                    Stack Trace (Development)
                  </summary>
                  <pre className="text-xs overflow-auto max-h-48 text-gray-700 dark:text-gray-300">
                    {error.stack}
                  </pre>
                </details>
              )}

              {/* Component Stack (Development only) */}
              {process.env.NODE_ENV === 'development' && errorInfo?.componentStack && (
                <details className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <summary className="font-semibold cursor-pointer mb-2">
                    Component Stack (Development)
                  </summary>
                  <pre className="text-xs overflow-auto max-h-48 text-gray-700 dark:text-gray-300">
                    {errorInfo.componentStack}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  onClick={this.handleRetry}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </Button>
                
                <Button
                  onClick={this.handleReload}
                  variant="outline"
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload Page
                </Button>
                
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="gap-2"
                >
                  <Home className="w-4 h-4" />
                  Go Home
                </Button>
                
                <Button
                  onClick={this.reportBug}
                  variant="outline"
                  className="gap-2"
                >
                  <Bug className="w-4 h-4" />
                  Report Bug
                </Button>
              </div>

              {/* Help Text */}
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                <p>
                  If this problem persists, please{' '}
                  <button
                    onClick={this.reportBug}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    report it to our team
                  </button>
                  .
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
