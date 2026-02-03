/**
 * Workflow Hooks
 *
 * React hooks for managing AI workflow generations, tasks, and workspaces.
 * Adapted from the Giselle workflow system with nanostore-based reactive state.
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
  ConnectionId,
  // Generation Types
  GenerationStatus,
  GenerationOrigin,
  NodeContentType,
  OperationNode,
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
  UIMessagePartType,
  // Task Types
  Task,
  TaskStatus,
  NodeGenerationIndex,
  // Stream Types
  StreamEndChunk,
  StreamEvent,
  StreamEventType,
  StreamData,
  // Workspace Types
  WorkspaceNode,
  WorkspaceConnection,
  Workspace,
  WorkspaceSettings,
} from './types';

export {
  // ID Generators
  generateGenerationId,
  generateTaskId,
  generateWorkspaceId,
  generateNodeId,
  generateConnectionId,
  // Type Guards
  isCreatedGeneration,
  isQueuedGeneration,
  isRunningGeneration,
  isCompletedGeneration,
  isFailedGeneration,
  isCancelledGeneration,
  isTerminalGeneration,
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
  $activeGenerationCount,
  $generationStopHandlers,
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
  addStopHandler,
  removeStopHandler,
  callStopHandler,
} from './generation-store';

// ============================================================
// Task Store
// ============================================================

export {
  // Atoms
  $tasksById,
  $taskIds,
  $activeTaskId,
  $taskCreating,
  $currentWorkspaceId,
  $activeTask,
  $tasks,
  $workspaceTasks,
  $runningTasks,
  $isAnyTaskRunning,
  $pendingTasks,
  $completedTasks,
  $failedTasks,
  // Actions
  setCurrentWorkspace,
  setActiveTask,
  setTaskCreating,
  addTask,
  addTasks,
  updateTask,
  updateTaskStatus,
  removeTask,
  clearTasks,
  getTask,
  setTasks,
  getTasksByStatus,
  isTaskRunning,
  getWorkspaceInProgressTask,
  getWorkspaceTasks,
} from './task-store';

// ============================================================
// Workspace Store
// ============================================================

export {
  // Atoms
  $currentWorkspace,
  $workspacesById,
  $workspaceSettings,
  $workspaceLoading,
  $workspaceError,
  $workspaceDirty,
  $selectedNodeIds,
  $selectedConnectionIds,
  // Computed
  $workspaces,
  $currentNodes,
  $currentConnections,
  $nodesById,
  $connectionsById,
  $selectedNodes,
  $selectedConnections,
  // Actions
  createWorkspace,
  setCurrentWorkspace as setWorkspace,
  loadWorkspace,
  updateWorkspace,
  renameWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  addNode,
  addNodes,
  updateNode,
  removeNode,
  removeNodes,
  addConnection,
  removeConnection,
  removeConnectionsForNode,
  selectNode,
  deselectNode,
  selectConnection,
  deselectConnection,
  clearSelection,
  selectAllNodes,
  updateSettings,
  resetSettings,
  markWorkspaceSaved,
  markWorkspaceDirty,
  setWorkspaceLoading,
  setWorkspaceError,
  clearWorkspaces,
  getNodeConnections,
} from './workspace-store';

// ============================================================
// Feature Flags Store
// ============================================================

export type {
  WorkflowFeatureFlagName,
  WorkflowFeatureFlagValues,
  WorkflowFeatureFlagConfig,
} from './feature-flags-store';

export {
  // Atoms
  $workflowFeatureFlags,
  $workflowFeatureFlagOverrides,
  $workflowFeatureFlagsInitialized,
  $workflowFeatureFlagsLoading,
  $effectiveWorkflowFeatureFlags,
  // Individual flags
  $streamingEnabled,
  $parallelGenerationEnabled,
  $retryOnFailureEnabled,
  $batchProcessingEnabled,
  $messageQueueEnabled,
  $taskPollingEnabled,
  $taskStreamingEnabled,
  $autoResumeEnabled,
  $progressIndicatorEnabled,
  $detailedErrorsEnabled,
  $generationHistoryEnabled,
  $aiGatewayEnabled,
  $webSearchActionEnabled,
  $imageGenerationEnabled,
  $dataStoreEnabled,
  // Category-based flags
  $generationFeatureFlags,
  $taskFeatureFlags,
  $uiFeatureFlags,
  $experimentalFeatureFlags,
  // Actions
  initializeWorkflowFeatureFlags,
  setWorkflowFeatureFlagOverride,
  removeWorkflowFeatureFlagOverride,
  clearWorkflowFeatureFlagOverrides,
  getWorkflowFeatureFlag,
  isWorkflowFeatureFlagOverridden,
  resetWorkflowFeatureFlags,
  getWorkflowFeatureFlagsByCategory,
  WORKFLOW_FEATURE_FLAG_CONFIGS,
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
  wait,
  exponentialBackoff,
  waitAndGetGenerationCompleted,
  waitAndGetGenerationRunning,
  waitAndGetGenerationFailed,
  waitAndGetGenerationTerminal,
  arrayEquals,
  dedupeBy,
  chunk,
  withRetry,
  withRetryJitter,
  createBatchProcessor,
  createTimeout,
  withTimeout,
  debounce,
  throttle,
  deepMerge,
  omit,
  pick,
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

export type { UseWorkspaceResult } from './useWorkspace';

export {
  useWorkspace,
  useWorkspaceId,
  useWorkspaceDirty,
  useWorkspaceSettings,
  useWorkspaceLoading,
  useWorkspaceError,
  useSelectedNodeIds,
  useSelectedConnectionIds,
  useNode,
  useConnection,
} from './useWorkspace';

// ============================================================
// Feature Flag Hooks
// ============================================================

export {
  useWorkflowFeatureFlags,
  useWorkflowFeatureFlag,
  useWorkflowFeatureFlagsSubset,
  useGenerationFeatureFlags,
  useTaskFeatureFlags,
  useUIFeatureFlags,
  useExperimentalFeatureFlags,
  useStreamingFlag,
  useParallelGenerationFlag,
  useRetryOnFailureFlag,
  useBatchProcessingFlag,
  useMessageQueueFlag,
  useTaskPollingFlag,
  useTaskStreamingFlag,
  useAutoResumeFlag,
  useProgressIndicatorFlag,
  useDetailedErrorsFlag,
  useGenerationHistoryFlag,
  useAiGatewayFlag,
  useWebSearchActionFlag,
  useImageGenerationFlag,
  useDataStoreFlag,
  useWorkflowFeatureFlagInit,
  useWorkflowFeatureFlagOverrides,
  useWorkflowFeatureFlagConfig,
  useAllWorkflowFeatureFlagConfigs,
  useWorkflowFeatureFlagStatus,
} from './useFeatureFlags';
