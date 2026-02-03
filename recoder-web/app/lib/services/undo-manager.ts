/**
 * Undo Manager Service
 * Tracks AI changes and allows reverting
 *
 * Features:
 * 1. Store previous file states
 * 2. Implement undo stack per file
 * 3. Support redo functionality
 * 4. Connect to snapshots system
 */

export interface FileState {
  content: string;
  timestamp: Date;
  description: string;
  aiGenerated: boolean;
}

export interface UndoStackEntry {
  id: string;
  filePath: string;
  states: FileState[];
  currentIndex: number;
}

export interface UndoAction {
  type: 'single' | 'batch';
  files: string[];
  description: string;
  timestamp: Date;
  snapshotId?: string;
}

// Global undo stacks per file
const undoStacks: Map<string, UndoStackEntry> = new Map();

// History of AI actions for batch undo
const actionHistory: UndoAction[] = [];
const MAX_HISTORY_SIZE = 50;

/**
 * Initialize or get undo stack for a file
 */
function getOrCreateStack(filePath: string): UndoStackEntry {
  let stack = undoStacks.get(filePath);
  if (!stack) {
    stack = {
      id: `stack-${Date.now()}`,
      filePath,
      states: [],
      currentIndex: -1,
    };
    undoStacks.set(filePath, stack);
  }
  return stack;
}

/**
 * Save current file state to undo stack
 */
export function saveState(
  filePath: string,
  content: string,
  description: string = 'File change',
  aiGenerated: boolean = false
): void {
  const stack = getOrCreateStack(filePath);

  // If we're not at the end of the stack, truncate forward history
  if (stack.currentIndex < stack.states.length - 1) {
    stack.states = stack.states.slice(0, stack.currentIndex + 1);
  }

  // Add new state
  const newState: FileState = {
    content,
    timestamp: new Date(),
    description,
    aiGenerated,
  };

  stack.states.push(newState);
  stack.currentIndex = stack.states.length - 1;

  // Limit stack size to prevent memory issues
  const MAX_STACK_SIZE = 20;
  if (stack.states.length > MAX_STACK_SIZE) {
    stack.states = stack.states.slice(stack.states.length - MAX_STACK_SIZE);
    stack.currentIndex = stack.states.length - 1;
  }
}

/**
 * Save state for multiple files as a batch (for AI changes)
 */
export function saveBatchState(
  files: Array<{ path: string; content: string }>,
  description: string = 'AI changes',
  snapshotId?: string
): void {
  // Save individual file states
  for (const file of files) {
    saveState(file.path, file.content, description, true);
  }

  // Record batch action
  const action: UndoAction = {
    type: 'batch',
    files: files.map(f => f.path),
    description,
    timestamp: new Date(),
    snapshotId,
  };

  actionHistory.push(action);

  // Limit history size
  if (actionHistory.length > MAX_HISTORY_SIZE) {
    actionHistory.shift();
  }
}

/**
 * Undo last change for a file
 */
export function undo(filePath: string): FileState | null {
  const stack = undoStacks.get(filePath);
  if (!stack || stack.currentIndex <= 0) {
    return null;
  }

  stack.currentIndex--;
  return stack.states[stack.currentIndex];
}

/**
 * Redo last undone change for a file
 */
export function redo(filePath: string): FileState | null {
  const stack = undoStacks.get(filePath);
  if (!stack || stack.currentIndex >= stack.states.length - 1) {
    return null;
  }

  stack.currentIndex++;
  return stack.states[stack.currentIndex];
}

/**
 * Check if undo is available for a file
 */
export function canUndo(filePath: string): boolean {
  const stack = undoStacks.get(filePath);
  return stack !== undefined && stack.currentIndex > 0;
}

/**
 * Check if redo is available for a file
 */
export function canRedo(filePath: string): boolean {
  const stack = undoStacks.get(filePath);
  return stack !== undefined && stack.currentIndex < stack.states.length - 1;
}

/**
 * Get current state for a file
 */
export function getCurrentState(filePath: string): FileState | null {
  const stack = undoStacks.get(filePath);
  if (!stack || stack.currentIndex < 0) {
    return null;
  }
  return stack.states[stack.currentIndex];
}

