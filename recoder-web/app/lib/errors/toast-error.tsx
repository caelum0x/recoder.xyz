import { toast } from 'react-toastify';
import { parseError, formatErrorMessage, type ParsedError, type ErrorAction } from './error-handler';

/**
 * Smart toast error that shows actionable solutions
 */
export function showSmartError(error: Error | string, options?: {
  onAction?: (action: ErrorAction) => void;
  autoClose?: number | false;
}) {
  const parsedError = parseError(error);
  const { solution } = parsedError;

  if (!solution) {
    // Fallback to regular error toast
    toast.error(parsedError.message, {
      autoClose: options?.autoClose !== undefined ? options.autoClose : 5000,
    });
    return parsedError;
  }

  // Show enhanced error with actions
  toast.error(
    <ErrorToastContent 
      error={parsedError} 
      onAction={options?.onAction}
    />,
    {
      autoClose: options?.autoClose !== undefined ? options.autoClose : false, // Don't auto-close errors with actions
      closeButton: true,
    }
  );

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
