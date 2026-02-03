/**
 * Action Queue Manager
 *
 * Provides bulletproof action execution with:
 * 1. Sequential queue management with proper ordering
 * 2. Atomic operations with rollback support
 * 3. Per-action timeout handling
 * 4. Status tracking for UI
 * 5. Error recovery without blocking other actions
 */

import { atom, map, type WritableAtom, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ActionQueue');

// ============================================================================
// TYPES
// ============================================================================

export type ActionQueueStatus = 'idle' | 'running' | 'paused' | 'error';

export type QueuedActionStatus =
  | 'pending'      // Waiting in queue
  | 'running'      // Currently executing
  | 'success'      // Completed successfully
  | 'failed'       // Failed with error
  | 'timeout'      // Exceeded timeout
  | 'cancelled'    // Cancelled by user
  | 'rollback'     // Rolling back changes
  | 'rolled_back'; // Changes were rolled back

export interface QueuedAction {
  id: string;
  type: string;
  filePath?: string;
  description: string;
  status: QueuedActionStatus;
  progress: number; // 0-100
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  timeoutMs: number;
  retryCount: number;
  maxRetries: number;
  // For atomic operations
  originalContent?: string;
  canRollback: boolean;
  // Dependencies
  dependsOn?: string[]; // Action IDs this depends on
  blockedBy?: string;   // Action ID currently blocking this
}

export interface ActionGroup {
  id: string;
  name: string;
  actionIds: string[];
  status: QueuedActionStatus;
  atomic: boolean; // If true, rollback all on any failure
}

export interface QueueStats {
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
}

export interface RollbackInfo {
  actionId: string;
  filePath: string;
  originalContent: string;
  timestamp: Date;
}

// ============================================================================
// STORES
// ============================================================================

// Main queue status
export const queueStatus: WritableAtom<ActionQueueStatus> = atom<ActionQueueStatus>('idle');

// All queued actions
export const queuedActions: MapStore<Record<string, QueuedAction>> = map({});

// Action groups for atomic operations
export const actionGroups: MapStore<Record<string, ActionGroup>> = map({});

// Currently running action ID
export const currentActionId: WritableAtom<string | null> = atom<string | null>(null);

// Rollback stack for error recovery
const rollbackStack: RollbackInfo[] = [];

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

let actionQueue: string[] = []; // Action IDs in order
let isProcessing = false;
let processingPromise: Promise<void> | null = null;

/**
 * Generate unique action ID
 */
function generateActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add action to queue
 */
export function enqueueAction(params: {
  type: string;
  filePath?: string;
  description?: string;
  timeoutMs?: number;
  maxRetries?: number;
  dependsOn?: string[];
  groupId?: string;
  originalContent?: string;
}): string {
  const id = generateActionId();

  const action: QueuedAction = {
    id,
    type: params.type,
    filePath: params.filePath,
    description: params.description || `${params.type} action`,
    status: 'pending',
    progress: 0,
    timeoutMs: params.timeoutMs || 30000, // Default 30s timeout
    retryCount: 0,
    maxRetries: params.maxRetries ?? 2,
    originalContent: params.originalContent,
    canRollback: !!params.originalContent,
    dependsOn: params.dependsOn,
  };

  // Add to store
  queuedActions.setKey(id, action);

  // Add to queue
  actionQueue.push(id);

  // Add to group if specified
  if (params.groupId) {
    const group = actionGroups.get()[params.groupId];
    if (group) {
      actionGroups.setKey(params.groupId, {
        ...group,
        actionIds: [...group.actionIds, id],
      });
    }
  }

  logger.debug(`Enqueued action ${id}: ${params.type}`);

  return id;
}

/**
 * Create an action group for atomic operations
 */
export function createActionGroup(params: {
  name: string;
  atomic?: boolean;
}): string {
  const id = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const group: ActionGroup = {
    id,
    name: params.name,
    actionIds: [],
    status: 'pending',
    atomic: params.atomic ?? true,
  };

  actionGroups.setKey(id, group);

  return id;
}

/**
 * Get queue statistics
 */
export function getQueueStats(): QueueStats {
  const actions = Object.values(queuedActions.get());

  return {
    total: actions.length,
    pending: actions.filter(a => a.status === 'pending').length,
    running: actions.filter(a => a.status === 'running').length,
    success: actions.filter(a => a.status === 'success').length,
    failed: actions.filter(a => a.status === 'failed' || a.status === 'timeout').length,
    cancelled: actions.filter(a => a.status === 'cancelled').length,
  };
}

/**
 * Get pending actions in order
 */
export function getPendingActions(): QueuedAction[] {
  const actions = queuedActions.get();
  return actionQueue
    .map(id => actions[id])
    .filter(a => a && a.status === 'pending');
}

/**
 * Check if action can run (dependencies satisfied)
 */
function canActionRun(action: QueuedAction): boolean {
  if (!action.dependsOn || action.dependsOn.length === 0) {
    return true;
  }

  const actions = queuedActions.get();

  for (const depId of action.dependsOn) {
    const dep = actions[depId];
    if (!dep || dep.status !== 'success') {
      // Update blocked status
      if (dep && dep.status === 'running') {
        updateAction(action.id, { blockedBy: depId });
      }
      return false;
    }
  }

  // Clear blocked status
  updateAction(action.id, { blockedBy: undefined });
  return true;
}

// ============================================================================
// ACTION EXECUTION
// ============================================================================

type ActionExecutor = (
  action: QueuedAction,
  updateProgress: (progress: number) => void,
  signal: AbortSignal
) => Promise<void>;

let executor: ActionExecutor | null = null;

/**
 * Set the action executor function
 */
export function setActionExecutor(fn: ActionExecutor): void {
  executor = fn;
}

/**
 * Update action state
 */
export function updateAction(id: string, updates: Partial<QueuedAction>): void {
  const action = queuedActions.get()[id];
  if (action) {
    queuedActions.setKey(id, { ...action, ...updates });
  }
}

/**
 * Start processing the queue
 */
export function startQueue(): void {
  if (isProcessing) return;

  isProcessing = true;
  queueStatus.set('running');
  processingPromise = processQueue();
}

/**
 * Pause queue processing
 */
export function pauseQueue(): void {
  isProcessing = false;
  queueStatus.set('paused');
}

/**
 * Resume queue processing
 */
export function resumeQueue(): void {
  if (isProcessing) return;
  startQueue();
}

/**
 * Process the queue
 */
async function processQueue(): Promise<void> {
  while (isProcessing && actionQueue.length > 0) {
    // Find next runnable action
    const actions = queuedActions.get();
    let nextIndex = -1;

    for (let i = 0; i < actionQueue.length; i++) {
      const action = actions[actionQueue[i]];
      if (action && action.status === 'pending' && canActionRun(action)) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex === -1) {
      // No runnable actions, check if all are done
      const pendingCount = actionQueue.filter(id => {
        const a = actions[id];
        return a && a.status === 'pending';
      }).length;

      if (pendingCount === 0) {
        break;
      }

      // Wait a bit and retry (dependencies might resolve)
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    const actionId = actionQueue[nextIndex];
    const action = actions[actionId];

    if (!action) continue;

    // Execute action
    await executeAction(action);

    // Remove from queue
    actionQueue = actionQueue.filter(id => id !== actionId);
  }

  isProcessing = false;
  queueStatus.set('idle');
}

/**
 * Execute a single action with timeout and error handling
 */
async function executeAction(action: QueuedAction): Promise<void> {
  if (!executor) {
    logger.error('No action executor set');
    updateAction(action.id, {
      status: 'failed',
      error: 'No action executor configured',
    });
    return;
  }

  const abortController = new AbortController();
  let timeoutHandle: NodeJS.Timeout | null = null;

  // Set current action
  currentActionId.set(action.id);

  // Update status
  updateAction(action.id, {
    status: 'running',
    startedAt: new Date(),
    progress: 0,
  });

  // Store original content for rollback
  if (action.originalContent) {
    rollbackStack.push({
      actionId: action.id,
      filePath: action.filePath || '',
      originalContent: action.originalContent,
      timestamp: new Date(),
    });
  }

  try {
    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
        reject(new Error(`Action timed out after ${action.timeoutMs}ms`));
      }, action.timeoutMs);
    });

    // Progress callback
    const updateProgress = (progress: number) => {
      updateAction(action.id, { progress: Math.min(100, Math.max(0, progress)) });
    };

    // Execute with timeout race
    await Promise.race([
      executor(action, updateProgress, abortController.signal),
      timeoutPromise,
    ]);

    // Success
    if (timeoutHandle) clearTimeout(timeoutHandle);

    updateAction(action.id, {
      status: 'success',
      completedAt: new Date(),
      progress: 100,
    });

    logger.info(`Action ${action.id} completed successfully`);

  } catch (error) {
    if (timeoutHandle) clearTimeout(timeoutHandle);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timed out');

    // Check if should retry
    if (action.retryCount < action.maxRetries && !abortController.signal.aborted) {
      logger.warn(`Action ${action.id} failed, retrying (${action.retryCount + 1}/${action.maxRetries})`);

      updateAction(action.id, {
        status: 'pending',
        retryCount: action.retryCount + 1,
        error: undefined,
      });

      // Re-add to queue
      actionQueue.unshift(action.id);
      return;
    }

    // Final failure
    updateAction(action.id, {
      status: isTimeout ? 'timeout' : 'failed',
      completedAt: new Date(),
      error: errorMessage,
    });

    logger.error(`Action ${action.id} failed: ${errorMessage}`);

    // Check if this is part of an atomic group
    await handleGroupFailure(action.id);

  } finally {
    currentActionId.set(null);
  }
}

