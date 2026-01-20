/**
 * Mode store for tracking the current AI mode
 */
import { atom } from 'nanostores';
import { MODES, type ModeDefinition } from '~/lib/modes/types';

// Current mode (default to 'code')
export const currentMode = atom<string>('code');

// Mode history for undo
export const modeHistory = atom<string[]>(['code']);

/**
 * Set the current mode
 */
export function setMode(modeId: string): void {
  if (!MODES[modeId]) {
    console.warn(`Unknown mode: ${modeId}`);
    return;
  }

  const history = modeHistory.get();
  modeHistory.set([...history.slice(-9), modeId]); // Keep last 10
  currentMode.set(modeId);

  console.log(`🔄 Mode switched to: ${MODES[modeId].name}`);
}

/**
 * Get the current mode definition
 */
export function getCurrentMode(): ModeDefinition {
  return MODES[currentMode.get()] || MODES.code;
}

/**
 * Go back to previous mode
 */
export function previousMode(): void {
  const history = modeHistory.get();
  if (history.length > 1) {
    const newHistory = history.slice(0, -1);
    modeHistory.set(newHistory);
    currentMode.set(newHistory[newHistory.length - 1]);
  }
}

/**
 * Auto-detect mode based on user message
 */
export function autoDetectMode(message: string): string | null {
  const lowerMessage = message.toLowerCase();

  // Debug mode triggers
  if (
    lowerMessage.includes('error') ||
    lowerMessage.includes('bug') ||
    lowerMessage.includes('fix') ||
    lowerMessage.includes('broken') ||
    lowerMessage.includes('not working') ||
    lowerMessage.includes('debug')
  ) {
    return 'debug';
  }

  // Architect mode triggers
  if (
    lowerMessage.includes('plan') ||
    lowerMessage.includes('design') ||
    lowerMessage.includes('architect') ||
    lowerMessage.includes('structure') ||
    lowerMessage.includes('how should') ||
    lowerMessage.includes('what approach')
  ) {
    return 'architect';
  }

  // Ask mode triggers
  if (
    lowerMessage.includes('explain') ||
    lowerMessage.includes('what is') ||
    lowerMessage.includes('what does') ||
    lowerMessage.includes('how does') ||
    lowerMessage.includes('why') ||
    lowerMessage.includes('understand')
  ) {
    return 'ask';
  }

  // Code mode is default for implementation requests
  if (
    lowerMessage.includes('create') ||
    lowerMessage.includes('build') ||
    lowerMessage.includes('implement') ||
    lowerMessage.includes('add') ||
    lowerMessage.includes('make')
  ) {
    return 'code';
  }

  // No strong signal - return null to keep current mode
  return null;
}

/**
 * Suggest mode switch based on context
 */
export function suggestModeSwitch(context: {
  hasErrors?: boolean;
  isPlanning?: boolean;
  isQuestion?: boolean;
}): string | null {
  if (context.hasErrors) {
    return 'debug';
  }
  if (context.isPlanning) {
    return 'architect';
  }
  if (context.isQuestion) {
    return 'ask';
  }
  return null;
}
