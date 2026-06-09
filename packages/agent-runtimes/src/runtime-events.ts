import type { RunEvent, RunEventType, TaskRunState } from '@recoder/agent-os';

export type RuntimeEventInput = {
  type: RunEventType;
  taskId: string;
  runId?: string;
  agentId?: string;
  state?: TaskRunState;
  message?: string;
  artifactId?: string;
  data?: Record<string, unknown>;
  now?: string;
};

export function runtimeEvent(input: RuntimeEventInput): RunEvent {
  return {
    eventId: `run_evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: input.type,
    taskId: input.taskId,
    runId: input.runId,
    agentId: input.agentId,
    state: input.state,
    message: input.message,
    artifactId: input.artifactId,
    data: input.data,
    createdAt: input.now ?? new Date().toISOString(),
  };
}
