import type {
  AgentProfile,
  Approval,
  InstructionBundle,
  MemoryItem,
  PolicyDecision,
  RunEvent,
  RuntimeEvidence,
  TaskSpec,
} from '@recoder/agent-os';
import type { RuntimePolicy } from '@recoder/agent-runtimes';

/**
 * Typed ports to other subsystems. These are the ONLY way the runtime talks to
 * agent-os/instructions/policy/brain/coordination/governance/memory/mcp/sandbox, keeping
 * the monorepo boundary clean. The runtime depends on interfaces, hosts inject impls.
 */

/** agent-os control plane: read task/bundle/policy; write RunEvents. Never writes task state. */
export interface AgentOsPort {
  resolveTask(taskId: string): Promise<TaskSpec | null>;
  resolveBundle(bundleId: string): Promise<InstructionBundle | null>;
  emitRunEvent(event: RunEvent): Promise<void>;
}

/** agent-instructions: consume a compiled InstructionBundle. */
export interface InstructionsPort {
  getBundle(bundleId: string): Promise<InstructionBundle | null>;
}

/** agent-policy: request decisions (decide upstream; the runtime only enforces). */
export interface PolicyPort {
  decide(input: { task: TaskSpec; profile?: AgentProfile }): Promise<PolicyDecision>;
}

/** brain: optional model/route hints. */
export interface BrainPort {
  modelHint(input: { task: TaskSpec; surface: string }): Promise<{ model?: string; provider?: string } | null>;
}

/** coordination: report progress + handoff events (A2A). */
export interface CoordinationPort {
  reportProgress(event: RunEvent): Promise<void>;
  handoff(input: { taskId: string; toAgentId: string; reason: string }): Promise<void>;
}

/** governance: approval gate + audit hooks. */
export interface GovernancePort {
  requestApproval(input: Omit<Approval, 'approvalId' | 'status' | 'requestedAt'>): Promise<Approval>;
  audit(event: RunEvent): Promise<void>;
}

/** memory: emit reviewable memory candidates with evidence. Never writes durable memory. */
export interface MemoryPort {
  proposeCandidate(candidate: Omit<MemoryItem, 'itemId'> & { evidence: RuntimeEvidence[] }): Promise<void>;
}

/** agent-mcp: pull MCP server/tool config to inject into a CLI's MCP config. */
export interface McpPort {
  resolveMcpConfig(input: { taskId: string; surface: string }): Promise<Record<string, unknown>>;
}

/** agent-sandbox / daytona: provision/exec substrate. Attaches evidence, owns no state. */
export interface SandboxPort {
  exec(input: {
    sandboxId: string;
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
  }): AsyncIterable<{ stream: 'stdout' | 'stderr'; chunk: string }>;
}

export type RuntimeSeams = {
  agentOs?: AgentOsPort;
  instructions?: InstructionsPort;
  policy?: PolicyPort;
  brain?: BrainPort;
  coordination?: CoordinationPort;
  governance?: GovernancePort;
  memory?: MemoryPort;
  mcp?: McpPort;
  sandbox?: SandboxPort;
};

export type { RuntimePolicy };
