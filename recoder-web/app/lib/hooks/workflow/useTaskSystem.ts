/**
 * useTaskSystem Hook
 * Manages task creation, execution, and polling for a workspace
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type {
  Task,
  TaskId,
  WorkspaceId,
  Generation,
  GenerationId,
  NodeId,
  NodeGenerationIndex,
} from './types';
import { generateTaskId } from './types';
import {
  $activeTask,
  $taskCreating,
  $workspaceTasks,
  setActiveTask,
  setTaskCreating,
  setCurrentWorkspace,
  addTask,
  updateTaskStatus,
} from './task-store';
import { addGenerations } from './generation-store';
import { $taskPollingEnabled, $autoResumeEnabled } from './feature-flags-store';
import { useGenerationPolling } from './useGenerationPolling';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('TaskSystem');

// ============================================================
// Types
// ============================================================

export interface CreateTaskParams {
  /** Node to start execution from */
  nodeId: NodeId;
  /** Connection IDs to follow */
  connectionIds?: string[];
  /** Initial inputs for the task */
  inputs?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface TaskExecutionCallbacks {
  /** Called when task starts */
  onTaskStart?: (options: {
    cancel: () => Promise<void>;
    taskId: TaskId;
  }) => void;
  /** Called when task completes */
  onTaskComplete?: (options: {
    hasError: boolean;
    duration: number;
    taskId: TaskId;
  }) => void;
  /** Called when a generation starts */
  onGenerationStarted?: (generation: Generation) => void;
  /** Called when a generation completes */
  onGenerationCompleted?: (generation: Generation) => void;
  /** Called when a generation fails */
  onGenerationFailed?: (generation: Generation) => void;
}

export interface UseTaskSystemOptions {
  /** Polling interval for task status (ms) */
  pollingInterval?: number;
  /** Auto-resume in-progress tasks on mount */
  autoResume?: boolean;
  /** API base endpoint */
  apiEndpoint?: string;
}

export interface UseTaskSystemResult {
  /** Currently active task */
  activeTask: Task | undefined;
  /** Whether a task is being created */
  creating: boolean;
  /** All tasks for the current workspace */
  tasks: Task[];
  /** Create and start a new task */
  createAndStartTask: (
    params: CreateTaskParams,
    callbacks?: TaskExecutionCallbacks
  ) => Promise<void>;
  /** Cancel the active task */
  cancelTask: () => Promise<void>;
  /** Refresh task status */
  refreshTaskStatus: (taskId: TaskId) => Promise<Task | null>;
  /** Get task by ID */
  getTask: (taskId: TaskId) => Task | undefined;
}

// ============================================================
// API Helpers
// ============================================================

async function fetchInProgressTask(
  workspaceId: WorkspaceId,
  apiEndpoint: string
): Promise<Task | undefined> {
  try {
    const response = await fetch(
      `${apiEndpoint}/tasks/in-progress?workspaceId=${workspaceId}`
    );
    if (!response.ok) {
      if (response.status === 404) return undefined;
      throw new Error(`Failed to fetch in-progress task: ${response.status}`);
    }
    const data = (await response.json()) as Record<string, any>;
    return data.task;
  } catch (err) {
    logger.error('Error fetching in-progress task:', err);
    return undefined;
  }
}

async function fetchTaskGenerationIndexes(
  taskId: TaskId,
  apiEndpoint: string
): Promise<{ task: Task; generationIndexes?: NodeGenerationIndex[] }> {
  const response = await fetch(`${apiEndpoint}/tasks/${taskId}/generations`);
  if (!response.ok) {
    throw new Error(`Failed to fetch task generations: ${response.status}`);
  }
  return response.json();
}

async function fetchGeneration(
  generationId: GenerationId,
  apiEndpoint: string
): Promise<Generation | undefined> {
  try {
    const response = await fetch(`${apiEndpoint}/generation/${generationId}`);
    if (!response.ok) {
      if (response.status === 404) return undefined;
      throw new Error(`Failed to fetch generation: ${response.status}`);
    }
    const data = (await response.json()) as Record<string, any>;
    return data.generation;
  } catch (err) {
    logger.error('Error fetching generation:', err);
    return undefined;
  }
}

