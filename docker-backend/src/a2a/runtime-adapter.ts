import type { ApprovalDecision, InstructionBundle } from '@recoder/a2a-sdk';
import type { TaskEnvelope } from '@recoder/shared/a2a';

export interface RuntimeStartInput {
  workspaceId?: string;
  cwd?: string;
}

export interface RuntimeHandle {
  runtimeId: string;
  platform: string;
}

export type RunEvent =
  | { type: 'started'; taskId: string; platform: string }
  | { type: 'log'; taskId: string; level: 'info' | 'warning' | 'error'; message: string }
  | { type: 'artifact'; taskId: string; artifact: { filename: string; content: string } }
  | { type: 'needs_input'; taskId: string; approvalId?: string; message: string }
  | { type: 'verified'; taskId: string; message: string }
  | { type: 'failed'; taskId: string; error: string }
  | { type: 'completed'; taskId: string; resultText?: string };

export interface RuntimeHealthSnapshot {
  healthy: boolean;
  status: string;
  pid: number | null;
  uptime: number | null;
}

export interface AgentRuntimeAdapter {
  id: string;
  platform: string;
  capabilities(): Promise<string[]>;
  health(): Promise<RuntimeHealthSnapshot>;
  start?(input?: RuntimeStartInput): Promise<RuntimeHandle>;
  sendTask(envelope: TaskEnvelope, bundle: InstructionBundle): AsyncIterable<RunEvent>;
  cancel(taskId: string): Promise<void>;
  approve?(approvalId: string, decision: ApprovalDecision): Promise<void>;
}
