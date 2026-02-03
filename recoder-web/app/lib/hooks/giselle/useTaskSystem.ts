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
import { useGenerationPolling } from './useGenerationPolling';

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
}

export interface TaskExecutionCallbacks {
  onTaskStart?: (options: { cancel: () => Promise<void>; taskId: TaskId }) => void;
  onTaskComplete?: (options: { hasError: boolean; duration: number; taskId: TaskId }) => void;
  onGenerationStarted?: (generation: Generation) => void;
  onGenerationCompleted?: (generation: Generation) => void;
  onGenerationFailed?: (generation: Generation) => void;
}

export interface UseTaskSystemOptions {
  /** Polling interval for task status (ms) */
  pollingInterval?: number;
  /** Auto-resume in-progress tasks on mount */
  autoResume?: boolean;
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
}

// ============================================================
// API Helpers
// ============================================================

async function fetchInProgressTask(
  workspaceId: WorkspaceId
): Promise<Task | undefined> {
  try {
    const response = await fetch(
      `/api/tasks/in-progress?workspaceId=${workspaceId}`
    );
    if (!response.ok) {
      if (response.status === 404) return undefined;
      throw new Error(`Failed to fetch in-progress task: ${response.status}`);
    }
    const data = (await response.json()) as Record<string, any>;
    return data.task;
  } catch (err) {
    console.error('Error fetching in-progress task:', err);
    return undefined;
  }
}

async function fetchTaskGenerationIndexes(
  taskId: TaskId
): Promise<{ task: Task; generationIndexes?: NodeGenerationIndex[] }> {
  const response = await fetch(`/api/tasks/${taskId}/generations`);
  if (!response.ok) {
    throw new Error(`Failed to fetch task generations: ${response.status}`);
  }
  return response.json();
}

async function fetchGeneration(
  generationId: GenerationId
): Promise<Generation | undefined> {
  try {
    const response = await fetch(`/api/generation/${generationId}`);
    if (!response.ok) {
      if (response.status === 404) return undefined;
      throw new Error(`Failed to fetch generation: ${response.status}`);
    }
    const data = (await response.json()) as Record<string, any>;
    return data.generation;
  } catch (err) {
    console.error('Error fetching generation:', err);
    return undefined;
  }
}

async function createTaskOnServer(
  workspaceId: WorkspaceId,
  params: CreateTaskParams
): Promise<{ task: Task; generations: Generation[] }> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId,
      nodeId: params.nodeId,
      connectionIds: params.connectionIds,
      inputs: params.inputs,
      generationOriginType: 'studio',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create task: ${response.status}`);
  }

  return response.json();
}

async function startTaskOnServer(taskId: TaskId): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationOriginType: 'studio' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start task: ${response.status}`);
  }
}

async function cancelTaskOnServer(taskId: TaskId): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/cancel`, {
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
  const { pollingInterval = 5000, autoResume = true } = options;

  const activeTask = useStore($activeTask);
  const creating = useStore($taskCreating);
  const tasks = useStore($workspaceTasks);

  const [initialized, setInitialized] = useState(false);

  const pollingRef = useRef(false);
  const cancelledRef = useRef(false);
  const prevGenerationIndexMap = useRef(new Map<string, NodeGenerationIndex>());

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
      pollingRef.current = true;
      cancelledRef.current = false;
      prevGenerationIndexMap.current.clear();

      const startTime = Date.now();
      let hasError = false;

      while (pollingRef.current && !cancelledRef.current) {
        try {
          const { task, generationIndexes } =
            await fetchTaskGenerationIndexes(taskId);

          // Find changed generations
          const changedIndexes =
            generationIndexes?.filter((idx) => {
              const prev = prevGenerationIndexMap.current.get(idx.id);
              return prev === undefined || prev.status !== idx.status;
            }) ?? [];

          // Fetch full generation data for changed ones
          const changedGenerations = await Promise.all(
            changedIndexes.map((idx) => fetchGeneration(idx.id))
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
          console.error('Error polling task generations:', err);
          await new Promise((r) => setTimeout(r, pollingInterval));
        }
      }
    },
    [pollingInterval]
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
          params
        );

        // Update local state
        addTask(task);
        setActiveTask(task);
        addGenerations(generations);

        // Provide cancel callback
        callbacks?.onTaskStart?.({
          cancel: async () => {
            await cancelTaskOnServer(task.id);
            cancelledRef.current = true;
            pollingRef.current = false;
            stopGenerationPolling();
          },
          taskId: task.id,
        });

        // Start task execution
        await startTaskOnServer(task.id);
        updateTaskStatus(task.id, 'running', { startedAt: Date.now() });

        // Start polling
        await pollingTaskGenerations(task.id, callbacks);
      } catch (err) {
        console.error('Error creating/starting task:', err);
        throw err;
      } finally {
        setTaskCreating(false);
      }
    },
    [workspaceId, pollingTaskGenerations, stopGenerationPolling]
  );

  /**
   * Cancel the active task
   */
  const cancelTask = useCallback(async (): Promise<void> => {
    if (!activeTask) return;

    pollingRef.current = false;
    cancelledRef.current = true;

    try {
      await cancelTaskOnServer(activeTask.id);
      updateTaskStatus(activeTask.id, 'cancelled', {
        completedAt: Date.now(),
      });
    } catch (err) {
      console.error('Error cancelling task:', err);
    }
  }, [activeTask]);

  /**
   * Refresh task status from server
   */
  const refreshTaskStatus = useCallback(
    async (taskId: TaskId): Promise<Task | null> => {
      try {
        const { task } = await fetchTaskGenerationIndexes(taskId);
        updateTaskStatus(taskId, task.status, {
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        });
        return task;
      } catch (err) {
        console.error('Error refreshing task status:', err);
        return null;
      }
    },
    []
  );

  // Auto-resume in-progress tasks on mount
  useEffect(() => {
    if (initialized || !autoResume) return;
    setInitialized(true);

    (async () => {
      const inProgress = await fetchInProgressTask(workspaceId);
      if (inProgress) {
        addTask(inProgress);
        setActiveTask(inProgress);
        pollingTaskGenerations(inProgress.id);
      }
    })();
  }, [workspaceId, autoResume, initialized, pollingTaskGenerations]);

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
  };
}
