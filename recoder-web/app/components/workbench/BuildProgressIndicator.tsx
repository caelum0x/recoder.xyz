import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback } from 'react';
import { workbenchStore } from '~/lib/stores/workbench';
import {
  isNpmInstallRunning,
  isNpmInstallComplete,
  getActionsInProgress,
} from '~/lib/runtime/action-runner';

type Phase = 'idle' | 'creating' | 'installing' | 'starting' | 'ready';

/**
 * Build Progress Indicator
 *
 * Non-blocking thin status bar shown at the bottom of the workbench during
 * file creation, dependency installation, and dev-server startup.
 * Auto-hides 3 seconds after reaching the "ready" phase.
 */
export function BuildProgressIndicator() {
  const buildStatus = useStore(workbenchStore.buildStatus);
  const containerReady = useStore(workbenchStore.containerReady);

  const [derivedPhase, setDerivedPhase] = useState<Phase>('idle');
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasBeenActiveRef = useRef(false);

  // Derive the current phase from multiple signals.
  // buildStatus.phase is set to 'creating' by the action runner when files are
  // being written.  The other phases are inferred from global flags and store
  // state because they are not explicitly pushed into buildStatus today.
  const derivePhase = useCallback((): Phase => {
    // 1. If the build status atom says "creating", trust it.
    if (buildStatus.phase === 'creating') {
      return 'creating';
    }

    // 2. If npm install is actively running, we are in the "installing" phase.
    if (isNpmInstallRunning()) {
      return 'installing';
    }

    // 3. If npm install completed but the container/preview is not yet ready,
    //    the dev server is likely starting up.
    if (isNpmInstallComplete() && !containerReady) {
      return 'starting';
    }

    // 4. If there are actions in progress and container is not ready, stay in
    //    "creating" (files still being written even if buildStatus wasn't set).
    if (getActionsInProgress() > 0 && !containerReady) {
      return 'creating';
    }

    // 5. If container is ready AND we were previously in an active phase,
    //    transition to "ready" so the user sees the completion.
    if (containerReady && hasBeenActiveRef.current) {
      return 'ready';
    }

    return 'idle';
  }, [buildStatus.phase, containerReady]);

  // Poll derived phase every 500ms because isNpmInstallRunning / getActionsInProgress
  // are plain functions (not reactive atoms).
  useEffect(() => {
    const update = () => {
      const next = derivePhase();
      setDerivedPhase((prev) => {
        // Only allow forward transitions during a build cycle:
        // idle -> creating -> installing -> starting -> ready
        // Once "ready" is reached the hide timer handles cleanup.
        if (prev === 'ready' && next !== 'idle') {
          return prev;
        }
        return next;
      });
    };

    update(); // run immediately
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [derivePhase]);

  // Show the bar when an active phase starts; hide after "ready" with a delay.
  useEffect(() => {
    if (derivedPhase !== 'idle' && derivedPhase !== 'ready') {
      hasBeenActiveRef.current = true;
      setVisible(true);

      // Clear any pending hide timer when re-entering an active phase.
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }

    if (derivedPhase === 'ready' && hasBeenActiveRef.current) {
      setVisible(true);

      // Auto-hide after 3 seconds.
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        // Reset so the bar can appear again for the next build cycle.
        hasBeenActiveRef.current = false;
        setDerivedPhase('idle');
      }, 3000);
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [derivedPhase]);

  return (
    <AnimatePresence>
      {visible && derivedPhase !== 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-7 z-50 pointer-events-none"
          style={{
            left: 'var(--workbench-left)',
            width: 'var(--workbench-inner-width)',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-b-lg border border-t-0 border-bolt-elements-borderColor shadow-sm pointer-events-auto"
            style={{
              maxHeight: '32px',
              backgroundColor: 'var(--bolt-elements-background-depth-2)',
            }}
          >
            {/* Phase icon */}
            <span className={getPhaseTextColor(derivedPhase)}>
              {getPhaseIcon(derivedPhase)}
            </span>

            {/* Phase label */}
            <span
              className={`text-xs font-medium whitespace-nowrap ${getPhaseTextColor(derivedPhase)}`}
            >
              {getPhaseTitle(derivedPhase)}
            </span>

            {/* Progress bar (indeterminate for non-ready phases) */}
            {derivedPhase !== 'ready' && (
              <div className="flex-1 h-1 rounded-full overflow-hidden bg-bolt-elements-background-depth-3 min-w-[60px] max-w-[200px]">
                <motion.div
                  className={`h-full rounded-full ${getProgressBarColor(derivedPhase)}`}
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    ease: 'linear',
                  }}
                  style={{ width: '40%' }}
                />
              </div>
            )}

            {/* File count badge (during creation) */}
            {derivedPhase === 'creating' && buildStatus.filesCreated && buildStatus.filesCreated > 0 && (
              <span className="text-[10px] text-bolt-elements-textTertiary tabular-nums">
                {buildStatus.filesCreated} file{buildStatus.filesCreated !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getPhaseIcon(phase: Phase) {
  switch (phase) {
    case 'creating':
      return <div className="i-ph:file-plus text-sm animate-pulse" />;
    case 'installing':
      return <div className="i-ph:package text-sm animate-spin" />;
    case 'starting':
      return <div className="i-ph:rocket-launch text-sm animate-bounce" />;
    case 'ready':
      return <div className="i-ph:check-circle text-sm" />;
    default:
      return <div className="i-ph:circle-notch text-sm animate-spin" />;
  }
}

function getPhaseTitle(phase: Phase): string {
  switch (phase) {
    case 'creating':
      return 'Creating files...';
    case 'installing':
      return 'Installing packages...';
    case 'starting':
      return 'Starting dev server...';
    case 'ready':
      return 'Ready';
    default:
      return 'Building...';
  }
}

function getPhaseTextColor(phase: Phase): string {
  switch (phase) {
    case 'creating':
      return 'text-blue-400';
    case 'installing':
      return 'text-orange-400';
    case 'starting':
      return 'text-purple-400';
    case 'ready':
      return 'text-green-400';
    default:
      return 'text-bolt-elements-textSecondary';
  }
}

function getProgressBarColor(phase: Phase): string {
  switch (phase) {
    case 'creating':
      return 'bg-blue-400';
    case 'installing':
      return 'bg-orange-400';
    case 'starting':
      return 'bg-purple-400';
    default:
      return 'bg-bolt-elements-textTertiary';
  }
}
