/**
 * Task Store
 * Nanostore-based reactive store for managing workflow tasks
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
 * Ordered list of task IDs (most recent first)
 */
export const $taskIds = atom<TaskId[]>([]);

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
export const $tasks = computed([$tasksById, $taskIds], (byId, ids) =>
  ids.map((id) => byId[id]).filter(Boolean) as Task[]
);

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

/**
 * Completed tasks
 */
export const $completedTasks = computed($tasks, (tasks) =>
  tasks.filter((t) => t.status === 'completed')
);

/**
 * Failed tasks
 */
export const $failedTasks = computed($tasks, (tasks) =>
  tasks.filter((t) => t.status === 'failed')
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
    // Make sure task is in store
    const existing = $tasksById.get()[task.id];
    if (!existing) {
      addTask(task);
    } else {
      $tasksById.setKey(task.id, task);
    }
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
  const currentIds = $taskIds.get();

  if (!$tasksById.get()[task.id]) {
    $taskIds.set([task.id, ...currentIds]);
  }

  $tasksById.setKey(task.id, task);
}

/**
 * Add multiple tasks
 */
export function addTasks(tasks: Task[]): void {
  const currentIds = $taskIds.get();
  const currentById = $tasksById.get();
  const newIds: TaskId[] = [];
  const newById = { ...currentById };

  for (const task of tasks) {
    newById[task.id] = task;
    if (!currentById[task.id]) {
      newIds.push(task.id);
    }
  }

  $tasksById.set(newById);
  $taskIds.set([...newIds, ...currentIds.filter((id) => !newIds.includes(id))]);
}

/**
 * Update a task
 */
export function updateTask(task: Task): void {
  const existing = $tasksById.get()[task.id];
  if (existing) {
    $tasksById.setKey(task.id, { ...existing, ...task });
  } else {
    addTask(task);
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
  $taskIds.set($taskIds.get().filter((id) => id !== taskId));

  if ($activeTaskId.get() === taskId) {
    $activeTaskId.set(null);
  }
}

/**
 * Clear all tasks
 */
export function clearTasks(): void {
  $tasksById.set({});
  $taskIds.set([]);
  $activeTaskId.set(null);
}

/**
 * Get a task by ID
 */
export function getTask(taskId: TaskId): Task | undefined {
  return $tasksById.get()[taskId];
}

/**
 * Set multiple tasks at once (replaces all)
 */
export function setTasks(tasks: Task[]): void {
  const byId: Record<TaskId, Task> = {};
  const ids: TaskId[] = [];

  // Sort by createdAt descending
  const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt);

  for (const task of sorted) {
    byId[task.id] = task;
    ids.push(task.id);
  }

  $tasksById.set(byId);
  $taskIds.set(ids);
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
    (t) =>
      t.workspaceId === workspaceId &&
      (t.status === 'running' || t.status === 'pending')
  );
}

/**
 * Get all tasks for a workspace
 */
export function getWorkspaceTasks(workspaceId: WorkspaceId): Task[] {
  return Object.values($tasksById.get())
    .filter((t) => t.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