/**
 * Get state history for a file
 */
export function getStateHistory(filePath: string): FileState[] {
  const stack = undoStacks.get(filePath);
  return stack ? [...stack.states] : [];
}

/**
 * Get AI action history
 */
export function getActionHistory(): UndoAction[] {
  return [...actionHistory];
}

/**
 * Get last AI action
 */
export function getLastAIAction(): UndoAction | null {
  for (let i = actionHistory.length - 1; i >= 0; i--) {
    if (actionHistory[i].type === 'batch') {
      return actionHistory[i];
    }
  }
  return null;
}

/**
 * Undo last AI batch action
 * Returns files that were reverted
 */
export function undoLastAIAction(): Array<{ path: string; content: string }> | null {
  const lastAction = getLastAIAction();
  if (!lastAction) return null;

  const revertedFiles: Array<{ path: string; content: string }> = [];

  for (const filePath of lastAction.files) {
    const state = undo(filePath);
    if (state) {
      revertedFiles.push({
        path: filePath,
        content: state.content,
      });
    }
  }

  return revertedFiles;
}

/**
 * Revert to a specific state by index
 */
export function revertToState(
  filePath: string,
  stateIndex: number
): FileState | null {
  const stack = undoStacks.get(filePath);
  if (!stack || stateIndex < 0 || stateIndex >= stack.states.length) {
    return null;
  }

  stack.currentIndex = stateIndex;
  return stack.states[stateIndex];
}

/**
 * Revert to a state by timestamp
 */
export function revertToTimestamp(
  filePath: string,
  timestamp: Date
): FileState | null {
  const stack = undoStacks.get(filePath);
  if (!stack) return null;

  // Find state closest to timestamp
  let closestIndex = 0;
  let closestDiff = Infinity;

  for (let i = 0; i < stack.states.length; i++) {
    const diff = Math.abs(stack.states[i].timestamp.getTime() - timestamp.getTime());
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }

  stack.currentIndex = closestIndex;
  return stack.states[closestIndex];
}

/**
 * Clear undo history for a file
 */
export function clearHistory(filePath: string): void {
  undoStacks.delete(filePath);
}

/**
 * Clear all undo history
 */
export function clearAllHistory(): void {
  undoStacks.clear();
  actionHistory.length = 0;
}

/**
 * Get undo stack statistics
 */
export function getStats(): {
  totalFiles: number;
  totalStates: number;
  aiActions: number;
} {
  let totalStates = 0;
  for (const stack of undoStacks.values()) {
    totalStates += stack.states.length;
  }

  return {
    totalFiles: undoStacks.size,
    totalStates,
    aiActions: actionHistory.length,
  };
}

/**
 * Export current state for persistence
 */
export function exportState(): {
  stacks: Array<{ filePath: string; states: FileState[] }>;
  history: UndoAction[];
} {
  const stacks: Array<{ filePath: string; states: FileState[] }> = [];
  for (const [filePath, stack] of undoStacks) {
    stacks.push({ filePath, states: stack.states });
  }

  return {
    stacks,
    history: actionHistory,
  };
}

/**
 * Import state from persistence
 */
export function importState(data: {
  stacks: Array<{ filePath: string; states: FileState[] }>;
  history: UndoAction[];
}): void {
  clearAllHistory();

  for (const { filePath, states } of data.stacks) {
    const stack: UndoStackEntry = {
      id: `stack-${Date.now()}`,
      filePath,
      states: states.map(s => ({
        ...s,
        timestamp: new Date(s.timestamp),
      })),
      currentIndex: states.length - 1,
    };
    undoStacks.set(filePath, stack);
  }

  for (const action of data.history) {
    actionHistory.push({
      ...action,
      timestamp: new Date(action.timestamp),
    });
  }
}

/**
 * Create a hook-compatible API for React components
 */
export function createUndoHooks(filePath: string) {
  return {
    canUndo: () => canUndo(filePath),
    canRedo: () => canRedo(filePath),
    undo: () => undo(filePath),
    redo: () => redo(filePath),
    save: (content: string, description?: string) =>
      saveState(filePath, content, description),
    getHistory: () => getStateHistory(filePath),
    getCurrent: () => getCurrentState(filePath),
  };
}
