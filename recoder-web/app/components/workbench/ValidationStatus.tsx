/**
 * ValidationStatus Component
 * Displays code validation results for file actions
 *
 * Shows:
 * - Validation status (passed/failed/warnings)
 * - List of errors and warnings
 * - Quick fix suggestions
 */

import { memo, useState } from 'react';
import type { ValidationResult, ValidationError, ValidationWarning, QuickFix } from '~/lib/services/code-validator';

interface ValidationStatusProps {
  validation?: ValidationResult;
  filePath?: string;
  compact?: boolean;
  onQuickFix?: (fix: QuickFix) => void;
}

export const ValidationStatus = memo(function ValidationStatus({
  validation,
  filePath,
  compact = false,
  onQuickFix,
}: ValidationStatusProps) {
  const [expanded, setExpanded] = useState(false);

  if (!validation) {
    return null;
  }

  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;
  const errorCount = validation.errors.filter(e => e.severity === 'error').length;
  const warningCount = validation.errors.filter(e => e.severity === 'warning').length + validation.warnings.length;

  // Compact mode - just show icon
  if (compact) {
    return (
      <span
        className={`validation-badge ${validation.valid ? 'valid' : 'invalid'}`}
        title={validation.valid ? 'Validation passed' : `${errorCount} errors, ${warningCount} warnings`}
      >
        {validation.valid ? (
          <span className="i-ph:check-circle text-green-500" />
        ) : errorCount > 0 ? (
          <span className="i-ph:x-circle text-red-500" />
        ) : (
          <span className="i-ph:warning text-yellow-500" />
        )}
      </span>
    );
  }

  // No issues
  if (!hasErrors && !hasWarnings) {
    return (
      <div className="validation-status validation-passed">
        <span className="i-ph:check-circle text-green-500" />
        <span className="ml-1 text-green-400 text-xs">Validation passed</span>
      </div>
    );
  }

  return (
    <div className={`validation-status ${validation.valid ? 'has-warnings' : 'has-errors'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="validation-header"
      >
        <span className="flex items-center gap-1">
          {errorCount > 0 ? (
            <span className="i-ph:x-circle text-red-500" />
          ) : (
            <span className="i-ph:warning text-yellow-500" />
          )}
          <span className="text-xs">
            {errorCount > 0 && <span className="text-red-400">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
            {errorCount > 0 && warningCount > 0 && ', '}
            {warningCount > 0 && <span className="text-yellow-400">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>}
          </span>
        </span>
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <span className="i-ph:caret-down" />
        </span>
      </button>

      {expanded && (
        <div className="validation-details">
          {validation.errors.length > 0 && (
            <div className="validation-section">
              <div className="section-header text-xs text-recoder-elements-textSecondary mb-1">Errors</div>
              {validation.errors.map((error, idx) => (
                <ValidationErrorItem key={idx} error={error} />
              ))}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="validation-section">
              <div className="section-header text-xs text-recoder-elements-textSecondary mb-1 mt-2">Warnings</div>
              {validation.warnings.map((warning, idx) => (
                <ValidationWarningItem key={idx} warning={warning} />
              ))}
            </div>
          )}

          {validation.quickFixes.length > 0 && onQuickFix && (
            <div className="validation-section">
              <div className="section-header text-xs text-recoder-elements-textSecondary mb-1 mt-2">Quick Fixes</div>
              {validation.quickFixes.map((fix, idx) => (
                <QuickFixItem key={idx} fix={fix} onClick={() => onQuickFix(fix)} />
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .validation-status {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          padding: 4px 8px;
          margin-top: 4px;
        }

        .validation-passed {
          display: flex;
          align-items: center;
          padding: 2px 6px;
        }

        .validation-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          padding: 0;
        }

        .validation-details {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .validation-item {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 4px 0;
          font-size: 11px;
        }

        .validation-item .icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .validation-item .message {
          flex: 1;
          color: rgba(255, 255, 255, 0.8);
        }

        .validation-item .location {
          color: rgba(255, 255, 255, 0.4);
          font-size: 10px;
        }

        .validation-item .suggestion {
          color: rgba(255, 255, 255, 0.5);
          font-style: italic;
          margin-top: 2px;
        }

        .quick-fix-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 4px;
          padding: 4px 8px;
          color: rgb(147, 197, 253);
          font-size: 11px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .quick-fix-btn:hover {
          background: rgba(59, 130, 246, 0.3);
        }

        .validation-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
        }
      `}</style>
    </div>
  );
});

const ValidationErrorItem = memo(function ValidationErrorItem({
  error,
}: {
  error: ValidationError;
}) {
  return (
    <div className="validation-item">
      <span className={`icon ${error.severity === 'error' ? 'text-red-500' : 'text-yellow-500'}`}>
        {error.severity === 'error' ? (
          <span className="i-ph:x-circle" />
        ) : (
          <span className="i-ph:warning" />
        )}
      </span>
      <div>
        <div className="message">{error.message}</div>
        {error.line && (
          <div className="location">Line {error.line}{error.column ? `:${error.column}` : ''}</div>
        )}
      </div>
    </div>
  );
});

const ValidationWarningItem = memo(function ValidationWarningItem({
  warning,
}: {
  warning: ValidationWarning;
}) {
  return (
    <div className="validation-item">
      <span className="icon text-yellow-500">
        <span className="i-ph:info" />
      </span>
      <div>
        <div className="message">{warning.message}</div>
        {warning.suggestion && (
          <div className="suggestion">{warning.suggestion}</div>
        )}
      </div>
    </div>
  );
});

const QuickFixItem = memo(function QuickFixItem({
  fix,
  onClick,
}: {
  fix: QuickFix;
  onClick: () => void;
}) {
  return (
    <button className="quick-fix-btn" onClick={onClick}>
      <span className="i-ph:wrench" />
      {fix.description}
    </button>
  );
});

export default ValidationStatus;
