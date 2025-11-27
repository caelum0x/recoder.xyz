import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { workbenchStore } from '~/lib/stores/workbench';

/**
 * ✅ P1: Build Progress Indicator
 * Shows visual feedback during install/build/start phases
 */
export function BuildProgressIndicator() {
  const buildStatus = useStore(workbenchStore.buildStatus);

  if (buildStatus.phase === 'idle') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50"
      >
        <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-xl shadow-2xl px-6 py-4 min-w-[400px] backdrop-blur-xl">
          {/* Header with icon and phase */}
          <div className="flex items-center space-x-3 mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getPhaseColor(buildStatus.phase)}`}>
              {getPhaseIcon(buildStatus.phase)}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-bolt-elements-textPrimary">
                {getPhaseTitle(buildStatus.phase)}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary mt-0.5">
                {buildStatus.message}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-bolt-elements-background-depth-1 rounded-full h-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${buildStatus.progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={`h-full rounded-full ${getProgressBarColor(buildStatus.phase)}`}
            />
          </div>

          {/* Progress percentage */}
          <div className="text-right text-xs text-bolt-elements-textSecondary mt-2">
            {buildStatus.progress}%
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function getPhaseIcon(phase: string) {
  switch (phase) {
    case 'creating':
      return <div className="i-ph:file-plus text-lg animate-pulse" />;
    case 'installing':
      return <div className="i-ph:package text-lg animate-spin" />;
    case 'starting':
      return <div className="i-ph:rocket-launch text-lg animate-bounce" />;
    case 'ready':
      return <div className="i-ph:check-circle text-lg" />;
    default:
      return <div className="i-ph:circle-notch text-lg animate-spin" />;
  }
}

function getPhaseTitle(phase: string) {
  switch (phase) {
    case 'creating':
      return 'Creating Files';
    case 'installing':
      return 'Installing Dependencies';
    case 'starting':
      return 'Starting Dev Server';
    case 'ready':
      return 'Ready!';
    default:
      return 'Building...';
  }
}

function getPhaseColor(phase: string) {
  switch (phase) {
    case 'creating':
      return 'bg-blue-500/20 text-blue-400';
    case 'installing':
      return 'bg-orange-500/20 text-orange-400';
    case 'starting':
      return 'bg-purple-500/20 text-purple-400';
    case 'ready':
      return 'bg-green-500/20 text-green-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}

function getProgressBarColor(phase: string) {
  switch (phase) {
    case 'creating':
      return 'bg-gradient-to-r from-blue-500 to-cyan-500';
    case 'installing':
      return 'bg-gradient-to-r from-orange-500 to-amber-500';
    case 'starting':
      return 'bg-gradient-to-r from-purple-500 to-pink-500';
    case 'ready':
      return 'bg-gradient-to-r from-green-500 to-emerald-500';
    default:
      return 'bg-gradient-to-r from-gray-500 to-gray-400';
  }
}
