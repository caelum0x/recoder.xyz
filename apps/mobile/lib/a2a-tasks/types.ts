/**
 * A2A Delegated Task Types
 *
 * Types for the SFA-003 task lifecycle API and SFA-004 approval API.
 * Tasks progress through: submitted -> working -> input-required -> completed | failed | cancelled
 */

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export interface TaskArtifact {
  name?: string;
  type?: string;
  url?: string;
  content?: string;
}

export interface TaskStateEntry {
  state: TaskState;
  timestamp: string;
  message?: string;
}

export interface DelegatedTask {
  id: string;
  title?: string;
  description?: string;
  state: TaskState;
  agentId?: string;
  agentName?: string;
  createdAt: string;
  updatedAt: string;
  stateHistory?: TaskStateEntry[];
  artifacts?: TaskArtifact[];
  metadata?: Record<string, unknown>;
}

export interface TaskListResponse {
  tasks: DelegatedTask[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface TaskDetailResponse extends DelegatedTask {}

export interface TaskApproval {
  taskId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt?: string;
  resolvedAt?: string;
  message?: string;
}

export interface TaskListParams {
  page?: number;
  limit?: number;
  state?: TaskState;
}

/**
 * Activation event names emitted by the mobile task UI
 */
export type MobileTaskEvent =
  | 'mobile_task_list_opened'
  | 'mobile_task_viewed';

export interface MobileTaskEventPayload {
  event: MobileTaskEvent;
  taskId?: string;
  timestamp: string;
}
