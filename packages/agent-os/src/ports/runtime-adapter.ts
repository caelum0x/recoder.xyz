import type { AgentCapability, Approval, InstructionBundle, RunEvent, RuntimeHealth, TaskSpec } from '../domain';

export type RuntimeStartRequest = {
  workspaceId: string;
  repo?: string;
  cwd?: string;
  metadata?: Record<string, unknown>;
};

export type RuntimeTaskRequest = {
  task: TaskSpec;
  bundle: InstructionBundle;
  policy: {
    requireSignedEnvelope: boolean;
    enforceWorkLocks: boolean;
    allowNetwork: boolean;
    allowShell: boolean;
    approvalMode: 'manual' | 'policy' | 'auto';
  };
};

export type RuntimeHandle = {
  runtimeId: string;
  startedAt: string;
  metadata?: Record<string, unknown>;
};

export interface RuntimeAdapterPort {
  id: string;
  health(): Promise<RuntimeHealth>;
  capabilities(): Promise<AgentCapability[]>;
  start?(input: RuntimeStartRequest): Promise<RuntimeHandle>;
  sendTask(input: RuntimeTaskRequest): AsyncIterable<RunEvent>;
  cancel(runId: string): Promise<void>;
  approve?(approvalId: string, decision: Pick<Approval, 'status' | 'decidedBy' | 'decisionReason'>): Promise<void>;
}
