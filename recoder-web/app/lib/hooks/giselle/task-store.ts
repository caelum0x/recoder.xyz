/**
 * Task Store
 * Nanostore-based reactive store for managing tasks
 * Adapted from Giselle's Zustand-based store
 */

import { atom, computed, map } from 'nanostores';
import type { Task, TaskId, TaskStatus, WorkspaceId } from './types';

// ============================================================
// Atoms for task state
// ============================================================

/**
 * Map of all tasks by ID for O(1) access
 */
export const $tasksById = map<Record<TaskId, Task>>({});

/**
 * Currently active task (for the current workspace)
 */
export const $activeTaskId = atom<TaskId | null>(null);

/**
 * Flag indicating if a task is being created
 */
export const $taskCreating = atom<boolean>(false);

/**
 * Current workspace ID for task scoping
 */
export const $currentWorkspaceId = atom<WorkspaceId | null>(null);

// ============================================================
// Computed values
// ============================================================

/**
 * Get the currently active task
 */
export const $activeTask = computed(
  [$tasksById, $activeTaskId],
  (byId, activeId) => (activeId ? byId[activeId] : undefined)
);

/**
 * All tasks as an array
 */
export const $tasks = computed($tasksById, (byId) => Object.values(byId));

/**
 * Tasks for the current workspace
 */
export const $workspaceTasks = computed(
  [$tasks, $currentWorkspaceId],
  (tasks, workspaceId) =>
    workspaceId ? tasks.filter((t) => t.workspaceId === workspaceId) : []
);

/**
 * Running tasks
 */
export const $runningTasks = computed($tasks, (tasks) =>
  tasks.filter((t) => t.status === 'running')
);

/**
 * Check if any task is running
 */
export const $isAnyTaskRunning = computed(
  $runningTasks,
  (running) => running.length > 0
);

/**
 * Pending tasks
 */
export const $pendingTasks = computed($tasks, (tasks) =>
  tasks.filter((t) => t.status === 'pending')
);

// ============================================================
// Actions
// ============================================================

/**
 * Set the current workspace ID
 */
export function setCurrentWorkspace(workspaceId: WorkspaceId | null): void {
  $currentWorkspaceId.set(workspaceId);
}

/**
 * Set the active task
 */
export function setActiveTask(task: Task | undefined): void {
  if (task) {
    $tasksById.setKey(task.id, task);
    $activeTaskId.set(task.id);
  } else {
    $activeTaskId.set(null);
  }
}

/**
 * Set the creating flag
 */
export function setTaskCreating(creating: boolean): void {
  $taskCreating.set(creating);
}

/**
 * Add a task to the store
 */
export function addTask(task: Task): void {
  $tasksById.setKey(task.id, task);
}

/**
 * Update a task
 */
export function updateTask(task: Task): void {
  const existing = $tasksById.get()[task.id];
  if (existing) {
    $tasksById.setKey(task.id, { ...existing, ...task });
  } else {
    $tasksById.setKey(task.id, task);
  }
}

/**
 * Update task status
 */
export function updateTaskStatus(
  taskId: TaskId,
  status: TaskStatus,
  metadata?: { startedAt?: number; completedAt?: number; error?: Task['error'] }
): void {
  const task = $tasksById.get()[taskId];
  if (task) {
    $tasksById.setKey(taskId, {
      ...task,
      status,
      ...metadata,
    });
  }
}

/**
 * Remove a task
 */
export function removeTask(taskId: TaskId): void {
  const { [taskId]: removed, ...rest } = $tasksById.get();
  $tasksById.set(rest);

  if ($activeTaskId.get() === taskId) {
    $activeTaskId.set(null);
  }
}

/**
 * Clear all tasks
 */
export function clearTasks(): void {
  $tasksById.set({});
  $activeTaskId.set(null);
}

/**
 * Get a task by ID
 */
export function getTask(taskId: TaskId): Task | undefined {
  return $tasksById.get()[taskId];
}

/**
 * Set multiple tasks at once
 */
export function setTasks(tasks: Task[]): void {
  const byId: Record<TaskId, Task> = {};
  for (const task of tasks) {
    byId[task.id] = task;
  }
  $tasksById.set(byId);
}

/**
 * Get tasks by status
 */
export function getTasksByStatus(status: TaskStatus): Task[] {
  return Object.values($tasksById.get()).filter((t) => t.status === status);
}

/**
 * Check if a specific task is running
 */
export function isTaskRunning(taskId: TaskId): boolean {
  const task = $tasksById.get()[taskId];
  return task?.status === 'running';
}

/**
 * Get in-progress task for a workspace
 */
export function getWorkspaceInProgressTask(
  workspaceId: WorkspaceId
): Task | undefined {
  return Object.values($tasksById.get()).find(
    (t) => t.workspaceId === workspaceId && t.status === 'running'
  );
}
