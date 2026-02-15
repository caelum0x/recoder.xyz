/**
 * Checkpoints System
 * Copied from Kilocode - Provides Git-based state snapshots for
 * project versioning and rollback capabilities
 */

import { z } from 'zod';
import { atom, map, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointsService');

// =============================================================================
// Schemas
// =============================================================================

export const CheckpointStatusSchema = z.enum([
  'pending',
  'creating',
  'ready',
  'restoring',
  'failed',
]);

export const CheckpointSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  taskId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  commitHash: z.string().optional(),
  parentCheckpointId: z.string().optional(),
  createdAt: z.string(),
  status: CheckpointStatusSchema,
  error: z.string().optional(),
  filesSnapshot: z.array(z.object({
    path: z.string(),
    hash: z.string(),
    size: z.number(),
  })).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CheckpointDiffSchema = z.object({
  fromCheckpoint: z.string(),
  toCheckpoint: z.string(),
  changes: z.array(z.object({
    path: z.string(),
    type: z.enum(['added', 'modified', 'deleted', 'renamed']),
    oldPath: z.string().optional(),
    additions: z.number(),
    deletions: z.number(),
  })),
  summary: z.object({
    filesChanged: z.number(),
    additions: z.number(),
    deletions: z.number(),
  }),
});

export const CheckpointConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoCheckpoint: z.boolean().default(true),
  autoCheckpointInterval: z.number().default(300000), // 5 minutes
  maxCheckpoints: z.number().default(50),
  shadowRepoPath: z.string().optional(),
});

// =============================================================================
// Types
// =============================================================================

export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type CheckpointDiff = z.infer<typeof CheckpointDiffSchema>;
export type CheckpointConfig = z.infer<typeof CheckpointConfigSchema>;

// =============================================================================
// State
// =============================================================================

export const checkpointsStore = map<Record<string, Checkpoint>>({});
export const checkpointConfigStore = atom<CheckpointConfig>({
  enabled: true,
  autoCheckpoint: true,
  autoCheckpointInterval: 300000,
  maxCheckpoints: 50,
});
export const activeCheckpointId = atom<string | null>(null);
export const isCheckpointOperationInProgress = atom<boolean>(false);
export const checkpointInitialized = atom<boolean>(false);
export const checkpointError = atom<string | null>(null);

// =============================================================================
// Computed State
// =============================================================================

export const sortedCheckpoints = computed(checkpointsStore, (checkpoints) => {
  return Object.values(checkpoints)
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});

