/**
 * LoadingStates - Reusable loading state components for panels
 * Provides consistent loading, empty, and error states across the workbench
 */

import { memo } from 'react';
import { classNames } from '~/utils/classNames';

interface PanelLoadingProps {
  message?: string;
  submessage?: string;
  color?: 'blue' | 'purple' | 'green' | 'yellow' | 'orange' | 'red';
  className?: string;
}

const colorClasses: Record<string, string> = {
  blue: 'border-blue-500',
  purple: 'border-purple-500',
  green: 'border-green-500',
  yellow: 'border-yellow-500',
  orange: 'border-orange-500',
  red: 'border-red-500',
};

/**
 * Panel loading spinner with optional message
 */
export const PanelLoading = memo(({
  message = 'Loading...',
  submessage,
  color = 'blue',
  className = ''
}: PanelLoadingProps) => {
  return (
    <div className={classNames('flex flex-col h-full justify-center items-center text-sm', className)}>
      <div className={classNames(
        'animate-spin rounded-full h-6 w-6 border-b-2 mb-2',
        colorClasses[color]
      )} />
      <span className="text-recoder-elements-textTertiary">{message}</span>
      {submessage && (
        <span className="text-recoder-elements-textTertiary/70 text-xs mt-1">{submessage}</span>
      )}
    </div>
  );
});

PanelLoading.displayName = 'PanelLoading';

interface PanelEmptyProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Panel empty state with icon, title, description and optional action
 */
export const PanelEmpty = memo(({
  icon = 'i-ph:folder-open',
  title,
  description,
  action,
  className = ''
}: PanelEmptyProps) => {
  return (
    <div className={classNames('flex flex-col h-full justify-center items-center text-sm p-4', className)}>
      <span className={classNames(icon, 'text-2xl mb-2 text-recoder-elements-textTertiary')} />
      <span className="text-recoder-elements-textSecondary font-medium">{title}</span>
      {description && (
        <span className="text-recoder-elements-textTertiary text-xs mt-1 text-center max-w-xs">{description}</span>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
});

PanelEmpty.displayName = 'PanelEmpty';

interface PanelErrorProps {
  icon?: string;
  title?: string;
  error: string;
  retry?: () => void;
  className?: string;
}

/**
 * Panel error state with retry option
 */
export const PanelError = memo(({
  icon = 'i-ph:warning-circle',
  title = 'Something went wrong',
  error,
  retry,
  className = ''
}: PanelErrorProps) => {
  return (
    <div className={classNames('flex flex-col h-full justify-center items-center text-sm p-4', className)}>
      <span className={classNames(icon, 'text-2xl mb-2 text-red-400')} />
      <span className="text-recoder-elements-textSecondary font-medium">{title}</span>
      <span className="text-red-400/80 text-xs mt-1 text-center max-w-xs">{error}</span>
      {retry && (
        <button
          onClick={retry}
          className="mt-3 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
});

PanelError.displayName = 'PanelError';

interface ContainerWaitingProps {
  message?: string;
  className?: string;
}

/**
 * Container waiting state - shown when waiting for Docker container
 */
export const ContainerWaiting = memo(({
  message = 'Waiting for container...',
  className = ''
}: ContainerWaitingProps) => {
  return (
    <div className={classNames('flex flex-col h-full justify-center items-center text-sm', className)}>
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mb-2" />
      <span className="text-recoder-elements-textTertiary">{message}</span>
      <span className="text-recoder-elements-textTertiary/70 text-xs mt-1">
        Starting development environment...
      </span>
    </div>
  );
});

ContainerWaiting.displayName = 'ContainerWaiting';

export default { PanelLoading, PanelEmpty, PanelError, ContainerWaiting };