async function createTaskOnServer(
  workspaceId: WorkspaceId,
  params: CreateTaskParams,
  apiEndpoint: string
): Promise<{ task: Task; generations: Generation[] }> {
  const response = await fetch(`${apiEndpoint}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId,
      nodeId: params.nodeId,
      connectionIds: params.connectionIds,
      inputs: params.inputs,
      metadata: params.metadata,
      generationOriginType: 'studio',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create task: ${response.status}`);
  }

  return response.json();
}

async function startTaskOnServer(
  taskId: TaskId,
  apiEndpoint: string
): Promise<void> {
  const response = await fetch(`${apiEndpoint}/tasks/${taskId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationOriginType: 'studio' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start task: ${response.status}`);
  }
}

async function cancelTaskOnServer(
  taskId: TaskId,
  apiEndpoint: string
): Promise<void> {
  const response = await fetch(`${apiEndpoint}/tasks/${taskId}/cancel`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to cancel task: ${response.status}`);
  }
}

// ============================================================
// Hook Implementation
// ============================================================

export function useTaskSystem(
  workspaceId: WorkspaceId,
  options: UseTaskSystemOptions = {}
): UseTaskSystemResult {
  const {
    pollingInterval = 5000,
    autoResume: autoResumeOption,
    apiEndpoint = '/api',
  } = options;

  // Feature flags
  const taskPollingEnabled = useStore($taskPollingEnabled);
  const autoResumeFlag = useStore($autoResumeEnabled);

  // Use option if provided, otherwise use feature flag
  const autoResume = autoResumeOption ?? autoResumeFlag;

  const activeTask = useStore($activeTask);
  const creating = useStore($taskCreating);
  const tasks = useStore($workspaceTasks);

  const [initialized, setInitialized] = useState(false);

  const pollingRef = useRef(false);
  const cancelledRef = useRef(false);
  const prevGenerationIndexMap = useRef(
    new Map<string, NodeGenerationIndex>()
  );

  const { stopPolling: stopGenerationPolling } = useGenerationPolling();

  // Set current workspace on mount
  useEffect(() => {
    setCurrentWorkspace(workspaceId);
    return () => setCurrentWorkspace(null);
  }, [workspaceId]);

  /**
   * Poll for task generation updates
   */
  const pollingTaskGenerations = useCallback(
    async (
      taskId: TaskId,
      callbacks?: TaskExecutionCallbacks
    ): Promise<void> => {
      if (!taskPollingEnabled) return;

      pollingRef.current = true;
      cancelledRef.current = false;
      prevGenerationIndexMap.current.clear();

      const startTime = Date.now();
      let hasError = false;

      while (pollingRef.current && !cancelledRef.current) {
        try {
          const { task, generationIndexes } =
            await fetchTaskGenerationIndexes(taskId, apiEndpoint);

          // Find changed generations
          const changedIndexes =
            generationIndexes?.filter((idx) => {
              const prev = prevGenerationIndexMap.current.get(idx.id);
              return prev === undefined || prev.status !== idx.status;
            }) ?? [];

          // Fetch full generation data for changed ones
          const changedGenerations = await Promise.all(
            changedIndexes.map((idx) => fetchGeneration(idx.id, apiEndpoint))
          ).then((results) => results.filter(Boolean) as Generation[]);

          // Update store and track previous states
          if (changedGenerations.length > 0) {
            addGenerations(changedGenerations);

            for (const gen of changedGenerations) {
              if (gen.status === 'running') {
                callbacks?.onGenerationStarted?.(gen);
              } else if (gen.status === 'completed') {
                callbacks?.onGenerationCompleted?.(gen);
              } else if (gen.status === 'failed') {
                hasError = true;
                callbacks?.onGenerationFailed?.(gen);
              }
            }
          }

          for (const idx of changedIndexes) {
            prevGenerationIndexMap.current.set(idx.id, idx);
          }

          // Check for task completion
          if (
            task.status === 'completed' ||
            task.status === 'failed' ||
            task.status === 'cancelled'
          ) {
            pollingRef.current = false;
            updateTaskStatus(taskId, task.status, {
              completedAt: Date.now(),
            });

            if (task.status === 'failed') {
              hasError = true;
            }

            callbacks?.onTaskComplete?.({
              hasError,
              duration: Date.now() - startTime,
              taskId,
            });
            return;
          }

          await new Promise((r) => setTimeout(r, pollingInterval));
        } catch (err) {
          logger.error('Error polling task generations:', err);
          await new Promise((r) => setTimeout(r, pollingInterval));
        }
      }
    },
    [taskPollingEnabled, pollingInterval, apiEndpoint]
  );

  /**
   * Create and start a new task
   */
  const createAndStartTask = useCallback(
    async (
      params: CreateTaskParams,
      callbacks?: TaskExecutionCallbacks
    ): Promise<void> => {
      setTaskCreating(true);

      try {
        // Create task on server
        const { task, generations } = await createTaskOnServer(
          workspaceId,
          params,
          apiEndpoint
        );

        // Update local state
        addTask(task);
        setActiveTask(task);
        addGenerations(generations);

        // Provide cancel callback
        callbacks?.onTaskStart?.({
          cancel: async () => {
            await cancelTaskOnServer(task.id, apiEndpoint);
            cancelledRef.current = true;
            pollingRef.current = false;
            stopGenerationPolling();
          },
          taskId: task.id,
        });

        // Start task execution
        await startTaskOnServer(task.id, apiEndpoint);
        updateTaskStatus(task.id, 'running', { startedAt: Date.now() });

        // Start polling
        await pollingTaskGenerations(task.id, callbacks);
      } catch (err) {
        logger.error('Error creating/starting task:', err);
        throw err;
      } finally {
        setTaskCreating(false);
      }
    },
    [
      workspaceId,
      apiEndpoint,
      pollingTaskGenerations,
      stopGenerationPolling,
    ]
  );

  /**
   * Cancel the active task
   */
  const cancelTask = useCallback(async (): Promise<void> => {
    if (!activeTask) return;

    pollingRef.current = false;
    cancelledRef.current = true;

    try {
      await cancelTaskOnServer(activeTask.id, apiEndpoint);
      updateTaskStatus(activeTask.id, 'cancelled', {
        completedAt: Date.now(),
      });
    } catch (err) {
      logger.error('Error cancelling task:', err);
    }
  }, [activeTask, apiEndpoint]);

  /**
   * Refresh task status from server
   */
  const refreshTaskStatus = useCallback(
    async (taskId: TaskId): Promise<Task | null> => {
      try {
        const { task } = await fetchTaskGenerationIndexes(taskId, apiEndpoint);
        updateTaskStatus(taskId, task.status, {
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        });
        return task;
      } catch (err) {
        logger.error('Error refreshing task status:', err);
        return null;
      }
    },
    [apiEndpoint]
  );

  /**
   * Get task by ID
   */
  const getTask = useCallback(
    (taskId: TaskId): Task | undefined => {
      return tasks.find((t) => t.id === taskId);
    },
    [tasks]
  );

  // Auto-resume in-progress tasks on mount
  useEffect(() => {
    if (initialized || !autoResume) return;
    setInitialized(true);

    (async () => {
      const inProgress = await fetchInProgressTask(workspaceId, apiEndpoint);
      if (inProgress) {
        addTask(inProgress);
        setActiveTask(inProgress);
        pollingTaskGenerations(inProgress.id);
      }
    })();
  }, [
    workspaceId,
    apiEndpoint,
    autoResume,
    initialized,
    pollingTaskGenerations,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false;
    };
  }, []);

  return {
    activeTask,
    creating,
    tasks,
    createAndStartTask,
    cancelTask,
    refreshTaskStatus,
    getTask,
  };
}
