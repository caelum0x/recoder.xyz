/**
 * Giselle Hooks
 *
 * React hooks for managing AI generations, tasks, and workspaces.
 * Adapted from the Giselle workflow system.
 *
 * Key features:
 * - Generation streaming and polling
 * - Task creation and execution
 * - Workspace management
 * - Feature flags system
 * - Nanostore-based reactive state
 */

'use client';

// ============================================================
// Types
// ============================================================

export type {
  // ID Types
  GenerationId,
  TaskId,
  WorkspaceId,
  NodeId,
  // Generation Types
  GenerationStatus,
  GenerationOrigin,
  GenerationContext,
  GenerationError,
  Generation,
  CreatedGeneration,
  QueuedGeneration,
  RunningGeneration,
  CompletedGeneration,
  FailedGeneration,
  CancelledGeneration,
  // UI Message Types
  UIMessage,
  UIMessagePart,
  // Task Types
  Task,
  TaskStatus,
  NodeGenerationIndex,
  // Stream Types
  StreamEndChunk,
  StreamEvent,
  StreamData,
} from './types';

export {
  // ID Generators
  generateGenerationId,
  generateTaskId,
  generateWorkspaceId,
  generateNodeId,
  // Type Guards
  isCreatedGeneration,
  isQueuedGeneration,
  isRunningGeneration,
  isCompletedGeneration,
  isFailedGeneration,
  isCancelledGeneration,
  isStreamEndChunk,
  parseStreamEvent,
} from './types';

// ============================================================
// Generation Store
// ============================================================

export {
  // Atoms
  $generationsById,
  $generationIds,
  $generations,
  $runningGenerations,
  $isAnyGenerating,
  // Actions
  setGenerations,
  addGenerations,
  updateGeneration,
  updateGenerationMessages,
  upsertGenerationMessage,
  removeGeneration,
  clearGenerations,
  getGeneration,
  getGenerationsForNode,
} from './generation-store';

// ============================================================
// Task Store
// ============================================================

export {
  // Atoms
  $tasksById,
  $activeTaskId,
  $taskCreating,
  $currentWorkspaceId,
  $activeTask,
  $tasks,
  $workspaceTasks,
  $runningTasks,
  $isAnyTaskRunning,
  $pendingTasks,
  // Actions
  setCurrentWorkspace,
  setActiveTask,
  setTaskCreating,
  addTask,
  updateTask,
  updateTaskStatus,
  removeTask,
  clearTasks,
  getTask,
  setTasks,
  getTasksByStatus,
  isTaskRunning,
  getWorkspaceInProgressTask,
} from './task-store';

// ============================================================
// Feature Flags Store
// ============================================================

export type {
  GiselleFeatureFlagName,
  GiselleFeatureFlagValues,
  GiselleFeatureFlagConfig,
} from './feature-flags-store';

export {
  // Atoms
  $giselleFeatureFlags,
  $giselleFeatureFlagOverrides,
  $giselleFeatureFlagsInitialized,
  $effectiveGiselleFeatureFlags,
  $webSearchActionEnabled,
  $layoutV3Enabled,
  $stageEnabled,
  $aiGatewayEnabled,
  $streamingEnabled,
  $parallelGenerationEnabled,
  $retryOnFailureEnabled,
  $batchProcessingEnabled,
  // Actions
  initializeGiselleFeatureFlags,
  setGiselleFeatureFlagOverride,
  removeGiselleFeatureFlagOverride,
  clearGiselleFeatureFlagOverrides,
  getGiselleFeatureFlag,
  isGiselleFeatureFlagOverridden,
  resetGiselleFeatureFlags,
  GISELLE_FEATURE_FLAG_CONFIGS,
} from './feature-flags-store';

// ============================================================
// Helpers
// ============================================================

export type {
  GenerationFetcher,
  PollingOptions,
  RetryOptions,
  BatchProcessor,
  TimeoutController,
} from './helpers';

export {
  waitAndGetGenerationCompleted,
  waitAndGetGenerationRunning,
  waitAndGetGenerationFailed,
  arrayEquals,
  dedupeBy,
  withRetry,
  createBatchProcessor,
  createTimeout,
  withTimeout,
} from './helpers';

// ============================================================
// Generation Hooks
// ============================================================

export type {
  GenerationStreamCallbacks,
  UseGenerationStreamOptions,
  UseGenerationStreamResult,
} from './useGenerationStream';

export { useGenerationStream } from './useGenerationStream';

export type {
  GenerationPollingCallbacks,
  UseGenerationPollingOptions,
  UseGenerationPollingResult,
} from './useGenerationPolling';

export { useGenerationPolling } from './useGenerationPolling';

export type {
  CreateGenerationOptions,
  UseNodeGenerationsOptions,
  UseNodeGenerationsResult,
} from './useNodeGenerations';

export { useNodeGenerations } from './useNodeGenerations';

// ============================================================
// Task Hooks
// ============================================================

export type {
  CreateTaskParams,
  TaskExecutionCallbacks,
  UseTaskSystemOptions,
  UseTaskSystemResult,
} from './useTaskSystem';

export { useTaskSystem } from './useTaskSystem';

export type {
  StreamDataEventHandler,
  UseTaskStreamReaderOptions,
  UseTaskStreamReaderResult,
  TaskStreamReaderProps,
} from './useTaskStreamReader';

export { useTaskStreamReader, TaskStreamReader } from './useTaskStreamReader';

// ============================================================
// Workspace Hooks
// ============================================================

export type {
  Workspace,
  WorkspaceNode,
  WorkspaceConnection,
  WorkspaceSettings,
  UseWorkspaceResult,
} from './useWorkspace';

export {
  // Atoms
  $currentWorkspace,
  $workspacesById,
  $workspaceSettings,
  $workspaceLoading,
  $workspaceError,
  $workspaceDirty,
  $workspaces,
  $currentNodes,
  $currentConnections,
  // Actions
  createWorkspace,
  setWorkspace,
  updateWorkspace,
  addNode,
  removeNode,
  addConnection,
  removeConnection,
  deleteWorkspace,
  updateSettings,
  // Hooks
  useWorkspace,
  useWorkspaceId,
  useWorkspaceDirty,
  useWorkspaceSettings,
} from './useWorkspace';

// ============================================================
// Feature Flag Hooks
// ============================================================

export {
  useGiselleFeatureFlags,
  useGiselleFeatureFlag,
  useGiselleFeatureFlagsSubset,
  useWebSearchActionFlag,
  useLayoutV3Flag,
  useStageFlag,
  useAiGatewayFlag,
  useStreamingFlag,
  useParallelGenerationFlag,
  useRetryOnFailureFlag,
  useBatchProcessingFlag,
  useGiselleFeatureFlagInit,
  useGiselleFeatureFlagOverrides,
  useGiselleFeatureFlagConfig,
  useGiselleFeatureFlagStatus,
} from './useGiselleFeatureFlags';