/**
 * Handle failure in atomic group
 */
async function handleGroupFailure(failedActionId: string): Promise<void> {
  const groups = actionGroups.get();

  for (const [groupId, group] of Object.entries(groups)) {
    if (!group.actionIds.includes(failedActionId)) continue;
    if (!group.atomic) continue;

    logger.warn(`Atomic group ${groupId} failed, rolling back...`);

    // Mark group as failed
    actionGroups.setKey(groupId, { ...group, status: 'failed' });

    // Cancel pending actions in group
    for (const actionId of group.actionIds) {
      const action = queuedActions.get()[actionId];
      if (action && action.status === 'pending') {
        updateAction(actionId, { status: 'cancelled' });
      }
    }

    // Rollback completed actions in group
    for (const actionId of group.actionIds) {
      const action = queuedActions.get()[actionId];
      if (action && action.status === 'success' && action.canRollback) {
        await rollbackAction(actionId);
      }
    }

    break;
  }
}

// ============================================================================
// ROLLBACK
// ============================================================================

/**
 * Rollback a specific action
 */
export async function rollbackAction(actionId: string): Promise<boolean> {
  const action = queuedActions.get()[actionId];
  if (!action) return false;

  // Find rollback info
  const rollbackInfo = rollbackStack.find(r => r.actionId === actionId);
  if (!rollbackInfo) {
    logger.warn(`No rollback info for action ${actionId}`);
    return false;
  }

  updateAction(actionId, { status: 'rollback' });

  try {
    // Emit rollback event for executor to handle
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('action-rollback', {
        detail: {
          actionId,
          filePath: rollbackInfo.filePath,
          originalContent: rollbackInfo.originalContent,
        },
      });
      window.dispatchEvent(event);
    }

    updateAction(actionId, { status: 'rolled_back' });
    logger.info(`Rolled back action ${actionId}`);
    return true;

  } catch (error) {
    logger.error(`Failed to rollback action ${actionId}:`, error);
    updateAction(actionId, { status: 'failed', error: 'Rollback failed' });
    return false;
  }
}

