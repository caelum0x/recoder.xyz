/**
 * ErrorBanner - A floating error banner for the preview panel
 *
 * Displays runtime errors with AI-powered fix suggestions.
 * Inspired by dyad's implementation.
 */

import { useState, useCallback } from 'react';
import { classNames } from '~/utils/classNames';

// Runtime error interface
export interface RuntimeError {
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  timestamp: number;
}

interface ErrorBannerProps {
  errors: RuntimeError[];
  onDismiss: () => void;
  onRetry?: () => void;
  isStreaming?: boolean;
}

/**
 * Truncate error message to a reasonable length for display
 */
function getTruncatedError(message: string, isExpanded: boolean): string {
  if (isExpanded) return message;

  const firstLine = message.split('\n')[0];
  const snippetLength = 200;
  const snippet = message.substring(0, snippetLength);

  return firstLine.length < snippet.length
    ? firstLine
    : snippet + (snippet.length === snippetLength ? '...' : '');
}

/**
 * Format error for AI context
 */
function formatErrorForAI(errors: RuntimeError[]): string {
  if (errors.length === 0) return '';

  const errorDetails = errors.map((error, index) => {
    let detail = `Error ${index + 1}: ${error.message}`;

    if (error.filename) {
      detail += `\nFile: ${error.filename}`;
      if (error.lineno) {
        detail += `:${error.lineno}`;
        if (error.colno) detail += `:${error.colno}`;
      }
    }

    if (error.stack) {
      // Only include first few lines of stack trace for context
      const stackLines = error.stack.split('\n').slice(0, 5).join('\n');
      detail += `\nStack trace:\n${stackLines}`;
    }

    return detail;
  }).join('\n\n');

  return `Fix this runtime error:\n\n${errorDetails}`;
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function ErrorBanner({ errors, onDismiss, onRetry, isStreaming = false }: ErrorBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showStackTrace, setShowStackTrace] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Don't render if no errors
  if (!errors || errors.length === 0) return null;

  // Use the most recent error for display
  const primaryError = errors[errors.length - 1];
  const hasMultipleErrors = errors.length > 1;

  const handleFixWithAI = useCallback(() => {
    const prompt = formatErrorForAI(errors);

    // Dispatch event for chat to pick up
    window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
      detail: { prompt, auto: false }
    }));

    // Optionally dismiss after triggering fix
    // onDismiss();
  }, [errors]);

  const handleCopyError = useCallback(async () => {
    const errorText = errors.map(e => {
      let text = e.message;
      if (e.filename) {
        text += `\n  at ${e.filename}`;
        if (e.lineno) text += `:${e.lineno}`;
        if (e.colno) text += `:${e.colno}`;
      }
      if (e.stack) {
        text += `\n\nStack trace:\n${e.stack}`;
      }
      return text;
    }).join('\n\n---\n\n');

    const success = await copyToClipboard(errorText);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [errors]);

  return (
    <div
      className="relative bg-red-950 border border-red-800 rounded-lg shadow-lg overflow-hidden"
      data-testid="preview-error-banner"
    >
      {/* Header with dismiss button */}
      <div className="flex items-start justify-between p-3 gap-2">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 hover:bg-red-900 rounded transition-colors"
          title="Dismiss"
        >
          <span className="i-ph:x text-red-400 text-sm" />
        </button>

        {/* Error icon and count */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
            <span className="i-ph:warning-circle text-white text-sm" />
          </div>
          {hasMultipleErrors && (
            <span className="text-xs font-medium text-red-300 bg-red-900 px-1.5 py-0.5 rounded">
              {errors.length} errors
            </span>
          )}
        </div>

        {/* Error message */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start gap-1">
            <span
              className={classNames(
                'i-ph:caret-right text-red-400 text-sm flex-shrink-0 mt-0.5 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
            <div className="text-sm text-red-300 font-mono break-words whitespace-pre-wrap">
              {getTruncatedError(primaryError.message, isExpanded)}
            </div>
          </div>
          {primaryError.filename && (
            <div className="mt-1 ml-4 text-xs text-red-400/70">
              {primaryError.filename}
              {primaryError.lineno && `:${primaryError.lineno}`}
              {primaryError.colno && `:${primaryError.colno}`}
            </div>
          )}
        </div>
      </div>

      {/* Stack trace (expandable) */}
      {isExpanded && primaryError.stack && (
        <div className="border-t border-red-900">
          <button
            onClick={() => setShowStackTrace(!showStackTrace)}
            className="w-full px-3 py-2 flex items-center gap-2 text-xs text-red-400 hover:bg-red-900/50 transition-colors"
          >
            <span
              className={classNames(
                'i-ph:caret-right transition-transform',
                showStackTrace && 'rotate-90'
              )}
            />
            <span>Stack trace</span>
          </button>
          {showStackTrace && (
            <div className="px-3 pb-3">
              <pre className="text-xs text-red-300/70 whitespace-pre-wrap overflow-x-auto bg-red-950/50 p-2 rounded border border-red-900/50 max-h-40 overflow-y-auto">
                {primaryError.stack}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Tip message */}
      <div className="px-3 py-2 bg-red-900/30 border-t border-red-900">
        <div className="flex items-start gap-2">
          <span className="i-ph:lightbulb text-red-400 text-sm flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300/80">
            <span className="font-medium">Tip:</span> Click "Fix with AI" to automatically fix this error,
            or check the console for more details.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 bg-red-900/20 border-t border-red-900">
        {/* Copy error button */}
        <button
          onClick={handleCopyError}
          className={classNames(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            'text-red-300 hover:bg-red-900/50',
            copySuccess && 'text-green-400'
          )}
          title="Copy error to clipboard"
        >
          <span className={copySuccess ? 'i-ph:check' : 'i-ph:copy'} />
          <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
        </button>

        {/* Retry button */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-red-300 hover:bg-red-900/50 transition-colors"
          >
            <span className="i-ph:arrow-clockwise" />
            <span>Retry</span>
          </button>
        )}

        {/* Fix with AI button */}
        <button
          onClick={handleFixWithAI}
          disabled={isStreaming}
          className={classNames(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
            'bg-red-600 hover:bg-red-500 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <span className="i-ph:sparkle" />
          <span>Fix with AI</span>
        </button>
      </div>
    </div>
  );
}
