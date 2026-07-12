import type { TaskRunState } from './task-spec';

export type RunEventType =
  | 'started'
  | 'state_transition'
  | 'log'
  | 'user_message'
  | 'artifact'
  | 'needs_input'
  | 'verified'
  | 'approval_requested'
  | 'handoff'
  | 'failed'
  | 'completed';

export type RunEvent = {
  eventId: string;
  type: RunEventType;
  taskId: string;
  runId?: string;
  agentId?: string;
  state?: TaskRunState;
  message?: string;
  artifactId?: string;
  createdAt: string;
  data?: Record<string, unknown>;
};