/**
 * Get rollback info for an action
 */
export function getRollbackInfo(actionId: string): RollbackInfo | undefined {
  return rollbackStack.find(r => r.actionId === actionId);
}

/**
 * Check if an action can be rolled back
 */
export function canRollback(actionId: string): boolean {
  const action = queuedActions.get()[actionId];
  if (!action) return false;

  return action.canRollback &&
    (action.status === 'success' || action.status === 'failed') &&
    !!rollbackStack.find(r => r.actionId === actionId);
}

// ============================================================================
// CANCELLATION
// ============================================================================

/**
 * Cancel a specific action
 */
export function cancelAction(actionId: string): boolean {
  const action = queuedActions.get()[actionId];
  if (!action) return false;

  if (action.status === 'pending') {
    updateAction(actionId, { status: 'cancelled' });
    actionQueue = actionQueue.filter(id => id !== actionId);
    return true;
  }

  // Cannot cancel running/completed actions
  return false;
}

/**
 * Cancel all pending actions
 */
export function cancelAllPending(): number {
  let count = 0;
  const actions = queuedActions.get();

  for (const [id, action] of Object.entries(actions)) {
    if (action.status === 'pending') {
      updateAction(id, { status: 'cancelled' });
      count++;
    }
  }

  actionQueue = [];
  return count;
}

