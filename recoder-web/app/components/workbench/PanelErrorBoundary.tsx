/**
 * PanelErrorBoundary - Lightweight error boundary for workbench panels
 * Catches errors and shows a compact fallback UI suited for sidebar panels
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('PanelErrorBoundary');

interface Props {
  children: ReactNode;
  panelName: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(`[${this.props.panelName}] Panel error:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <span className="i-ph:warning-circle text-2xl text-red-400 mb-2" />
          <p className="text-sm text-bolt-elements-textSecondary mb-1">
            {this.props.panelName} encountered an error
          </p>
          <p className="text-xs text-bolt-elements-textTertiary mb-3 max-w-[200px]">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PanelErrorBoundary;
