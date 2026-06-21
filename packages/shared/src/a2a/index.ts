/**
 * @module @recoder/shared/a2a
 *
 * Shared A2A (Agent-to-Agent) protocol types, enums, and utilities.
 * Used by docker-backend, Spaces, and MCP packages.
 */

// ---------------------------------------------------------------------------
// Task lifecycle
// ---------------------------------------------------------------------------

export enum TaskStateEnum {
  Submitted = 'submitted',
  Working = 'working',
  InputRequired = 'input-required',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export function isTerminalState(state: string): boolean {
  return (
    state === TaskStateEnum.Completed ||
    state === TaskStateEnum.Failed ||
    state === TaskStateEnum.Cancelled
  );
}

export interface TaskEnvelope {
  id: string;
  type: string;
  state: string;
  prompt?: string;
  from: string;
  to?: string;
  result?: string;
  context?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  claimedBy?: string;
  sessionId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent identity & registry
// ---------------------------------------------------------------------------

export type RecoderAgentPlatform =
  | 'claude_code'
  | 'codex'
  | 'cursor'
  | 'windsurf'
  | 'replit'
  | 'recoder_app'
  | 'recoder_agents'
  | 'recoder_pm'
  | 'recoder_agency'
  | 'custom';

export interface RecoderAgentIdentity {
  agentId: string;
  platform: RecoderAgentPlatform;
  sessionId: string;
  userId?: string;
  label?: string;
}

export interface RegisteredAgent {
  agentId: string;
  name: string;
  platform: RecoderAgentPlatform;
  url?: string;
  description?: string;
  version?: string;
  tags?: string[];
  skills?: string[];
  capabilities?: string[];
  tier?: 'tier-1' | 'tier-2' | 'tier-3';
  health?: {
    status: 'healthy' | 'degraded' | 'offline' | 'unknown';
    lastChecked?: string;
    latencyMs?: number;
  };
  registeredAt?: string;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: string;
  taskId: string;
  agentId: string;
  action: string;
  description?: string;
  status: ApprovalStatus;
  requestedAt: string;
  respondedAt?: string;
  respondedBy?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface DispatchRecord {
  taskId: string;
  targetAgentId: string;
  dispatchedAt: string;
  status: 'dispatched' | 'delivered' | 'failed';
  error?: string;
}

// ---------------------------------------------------------------------------
// Worktree
// ---------------------------------------------------------------------------

export type WorktreeStatus = 'active' | 'merged' | 'conflict' | 'removed';

export interface WorktreeInfo {
  id: string;
  projectId: string;
  branch: string;
  path: string;
  status: WorktreeStatus;
  createdAt: string;
  mergedAt?: string;
}

// ---------------------------------------------------------------------------
// Collaboration
// ---------------------------------------------------------------------------

export type CollaborationScope = 'workspace' | 'project' | 'global';

export interface CollaborationChannel {
  id: string;
  name: string;
  scope: CollaborationScope;
  projectId?: string;
  workspaceId?: string;
  memberAgentIds: string[];
  createdAt: string;
}

export interface CollaborationThread {
  id: string;
  channelId: string;
  title?: string;
  createdAt: string;
  lastMessageAt?: string;
}

export interface CollaborationMessage {
  id: string;
  channelId: string;
  threadId?: string;
  from: string;
  text: string;
  mentions?: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface CollaborationService {
  createChannel(params: { name: string; scope: CollaborationScope; projectId?: string; workspaceId?: string; memberAgentIds?: string[] }): CollaborationChannel;
  getChannel(channelId: string): CollaborationChannel | undefined;
  listChannels(scope?: CollaborationScope): CollaborationChannel[];
  sendMessage(channelId: string, from: string, text: string, threadId?: string): CollaborationMessage;
  getMessages(channelId: string, options?: { threadId?: string; limit?: number; before?: string }): CollaborationMessage[];
  createThread(channelId: string, title?: string): CollaborationThread;
  getThreads(channelId: string): CollaborationThread[];
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryCollaborationService implements CollaborationService {
  private channels = new Map<string, CollaborationChannel>();
  private messages = new Map<string, CollaborationMessage[]>();
  private threads = new Map<string, CollaborationThread[]>();
  private counter = 0;

  private nextId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${(++this.counter).toString(36)}`;
  }

  createChannel(params: { name: string; scope: CollaborationScope; projectId?: string; workspaceId?: string; memberAgentIds?: string[] }): CollaborationChannel {
    const channel: CollaborationChannel = {
      id: this.nextId('ch'),
      name: params.name,
      scope: params.scope,
      projectId: params.projectId,
      workspaceId: params.workspaceId,
      memberAgentIds: params.memberAgentIds ?? [],
      createdAt: new Date().toISOString(),
    };
    this.channels.set(channel.id, channel);
    return channel;
  }

  getChannel(channelId: string): CollaborationChannel | undefined {
    return this.channels.get(channelId);
  }

  listChannels(scope?: CollaborationScope): CollaborationChannel[] {
    const all = Array.from(this.channels.values());
    return scope ? all.filter((ch: CollaborationChannel) => ch.scope === scope) : all;
  }

  sendMessage(channelId: string, from: string, text: string, threadId?: string): CollaborationMessage {
    const msg: CollaborationMessage = {
      id: this.nextId('msg'),
      channelId,
      threadId,
      from,
      text,
      createdAt: new Date().toISOString(),
    };
    if (!this.messages.has(channelId)) this.messages.set(channelId, []);
    this.messages.get(channelId)!.push(msg);
    return msg;
  }

  getMessages(channelId: string, options?: { threadId?: string; limit?: number; before?: string }): CollaborationMessage[] {
    let msgs = this.messages.get(channelId) ?? [];
    if (options?.threadId) msgs = msgs.filter((m: CollaborationMessage) => m.threadId === options.threadId);
    if (options?.before) msgs = msgs.filter((m: CollaborationMessage) => m.createdAt < options.before!);
    if (options?.limit) msgs = msgs.slice(-options.limit);
    return msgs;
  }

  createThread(channelId: string, title?: string): CollaborationThread {
    const thread: CollaborationThread = {
      id: this.nextId('thr'),
      channelId,
      title,
      createdAt: new Date().toISOString(),
    };
    if (!this.threads.has(channelId)) this.threads.set(channelId, []);
    this.threads.get(channelId)!.push(thread);
    return thread;
  }

  getThreads(channelId: string): CollaborationThread[] {
    return this.threads.get(channelId) ?? [];
  }
}

// ---------------------------------------------------------------------------
// Persistence adapter
// ---------------------------------------------------------------------------

export class RedisBackedPersistenceAdapter {
  constructor(private redisUrl?: string) {}
  // Placeholder — the actual Redis persistence is in docker-backend
}

// ---------------------------------------------------------------------------
// Envelope converters
// ---------------------------------------------------------------------------

export function envelopeToClaudeCode(envelope: TaskEnvelope): Record<string, unknown> {
  return {
    id: envelope.id,
    type: envelope.type,
    state: envelope.state,
    prompt: envelope.prompt,
    from: envelope.from,
    context: envelope.context,
  };
}

export function claudeCodeToEnvelope(data: Record<string, unknown>): Partial<TaskEnvelope> {
  return {
    id: data['id'] as string,
    type: data['type'] as string,
    state: data['state'] as string,
    result: data['result'] as string | undefined,
    from: data['from'] as string,
  };
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export enum A2AErrorCodeEnum {
  InvalidEnvelope = 'INVALID_ENVELOPE',
  TaskNotFound = 'TASK_NOT_FOUND',
  AgentNotFound = 'AGENT_NOT_FOUND',
  Unauthorized = 'UNAUTHORIZED',
  DispatchFailed = 'DISPATCH_FAILED',
  Timeout = 'TIMEOUT',
}

export interface A2AStructuredError {
  code: A2AErrorCodeEnum;
  message: string;
  taskId?: string;
  details?: Record<string, unknown>;
}

export const INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT: A2AStructuredError = {
  code: A2AErrorCodeEnum.InvalidEnvelope,
  message: 'Invalid A2A task envelope',
};