// ============================================================================
// RETRY
// ============================================================================

/**
 * Retry a failed action
 */
export function retryAction(actionId: string): boolean {
  const action = queuedActions.get()[actionId];
  if (!action) return false;

  if (action.status === 'failed' || action.status === 'timeout' || action.status === 'cancelled') {
    updateAction(actionId, {
      status: 'pending',
      error: undefined,
      progress: 0,
      retryCount: 0, // Reset retry count for manual retry
    });

    actionQueue.push(actionId);

    // Start queue if not running
    if (!isProcessing) {
      startQueue();
    }

    return true;
  }

  return false;
}

/**
 * Retry all failed actions
 */
export function retryAllFailed(): number {
  let count = 0;
  const actions = queuedActions.get();

  for (const [id, action] of Object.entries(actions)) {
    if (action.status === 'failed' || action.status === 'timeout') {
      if (retryAction(id)) {
        count++;
      }
    }
  }

  return count;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear completed actions from queue
 */
export function clearCompleted(): void {
  const actions = queuedActions.get();

  for (const [id, action] of Object.entries(actions)) {
    if (action.status === 'success' || action.status === 'cancelled' || action.status === 'rolled_back') {
      queuedActions.setKey(id, undefined as any);
    }
  }
}

/**
 * Clear all actions and reset state
 */
export function clearAll(): void {
  pauseQueue();
  actionQueue = [];
  queuedActions.set({});
  actionGroups.set({});
  rollbackStack.length = 0;
  currentActionId.set(null);
  queueStatus.set('idle');
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

export type QueueEventType =
  | 'action-started'
  | 'action-progress'
  | 'action-completed'
  | 'action-failed'
  | 'action-cancelled'
  | 'action-rollback'
  | 'queue-started'
  | 'queue-paused'
  | 'queue-completed';

export interface QueueEvent {
  type: QueueEventType;
  actionId?: string;
  action?: QueuedAction;
  stats?: QueueStats;
}

type QueueEventCallback = (event: QueueEvent) => void;
const eventCallbacks: Set<QueueEventCallback> = new Set();

/**
 * Subscribe to queue events
 */
export function subscribeToQueue(callback: QueueEventCallback): () => void {
  eventCallbacks.add(callback);
  return () => eventCallbacks.delete(callback);
}

/**
 * Emit queue event
 */
function emitQueueEvent(event: QueueEvent): void {
  for (const callback of eventCallbacks) {
    try {
      callback(event);
    } catch (error) {
      logger.error('Queue event callback error:', error);
    }
  }
}

// Set up store subscriptions for events
queueStatus.subscribe((status) => {
  if (status === 'running') {
    emitQueueEvent({ type: 'queue-started', stats: getQueueStats() });
  } else if (status === 'paused') {
    emitQueueEvent({ type: 'queue-paused', stats: getQueueStats() });
  } else if (status === 'idle') {
    emitQueueEvent({ type: 'queue-completed', stats: getQueueStats() });
  }
});

queuedActions.subscribe((actions) => {
  const current = currentActionId.get();
  if (current) {
    const action = actions[current];
    if (action) {
      if (action.status === 'running' && action.progress > 0) {
        emitQueueEvent({
          type: 'action-progress',
          actionId: current,
          action
        });
      }
    }
  }
});
