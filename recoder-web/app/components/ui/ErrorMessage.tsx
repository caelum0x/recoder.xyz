import { useState } from 'react';
import { classNames } from '~/utils/classNames';
import type { ParsedError, ErrorAction } from '~/lib/errors/error-handler';
import { getSeverityColor, getSeverityIcon } from '~/lib/errors/error-handler';

interface ErrorMessageProps {
  error: ParsedError;
  onAction?: (action: ErrorAction) => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorMessage({ error, onAction, onDismiss, className }: ErrorMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { solution } = error;

  if (!solution) {
    return (
      <div className={classNames('p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg', className)}>
        <div className="flex items-start gap-3">
          <div className="text-2xl"><div className="i-ph:x-circle text-red-500" /></div>
          <div className="flex-1">
            <p className="text-sm text-red-800 dark:text-red-200">{error.message}</p>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200">
              <div className="i-ph:x text-lg" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const severityColor = getSeverityColor(solution.severity);
  const severityIcon = getSeverityIcon(solution.severity);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      className={classNames(
        'p-4 rounded-lg border transition-all duration-200',
        'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={classNames('text-2xl flex-shrink-0', severityIcon)} />
        <div className="flex-1 min-w-0">
          <h3 className={classNames('font-semibold text-sm mb-1', severityColor)}>
            {solution.title}
          </h3>
          <p className="text-sm text-bolt-elements-textSecondary">
            {solution.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Expand/Collapse button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
            title={expanded ? 'Show less' : 'Show more'}
          >
            <div className={classNames('i-ph:caret-down text-lg transition-transform', expanded ? 'rotate-180' : '')} />
          </button>
          {/* Dismiss button */}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
              title="Dismiss"
            >
              <div className="i-ph:x text-lg" />
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      {solution.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {solution.actions.map((action, index) => (
            <button
              key={index}
              onClick={() => onAction?.(action)}
              className={classNames(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                'bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover',
                'text-bolt-elements-button-primary-text',
                'border border-bolt-elements-borderColor',
                index === 0 && solution.autoFixable ? 'ring-2 ring-accent-500/50' : ''
              )}
              title={index === 0 && solution.autoFixable ? 'Automatic fix available' : ''}
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
              {index === 0 && solution.autoFixable && (
                <span className="text-xs bg-accent-500 text-white px-1.5 py-0.5 rounded">Auto</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor animate-fade-in">
          <details className="text-xs">
            <summary className="cursor-pointer text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary mb-2 font-medium">
              View error details
            </summary>
            <div className="mt-2 p-3 bg-bolt-elements-background-depth-3 rounded border border-bolt-elements-borderColor">
              <div className="flex items-start justify-between gap-2 mb-2">
                <code className="text-xs text-bolt-elements-textSecondary">Error Type: {error.type}</code>
                <button
                  onClick={() => handleCopy(error.rawError)}
                  className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                  title="Copy error"
                >
                  {copied ? (
                    <div className="i-ph:check text-green-500" />
                  ) : (
                    <div className="i-ph:copy" />
                  )}
                </button>
              </div>
              <pre className="text-xs text-bolt-elements-textPrimary overflow-x-auto whitespace-pre-wrap break-words">
                {error.rawError}
              </pre>
            </div>
          </details>

          {/* Tips */}
          <div className="mt-3 p-2 bg-bolt-elements-background-depth-1 rounded border border-bolt-elements-borderColor">
            <p className="text-xs text-bolt-elements-textSecondary">
              <strong>Tip:</strong> {getTipForErrorType(error.type)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact inline error for small spaces
export function InlineError({ error, onDismiss }: { error: ParsedError; onDismiss?: () => void }) {
  const solution = error.solution;
  const icon = solution ? getSeverityIcon(solution.severity) : 'i-ph:x-circle';

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
      <span>{icon}</span>
      <span className="text-sm text-red-800 dark:text-red-200 flex-1">
        {solution ? solution.title : error.message}
      </span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200">
          <div className="i-ph:x" />
        </button>
      )}
    </div>
  );
}

// Helper function to provide context-specific tips
function getTipForErrorType(type: string): string {
  const tips: Record<string, string> = {
    PORT_IN_USE: 'This usually happens when you have another dev server running. Check your open terminal tabs.',
    MODULE_NOT_FOUND: 'Make sure to run npm install after cloning a project or when adding new dependencies.',
    SYNTAX_ERROR: 'Use your editor\'s syntax highlighting to spot errors quickly. Most editors show syntax errors in real-time.',
    BUILD_ERROR: 'Build errors often cascade from a single issue. Fix the first error and re-run.',
    NETWORK_ERROR: 'Check your internet connection or firewall settings. Some corporate networks block certain requests.',
    TYPESCRIPT_ERROR: 'TypeScript errors help catch bugs before runtime. Consider fixing them rather than using @ts-ignore.',
    PERMISSION_ERROR: 'Permission errors often occur when files were created with sudo. Try fixing ownership first.',
    UNKNOWN_ERROR: 'For unknown errors, try restarting your dev server or clearing the cache.',
  };

  return tips[type] || 'If the error persists, try restarting your development server or clearing the cache.';
}
