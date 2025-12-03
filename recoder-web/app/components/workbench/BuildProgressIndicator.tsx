import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { workbenchStore } from '~/lib/stores/workbench';

/**
 * ✅ P1: Build Progress Indicator
 * Shows visual feedback during install/build/start phases
 * DISABLED: User doesn't want this popup blocking the page
 */
export function BuildProgressIndicator() {
  // Popup disabled - user doesn't want it blocking the page
  return null;
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
