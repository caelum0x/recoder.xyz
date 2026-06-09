import type {
  AgentCapability,
  AgentSurface,
  Approval,
  InstructionBundle,
  RunEvent,
  RuntimeHealth,
  TaskSpec,
} from '@recoder/agent-os';

export type RuntimePolicy = {
  requireSignedEnvelope: boolean;
  enforceWorkLocks: boolean;
  allowNetwork: boolean;
  allowShell: boolean;
  approvalMode: 'manual' | 'policy' | 'auto';
};

export type RuntimeHandle = {
  runtimeId: string;
  startedAt: string;
  metadata?: Record<string, unknown>;
};

export type RuntimeStartInput = {
  workspaceId: string;
  repo?: string;
  cwd?: string;
  metadata?: Record<string, unknown>;
};

export type RuntimeTaskInput = {
  task: TaskSpec;
  bundle: InstructionBundle;
  policy: RuntimePolicy;
};

export interface AgentRuntimeAdapter {
  id: string;
  kind:
    | AgentSurface
    | 'browser_agent';

  health(): Promise<RuntimeHealth>;
  capabilities(): Promise<AgentCapability[]>;

  start?(input: RuntimeStartInput): Promise<RuntimeHandle>;
  sendTask(input: RuntimeTaskInput): AsyncIterable<RunEvent>;
  cancel(runId: string): Promise<void>;
  approve?(approvalId: string, decision: Pick<Approval, 'status' | 'decidedBy' | 'decisionReason'>): Promise<void>;
}

export async function collectRuntimeEvents(iterable: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

export function createRuntimeEvent(input: Omit<RunEvent, 'eventId' | 'createdAt'> & { eventId?: string; createdAt?: string }): RunEvent {
  return {
    eventId: input.eventId ?? `run_evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...input,
  };
}

export * from './runtime-errors';
export * from './runtime-events';
export * from './adapters';
