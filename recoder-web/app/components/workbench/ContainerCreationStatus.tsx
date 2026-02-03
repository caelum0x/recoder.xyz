/**
 * Container Creation Status Indicator
 *
 * Displays the current state of container provisioning at the top of the
 * preview area.  Three visual states:
 *
 * 1. **Creating** -- spinner + "Setting up environment..."
 * 2. **Ready**    -- green dot + "Environment ready" (auto-hides after a few seconds)
 * 3. **Failed**   -- red dot + "Setup failed" + Retry button
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';

/** How long to keep the "ready" banner visible before hiding it (ms). */
const READY_DISPLAY_MS = 4000;

export const ContainerCreationStatus = memo(() => {
  const containerReady = useStore(workbenchStore.containerReady);
  const containerFailed = useStore(workbenchStore.containerCreationFailed);
  const [isRetrying, setIsRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss the "ready" state after a short delay
  useEffect(() => {
    if (!containerReady) {
      // Reset dismissal when leaving the ready state (e.g. navigating to new project)
      setDismissed(false);
      return;
    }

    const timer = setTimeout(() => setDismissed(true), READY_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [containerReady]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      await workbenchStore.retryContainerCreation();
    } finally {
      setIsRetrying(false);
    }
  }, []);

  // --- Determine which state to render ---

  // Nothing to show once the container is ready and the banner has been dismissed
  if (containerReady && dismissed) {
    return null;
  }

  // State: Failed
  if (containerFailed && !isRetrying) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs select-none">
        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        <span className="text-red-400">Environment setup failed</span>
        <button
          onClick={handleRetry}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
        >
          <div className="i-ph:arrow-clockwise w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  // State: Creating (or retrying)
  if (!containerReady) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor text-xs select-none">
        <div
          className="i-ph:spinner-gap w-3.5 h-3.5 text-bolt-elements-textTertiary flex-shrink-0"
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <span className="text-bolt-elements-textSecondary">
          {isRetrying ? 'Retrying environment setup...' : 'Setting up environment...'}
        </span>
      </div>
    );
  }

  // State: Ready (visible briefly before auto-dismiss)
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20 text-xs select-none">
      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
      <span className="text-green-400">Environment ready</span>
    </div>
  );
});

ContainerCreationStatus.displayName = 'ContainerCreationStatus';