export const projectCheckpoints = (projectId: string) =>
  computed(checkpointsStore, (checkpoints) => {
    return Object.values(checkpoints)
      .filter(c => c?.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

export const taskCheckpoints = (taskId: string) =>
  computed(checkpointsStore, (checkpoints) => {
    return Object.values(checkpoints)
      .filter(c => c?.taskId === taskId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

// =============================================================================
// Checkpoint ID Generation
// =============================================================================

/**
 * Create a unique checkpoint ID
 */
export function createCheckpointId(): string {
  return `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a checkpoint name from task description
 */
export function generateCheckpointName(
  description: string,
  index?: number
): string {
  const truncated = description.slice(0, 50).trim();
  const suffix = index !== undefined ? ` (#${index})` : '';
  return `${truncated}${truncated.length < description.length ? '...' : ''}${suffix}`;
}

// =============================================================================
// Checkpoint Creation
// =============================================================================

/**
 * Create a new checkpoint
 */
export function createCheckpoint(
  projectId: string,
  name: string,
  options: {
    taskId?: string;
    description?: string;
    parentCheckpointId?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Checkpoint {
  const id = createCheckpointId();

  const checkpoint: Checkpoint = {
    id,
    projectId,
    taskId: options.taskId,
    name,
    description: options.description,
    parentCheckpointId: options.parentCheckpointId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    metadata: options.metadata,
  };

  checkpointsStore.setKey(id, checkpoint);
  return checkpoint;
}

/**
 * Update checkpoint status
 */
export function updateCheckpointStatus(
  id: string,
  status: CheckpointStatus,
  extra?: Partial<Checkpoint>
): void {
  const checkpoint = checkpointsStore.get()[id];
  if (!checkpoint) return;

  checkpointsStore.setKey(id, {
    ...checkpoint,
    status,
    ...extra,
  });
}

/**
 * Mark checkpoint as ready with commit hash
 */
export function finalizeCheckpoint(
  id: string,
  commitHash: string,
  filesSnapshot?: Checkpoint['filesSnapshot']
): void {
  updateCheckpointStatus(id, 'ready', {
    commitHash,
    filesSnapshot,
  });
}

/**
 * Mark checkpoint as failed
 */
export function failCheckpoint(id: string, error: string): void {
  updateCheckpointStatus(id, 'failed', { error });
}

// =============================================================================
// Checkpoint Retrieval
// =============================================================================

/**
 * Get checkpoint by ID
 */
export function getCheckpoint(id: string): Checkpoint | undefined {
  return checkpointsStore.get()[id];
}

/**
 * Get the active checkpoint
 */
export function getActiveCheckpoint(): Checkpoint | null {
  const id = activeCheckpointId.get();
  if (!id) return null;
  return checkpointsStore.get()[id] || null;
}

/**
 * Get the latest checkpoint for a project
 */
export function getLatestCheckpoint(projectId: string): Checkpoint | undefined {
  const checkpoints = Object.values(checkpointsStore.get())
    .filter(c => c?.projectId === projectId && c?.status === 'ready')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return checkpoints[0];
}

/**
 * Get checkpoints in a chain (parent -> child)
 */
export function getCheckpointChain(checkpointId: string): Checkpoint[] {
  const chain: Checkpoint[] = [];
  let current = getCheckpoint(checkpointId);

  while (current) {
    chain.unshift(current);
    current = current.parentCheckpointId
      ? getCheckpoint(current.parentCheckpointId)
      : undefined;
  }

  return chain;
}

// =============================================================================
// Checkpoint Operations
// =============================================================================

/**
 * Set the active checkpoint
 */
export function setActiveCheckpoint(id: string | null): void {
  activeCheckpointId.set(id);
}

/**
 * Delete a checkpoint
 */
export function deleteCheckpoint(id: string): void {
  const checkpoints = { ...checkpointsStore.get() };
  delete checkpoints[id];
  checkpointsStore.set(checkpoints);

  if (activeCheckpointId.get() === id) {
    activeCheckpointId.set(null);
  }
}

/**
 * Clear old checkpoints (keep most recent N)
 */
export function pruneCheckpoints(projectId: string): number {
  const config = checkpointConfigStore.get();
  const projectCkpts = Object.values(checkpointsStore.get())
    .filter(c => c?.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (projectCkpts.length <= config.maxCheckpoints) {
    return 0;
  }

  const toDelete = projectCkpts.slice(config.maxCheckpoints);
  let deletedCount = 0;

  for (const checkpoint of toDelete) {
    deleteCheckpoint(checkpoint.id);
    deletedCount++;
  }

  return deletedCount;
}

/**
 * Clear all checkpoints for a project
 */
export function clearProjectCheckpoints(projectId: string): number {
  const checkpoints = { ...checkpointsStore.get() };
  let deletedCount = 0;

  for (const [id, checkpoint] of Object.entries(checkpoints)) {
    if (checkpoint?.projectId === projectId) {
      delete checkpoints[id];
      deletedCount++;
    }
  }

  checkpointsStore.set(checkpoints);

  if (activeCheckpointId.get()) {
    const active = getCheckpoint(activeCheckpointId.get()!);
    if (active?.projectId === projectId) {
      activeCheckpointId.set(null);
    }
  }

  return deletedCount;
}

// =============================================================================
// Checkpoint Diff
// =============================================================================

/**
 * Create a diff between two checkpoints
 */
export function createCheckpointDiff(
  fromId: string,
  toId: string,
  changes: CheckpointDiff['changes']
): CheckpointDiff {
  const summary = {
    filesChanged: changes.length,
    additions: changes.reduce((sum, c) => sum + c.additions, 0),
    deletions: changes.reduce((sum, c) => sum + c.deletions, 0),
  };

  return {
    fromCheckpoint: fromId,
    toCheckpoint: toId,
    changes,
    summary,
  };
}

/**
 * Format diff summary for display
 */
export function formatDiffSummary(diff: CheckpointDiff): string {
  const { summary } = diff;
  const parts = [];

  if (summary.filesChanged > 0) {
    parts.push(`${summary.filesChanged} file${summary.filesChanged > 1 ? 's' : ''} changed`);
  }
  if (summary.additions > 0) {
    parts.push(`+${summary.additions}`);
  }
  if (summary.deletions > 0) {
    parts.push(`-${summary.deletions}`);
  }

  return parts.join(', ');
}

// =============================================================================
// Auto-Checkpoint Management
// =============================================================================

let autoCheckpointTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start auto-checkpoint timer
 */
export function startAutoCheckpoint(
  projectId: string,
  createFn: () => Promise<void>
): void {
  const config = checkpointConfigStore.get();

  if (!config.enabled || !config.autoCheckpoint) {
    return;
  }

  stopAutoCheckpoint();

  autoCheckpointTimer = setInterval(async () => {
    if (isCheckpointOperationInProgress.get()) return;

    try {
      isCheckpointOperationInProgress.set(true);
      await createFn();
    } catch (error) {
      logger.error('Auto-checkpoint failed:', error);
    } finally {
      isCheckpointOperationInProgress.set(false);
    }
  }, config.autoCheckpointInterval);
}

/**
 * Stop auto-checkpoint timer
 */
export function stopAutoCheckpoint(): void {
  if (autoCheckpointTimer) {
    clearInterval(autoCheckpointTimer);
    autoCheckpointTimer = null;
  }
}

// =============================================================================
// Checkpoint Initialization
// =============================================================================

/**
 * Initialize checkpoint system
 */
export function initializeCheckpoints(config?: Partial<CheckpointConfig>): void {
  if (config) {
    checkpointConfigStore.set({
      ...checkpointConfigStore.get(),
      ...config,
    });
  }

  checkpointInitialized.set(true);
  checkpointError.set(null);
}

/**
 * Wait for checkpoint initialization with timeout
 */
export async function waitForCheckpointInit(
  timeoutMs: number = 5000
): Promise<boolean> {
  if (checkpointInitialized.get()) return true;

  const startTime = Date.now();

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (checkpointInitialized.get()) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        logger.warn('Checkpoint initialization timeout');
        resolve(false);
      }
    }, 100);
  });
}

// =============================================================================
// UI Helpers
// =============================================================================

/**
 * Get status color for checkpoint
 */
export function getCheckpointStatusColor(status: CheckpointStatus): string {
  switch (status) {
    case 'ready':
      return 'text-green-500';
    case 'creating':
    case 'restoring':
      return 'text-yellow-500';
    case 'failed':
      return 'text-red-500';
    case 'pending':
    default:
      return 'text-gray-500';
  }
}

/**
 * Get status icon for checkpoint
 */
export function getCheckpointStatusIcon(status: CheckpointStatus): string {
  switch (status) {
    case 'ready':
      return 'i-ph:check-circle-fill';
    case 'creating':
    case 'restoring':
      return 'i-ph:spinner animate-spin';
    case 'failed':
      return 'i-ph:warning-circle-fill';
    case 'pending':
    default:
      return 'i-ph:circle-dashed';
  }
}

/**
 * Format checkpoint for display
 */
export function formatCheckpointDisplay(checkpoint: Checkpoint): string {
  const date = new Date(checkpoint.createdAt);
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${checkpoint.name} (${timeStr})`;
}

/**
 * Get relative time string
 */
export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
