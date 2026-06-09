import type { TaskRun } from '../domain';

export type WorkflowSignal = {
  type: 'approve' | 'reject' | 'cancel' | 'resume' | 'input';
  payload?: Record<string, unknown>;
};

export interface WorkflowDriverPort<TDefinition = unknown> {
  start(definition: TDefinition): Promise<TaskRun>;
  signal(runId: string, signal: WorkflowSignal): Promise<void>;
  cancel(runId: string): Promise<void>;
}
