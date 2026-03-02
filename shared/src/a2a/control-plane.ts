import {
  claudeCodeToEnvelope,
  codexToEnvelope,
  envelopeToClaudeCode,
  envelopeToCodex,
} from './bridge';
import type {
  ClaudeCodeWireMessage,
  CodexWireMessage,
  RecoderA2AEnvelope,
  RecoderAgentCard,
  RecoderAgentIdentity,
  RecoderAgentPlatform,
} from './types';

export type A2AProtocolKind = 'a2a' | 'mcp' | 'jsonrpc' | 'rest' | 'file_git';
export type ConnectorTier = 'tier1' | 'tier2';
export type ConnectorStatus = 'supported' | 'experimental' | 'backlog';

export interface RegisteredAgent {
  identity: RecoderAgentIdentity;
  card: RecoderAgentCard;
  protocol: A2AProtocolKind;
  tier: ConnectorTier;
  status: ConnectorStatus;
  tags: string[];
}

export interface AgentDiscoveryQuery {
  protocol?: A2AProtocolKind;
  platform?: RecoderAgentPlatform;
  tier?: ConnectorTier;
  status?: ConnectorStatus;
  skillTag?: string;
}

export class InMemoryAgentRegistry {
  private readonly agents = new Map<string, RegisteredAgent>();

  register(agent: RegisteredAgent): void {
    this.agents.set(agent.identity.id, agent);
  }

  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  list(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  discover(query: AgentDiscoveryQuery = {}): RegisteredAgent[] {
    return this.list().filter((agent) => {
      if (query.protocol && agent.protocol !== query.protocol) return false;
      if (query.platform && agent.identity.platform !== query.platform) return false;
      if (query.tier && agent.tier !== query.tier) return false;
      if (query.status && agent.status !== query.status) return false;
      if (query.skillTag) {
        const inCard = agent.card.skills.some((skill) => skill.tags.includes(query.skillTag!));
        const inTags = agent.tags.includes(query.skillTag);
        if (!inCard && !inTags) return false;
      }
      return true;
    });
  }
}

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskEventKind =
  | 'task.submitted'
  | 'task.started'
  | 'task.progress'
  | 'task.input-required'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'policy.checked';

export interface TaskEvent {
  id: string;
  taskId: string;
  kind: TaskEventKind;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface TaskStore {
  create(task: A2ATask): A2ATask;
  get(taskId: string): A2ATask | undefined;
  update(taskId: string, patch: Partial<A2ATask>): A2ATask;
  listByThread(threadId: string): A2ATask[];
  appendEvent(event: TaskEvent): void;
  getEvents(taskId: string): TaskEvent[];
}

export interface AuditEntry {
  id: string;
  connectorId: string;
  taskId?: string;
  kind: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface AuditLogService {
  append(entry: AuditEntry): void;
  list(): AuditEntry[];
  listByTask(taskId: string): AuditEntry[];
  listByConnector(connectorId: string): AuditEntry[];
}

export class InMemoryAuditLogService implements AuditLogService {
  private readonly entries: AuditEntry[] = [];

  append(entry: AuditEntry): void {
    this.entries.push(entry);
  }

  list(): AuditEntry[] {
    return [...this.entries];
  }

  listByTask(taskId: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.taskId === taskId);
  }

  listByConnector(connectorId: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.connectorId === connectorId);
  }
}

export type CollaborationScope = 'channel' | 'dm';

export interface CollaborationChannel {
  id: string;
  scope: CollaborationScope;
  name: string;
  createdAt: string;
  memberAgentIds: string[];
}

export interface CollaborationThread {
  id: string;
  channelId: string;
  title: string;
  createdAt: string;
}

export interface CollaborationMessage {
  id: string;
  threadId: string;
  senderAgentId: string;
  text: string;
  createdAt: string;
}

export interface CollaborationService {
  createChannel(input: {
    id: string;
    scope: CollaborationScope;
    name: string;
    memberAgentIds: string[];
  }): CollaborationChannel;
  createThread(input: { id: string; channelId: string; title: string }): CollaborationThread;
  sendMessage(input: {
    id: string;
    threadId: string;
    senderAgentId: string;
    text: string;
  }): CollaborationMessage;
  listChannels(): CollaborationChannel[];
  listThreads(channelId: string): CollaborationThread[];
  listMessages(threadId: string): CollaborationMessage[];
}

export class InMemoryCollaborationService implements CollaborationService {
  private readonly channels = new Map<string, CollaborationChannel>();
  private readonly threads = new Map<string, CollaborationThread>();
  private readonly messages = new Map<string, CollaborationMessage[]>();

  createChannel(input: {
    id: string;
    scope: CollaborationScope;
    name: string;
    memberAgentIds: string[];
  }): CollaborationChannel {
    const channel: CollaborationChannel = {
      id: input.id,
      scope: input.scope,
      name: input.name,
      memberAgentIds: [...input.memberAgentIds],
      createdAt: new Date().toISOString(),
    };
    this.channels.set(channel.id, channel);
    return channel;
  }

  createThread(input: { id: string; channelId: string; title: string }): CollaborationThread {
    const channel = this.channels.get(input.channelId);
    if (!channel) throw new Error(`Channel not found: ${input.channelId}`);
    const thread: CollaborationThread = {
      id: input.id,
      channelId: input.channelId,
      title: input.title,
      createdAt: new Date().toISOString(),
    };
    this.threads.set(thread.id, thread);
    return thread;
  }

  sendMessage(input: {
    id: string;
    threadId: string;
    senderAgentId: string;
    text: string;
  }): CollaborationMessage {
    const thread = this.threads.get(input.threadId);
    if (!thread) throw new Error(`Thread not found: ${input.threadId}`);
    const channel = this.channels.get(thread.channelId);
    if (!channel) throw new Error(`Channel not found: ${thread.channelId}`);
    if (!channel.memberAgentIds.includes(input.senderAgentId)) {
      throw new Error(`Sender ${input.senderAgentId} is not a member of channel ${thread.channelId}`);
    }

    const message: CollaborationMessage = {
      id: input.id,
      threadId: input.threadId,
      senderAgentId: input.senderAgentId,
      text: input.text,
      createdAt: new Date().toISOString(),
    };
    const list = this.messages.get(input.threadId) ?? [];
    list.push(message);
    this.messages.set(input.threadId, list);
    return message;
  }

  listChannels(): CollaborationChannel[] {
    return [...this.channels.values()];
  }

  listThreads(channelId: string): CollaborationThread[] {
    return [...this.threads.values()].filter((thread) => thread.channelId === channelId);
  }

  listMessages(threadId: string): CollaborationMessage[] {
    return [...(this.messages.get(threadId) ?? [])];
  }
}

export interface A2ATask {
  id: string;
  threadId: string;
  createdAt: string;
  updatedAt: string;
  requester: RecoderAgentIdentity;
  assignee: RecoderAgentIdentity;
  state: TaskState;
  prompt: string;
  envelope?: RecoderA2AEnvelope;
  resultText?: string;
  error?: string;
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, A2ATask>();
  private readonly events = new Map<string, TaskEvent[]>();

  create(task: A2ATask): A2ATask {
    this.tasks.set(task.id, task);
    return task;
  }

  get(taskId: string): A2ATask | undefined {
    return this.tasks.get(taskId);
  }

  update(taskId: string, patch: Partial<A2ATask>): A2ATask {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const next: A2ATask = {
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    this.tasks.set(taskId, next);
    return next;
  }

  listByThread(threadId: string): A2ATask[] {
    return [...this.tasks.values()].filter((task) => task.threadId === threadId);
  }

  appendEvent(event: TaskEvent): void {
    const list = this.events.get(event.taskId) ?? [];
    list.push(event);
    this.events.set(event.taskId, list);
  }

  getEvents(taskId: string): TaskEvent[] {
    return this.events.get(taskId) ?? [];
  }
}

export type PolicyAction =
  | 'file:read'
  | 'file:write'
  | 'file:delete'
  | 'bash:exec'
  | 'network:call'
  | 'git:push'
  | 'env:access';

export type PolicyRule = 'auto' | 'prompt' | 'deny';

export interface PolicyDecision {
  action: PolicyAction;
  approved: boolean;
  reason: string;
  rule: PolicyRule;
}

export type PolicyPromptHandler = (input: {
  agentId: string;
  action: PolicyAction;
  details: Record<string, unknown>;
}) => Promise<boolean>;

export class UnifiedPolicyPlane {
  private readonly rules = new Map<string, Map<PolicyAction, PolicyRule>>();
  private readonly handlers = new Map<string, PolicyPromptHandler>();

  setRule(agentId: string, action: PolicyAction, rule: PolicyRule): void {
    const actionRules = this.rules.get(agentId) ?? new Map<PolicyAction, PolicyRule>();
    actionRules.set(action, rule);
    this.rules.set(agentId, actionRules);
  }

  setPromptHandler(agentId: string, handler: PolicyPromptHandler): void {
    this.handlers.set(agentId, handler);
  }

  async check(
    agentId: string,
    action: PolicyAction,
    details: Record<string, unknown> = {}
  ): Promise<PolicyDecision> {
    const actionRules = this.rules.get(agentId);
    const rule = actionRules?.get(action) ?? 'prompt';

    if (rule === 'auto') {
      return { action, approved: true, reason: 'Auto-approved by policy rule', rule };
    }
    if (rule === 'deny') {
      return { action, approved: false, reason: 'Denied by policy rule', rule };
    }

    const handler = this.handlers.get(agentId);
    if (!handler) {
      return { action, approved: false, reason: 'Prompt rule but no handler configured', rule };
    }

    const approved = await handler({ agentId, action, details });
    return {
      action,
      approved,
      reason: approved ? 'Approved by prompt handler' : 'Rejected by prompt handler',
      rule,
    };
  }
}

export interface ConnectorTaskRequest {
  taskId: string;
  threadId: string;
  prompt: string;
  requester: RecoderAgentIdentity;
  assignee: RecoderAgentIdentity;
}

export interface ConnectorTaskResult {
  state: TaskState;
  resultText?: string;
  raw?: unknown;
}

export interface ConnectorCapability {
  id: string;
  name: string;
  description: string;
}

export type ConnectorContextScope = 'workspace' | 'selection' | 'thread' | 'task';

export interface ConnectorContextSnapshot {
  scope: ConnectorContextScope;
  metadata: Record<string, unknown>;
}

export interface TaskUpdate {
  taskId: string;
  state: TaskState;
  message?: string;
  raw?: unknown;
}

export interface ConnectorAuditEvent {
  connectorId: string;
  taskId: string;
  kind: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export type ConnectorAction = string;

export interface ConnectorAdapter {
  readonly platform: RecoderAgentPlatform;
  readonly protocol: A2AProtocolKind;
  discoverCapabilities(): Promise<ConnectorCapability[]>;
  executeTask(request: ConnectorTaskRequest): Promise<ConnectorTaskResult>;
  streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate>;
  cancelTask(taskId: string): Promise<boolean>;
  extractContext(scope: ConnectorContextScope): Promise<ConnectorContextSnapshot>;
  mapPlatformActionToPolicyAction(action: ConnectorAction): PolicyAction | undefined;
  emitAuditEvent(event: ConnectorAuditEvent): Promise<void>;
}

export interface CodexRpcClient {
  sendTask(payload: {
    id: string;
    sessionId: string;
    message: CodexWireMessage;
  }): Promise<{ status: 'completed' | 'working' | 'failed'; output?: string; error?: string }>;
}

export interface ClaudeMcpClient {
  callTool(payload: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{ content?: string; error?: string }>;
}

export class CodexConnectorAdapter implements ConnectorAdapter {
  readonly platform: RecoderAgentPlatform = 'codex';
  readonly protocol: A2AProtocolKind = 'jsonrpc';
  private readonly taskStates = new Map<string, TaskState>();

  constructor(
    private readonly rpcClient: CodexRpcClient,
    private readonly auditSink?: (event: ConnectorAuditEvent) => void | Promise<void>
  ) {}

  async discoverCapabilities(): Promise<ConnectorCapability[]> {
    return [
      {
        id: 'code-generation',
        name: 'Code Generation',
        description: 'Generate and refactor code via Codex JSON-RPC task execution',
      },
      {
        id: 'task-lifecycle',
        name: 'Task Lifecycle',
        description: 'Submit and track task state transitions through Codex runtime',
      },
    ];
  }

  async executeTask(request: ConnectorTaskRequest): Promise<ConnectorTaskResult> {
    this.taskStates.set(request.taskId, 'working');
    const envelope = codexToEnvelope({
      message: { role: 'user', content: request.prompt },
      from: request.requester,
      to: request.assignee,
      messageId: request.taskId,
      threadId: request.threadId,
    });

    const wire = envelopeToCodex(envelope);
    const response = await this.rpcClient.sendTask({
      id: request.taskId,
      sessionId: request.threadId,
      message: wire,
    });

    if (response.status === 'failed') {
      this.taskStates.set(request.taskId, 'failed');
      return { state: 'failed', resultText: response.error ?? 'Codex task failed', raw: response };
    }

    if (response.status === 'working') {
      this.taskStates.set(request.taskId, 'working');
      return { state: 'working', resultText: response.output, raw: response };
    }

    this.taskStates.set(request.taskId, 'completed');
    return { state: 'completed', resultText: response.output, raw: response };
  }

  async *streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate> {
    const state = this.taskStates.get(taskId);
    if (!state) return;
    yield { taskId, state };
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const current = this.taskStates.get(taskId);
    if (!current || current === 'completed' || current === 'failed' || current === 'cancelled') {
      return false;
    }
    this.taskStates.set(taskId, 'cancelled');
    return true;
  }

  async extractContext(scope: ConnectorContextScope): Promise<ConnectorContextSnapshot> {
    return {
      scope,
      metadata: {
        platform: this.platform,
        protocol: this.protocol,
      },
    };
  }

  mapPlatformActionToPolicyAction(action: ConnectorAction): PolicyAction | undefined {
    const table: Record<string, PolicyAction> = {
      'fs.read': 'file:read',
      'fs.write': 'file:write',
      'fs.delete': 'file:delete',
      'shell.exec': 'bash:exec',
      'net.request': 'network:call',
      'git.push': 'git:push',
      'env.read': 'env:access',
    };
    return table[action];
  }

  async emitAuditEvent(event: ConnectorAuditEvent): Promise<void> {
    if (this.auditSink) {
      await this.auditSink(event);
    }
  }
}

export class ClaudeConnectorAdapter implements ConnectorAdapter {
  readonly platform: RecoderAgentPlatform = 'claude_code';
  readonly protocol: A2AProtocolKind = 'mcp';
  private readonly taskStates = new Map<string, TaskState>();

  constructor(
    private readonly mcpClient: ClaudeMcpClient,
    private readonly auditSink?: (event: ConnectorAuditEvent) => void | Promise<void>
  ) {}

  async discoverCapabilities(): Promise<ConnectorCapability[]> {
    return [
      {
        id: 'mcp-tool-exec',
        name: 'MCP Tool Execution',
        description: 'Execute Claude Code tool calls over MCP transport',
      },
      {
        id: 'architecture-review',
        name: 'Architecture and Review',
        description: 'Produce architecture guidance and code-review outputs',
      },
    ];
  }

  async executeTask(request: ConnectorTaskRequest): Promise<ConnectorTaskResult> {
    this.taskStates.set(request.taskId, 'working');
    const envelope = claudeCodeToEnvelope({
      message: { role: 'user', content: request.prompt },
      from: request.requester,
      to: request.assignee,
      messageId: request.taskId,
      threadId: request.threadId,
    });

    const wire = envelopeToClaudeCode(envelope);
    const promptText =
      typeof wire.content === 'string'
        ? wire.content
        : wire.content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n');

    const response = await this.mcpClient.callTool({
      name: 'default',
      arguments: { prompt: promptText },
    });

    if (response.error) {
      this.taskStates.set(request.taskId, 'failed');
      return { state: 'failed', resultText: response.error, raw: response };
    }

    this.taskStates.set(request.taskId, 'completed');
    return { state: 'completed', resultText: response.content ?? '', raw: response };
  }

  async *streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate> {
    const state = this.taskStates.get(taskId);
    if (!state) return;
    yield { taskId, state };
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const current = this.taskStates.get(taskId);
    if (!current || current === 'completed' || current === 'failed' || current === 'cancelled') {
      return false;
    }
    this.taskStates.set(taskId, 'cancelled');
    return true;
  }

  async extractContext(scope: ConnectorContextScope): Promise<ConnectorContextSnapshot> {
    return {
      scope,
      metadata: {
        platform: this.platform,
        protocol: this.protocol,
      },
    };
  }

  mapPlatformActionToPolicyAction(action: ConnectorAction): PolicyAction | undefined {
    const table: Record<string, PolicyAction> = {
      Read: 'file:read',
      Write: 'file:write',
      Edit: 'file:write',
      Bash: 'bash:exec',
      WebFetch: 'network:call',
      Env: 'env:access',
    };
    return table[action];
  }

  async emitAuditEvent(event: ConnectorAuditEvent): Promise<void> {
    if (this.auditSink) {
      await this.auditSink(event);
    }
  }
}

export interface SubmitTaskInput {
  taskId: string;
  threadId: string;
  requesterId: string;
  assigneeId: string;
  prompt: string;
  requiredAction?: PolicyAction;
  policyDetails?: Record<string, unknown>;
  platformAction?: ConnectorAction;
}

export class A2AControlPlane {
  private readonly connectors = new Map<string, ConnectorAdapter>();

  constructor(
    private readonly registry: InMemoryAgentRegistry,
    private readonly taskStore: TaskStore,
    private readonly policy: UnifiedPolicyPlane,
    private readonly auditLog: AuditLogService = new InMemoryAuditLogService(),
    private readonly collaboration: CollaborationService = new InMemoryCollaborationService()
  ) {}

  attachConnector(agentId: string, connector: ConnectorAdapter): void {
    this.connectors.set(agentId, connector);
  }

  async discoverCapabilities(agentId: string): Promise<ConnectorCapability[]> {
    const connector = this.connectors.get(agentId);
    if (!connector) throw new Error(`No connector attached for agent: ${agentId}`);
    return connector.discoverCapabilities();
  }

  async extractConnectorContext(
    agentId: string,
    scope: ConnectorContextScope
  ): Promise<ConnectorContextSnapshot> {
    const connector = this.connectors.get(agentId);
    if (!connector) throw new Error(`No connector attached for agent: ${agentId}`);
    return connector.extractContext(scope);
  }

  streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate> {
    const task = this.taskStore.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const connector = this.connectors.get(task.assignee.id);
    if (!connector) throw new Error(`No connector attached for assignee: ${task.assignee.id}`);
    return connector.streamTaskUpdates(taskId);
  }

  async cancelTask(taskId: string): Promise<A2ATask> {
    const task = this.taskStore.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const connector = this.connectors.get(task.assignee.id);
    if (!connector) throw new Error(`No connector attached for assignee: ${task.assignee.id}`);

    const cancelled = await connector.cancelTask(taskId);
    if (!cancelled) {
      return task;
    }

    const now = new Date().toISOString();
    this.taskStore.appendEvent({
      id: `${taskId}:cancelled`,
      taskId,
      kind: 'task.cancelled',
      createdAt: now,
      details: { platform: connector.platform },
    });
    await this.emitConnectorAudit(connector, {
      connectorId: task.assignee.id,
      taskId,
      kind: 'task.cancelled',
      createdAt: now,
      details: { platform: connector.platform },
    });

    return this.taskStore.update(taskId, { state: 'cancelled' });
  }

  getAuditEntries(taskId?: string): AuditEntry[] {
    if (!taskId) return this.auditLog.list();
    return this.auditLog.listByTask(taskId);
  }

  createChannel(input: {
    id: string;
    scope: CollaborationScope;
    name: string;
    memberAgentIds: string[];
  }): CollaborationChannel {
    return this.collaboration.createChannel(input);
  }

  createThread(input: { id: string; channelId: string; title: string }): CollaborationThread {
    return this.collaboration.createThread(input);
  }

  postMessage(input: {
    id: string;
    threadId: string;
    senderAgentId: string;
    text: string;
  }): CollaborationMessage {
    return this.collaboration.sendMessage(input);
  }

  listChannelThreads(channelId: string): CollaborationThread[] {
    return this.collaboration.listThreads(channelId);
  }

  listThreadMessages(threadId: string): CollaborationMessage[] {
    return this.collaboration.listMessages(threadId);
  }

  private async emitConnectorAudit(
    connector: ConnectorAdapter,
    event: ConnectorAuditEvent
  ): Promise<void> {
    this.auditLog.append({
      id: `${event.taskId ?? 'global'}:${event.kind}:${event.createdAt}`,
      connectorId: event.connectorId,
      taskId: event.taskId,
      kind: event.kind,
      createdAt: event.createdAt,
      details: event.details,
    });
    await connector.emitAuditEvent(event);
  }

  async submitTask(input: SubmitTaskInput): Promise<A2ATask> {
    const requester = this.registry.get(input.requesterId);
    if (!requester) throw new Error(`Requester is not registered: ${input.requesterId}`);

    const assignee = this.registry.get(input.assigneeId);
    if (!assignee) throw new Error(`Assignee is not registered: ${input.assigneeId}`);

    const now = new Date().toISOString();
    const baseTask: A2ATask = {
      id: input.taskId,
      threadId: input.threadId,
      createdAt: now,
      updatedAt: now,
      requester: requester.identity,
      assignee: assignee.identity,
      state: 'submitted',
      prompt: input.prompt,
    };

    this.taskStore.create(baseTask);
    this.taskStore.appendEvent({
      id: `${input.taskId}:submitted`,
      taskId: input.taskId,
      kind: 'task.submitted',
      createdAt: now,
      details: { requesterId: input.requesterId, assigneeId: input.assigneeId },
    });

    const connector = this.connectors.get(input.assigneeId);
    if (!connector) {
      return this.taskStore.update(input.taskId, {
        state: 'failed',
        error: `No connector attached for assignee: ${input.assigneeId}`,
      });
    }

    await this.emitConnectorAudit(connector, {
      connectorId: input.assigneeId,
      taskId: input.taskId,
      kind: 'task.submitted',
      createdAt: now,
      details: { requesterId: input.requesterId, assigneeId: input.assigneeId },
    });

    const effectiveRequiredAction =
      input.requiredAction ??
      (input.platformAction ? connector.mapPlatformActionToPolicyAction(input.platformAction) : undefined);

    if (effectiveRequiredAction) {
      const decision = await this.policy.check(input.assigneeId, effectiveRequiredAction, input.policyDetails ?? {});
      const decisionDetails: Record<string, unknown> = {
        action: decision.action,
        approved: decision.approved,
        reason: decision.reason,
        rule: decision.rule,
      };
      this.taskStore.appendEvent({
        id: `${input.taskId}:policy`,
        taskId: input.taskId,
        kind: 'policy.checked',
        createdAt: new Date().toISOString(),
        details: decisionDetails,
      });
      await this.emitConnectorAudit(connector, {
        connectorId: input.assigneeId,
        taskId: input.taskId,
        kind: 'policy.checked',
        createdAt: new Date().toISOString(),
        details: decisionDetails,
      });
      if (!decision.approved) {
        this.taskStore.appendEvent({
          id: `${input.taskId}:failed`,
          taskId: input.taskId,
          kind: 'task.failed',
          createdAt: new Date().toISOString(),
          details: { platform: connector.platform, reason: decision.reason },
        });
        return this.taskStore.update(input.taskId, {
          state: 'failed',
          error: `Policy denied action ${effectiveRequiredAction}: ${decision.reason}`,
        });
      }
    }

    this.taskStore.update(input.taskId, { state: 'working' });
    const startedAt = new Date().toISOString();
    this.taskStore.appendEvent({
      id: `${input.taskId}:started`,
      taskId: input.taskId,
      kind: 'task.started',
      createdAt: startedAt,
      details: { platform: connector.platform, protocol: connector.protocol },
    });
    await this.emitConnectorAudit(connector, {
      connectorId: input.assigneeId,
      taskId: input.taskId,
      kind: 'task.started',
      createdAt: startedAt,
      details: { platform: connector.platform, protocol: connector.protocol },
    });

    const result = await connector.executeTask({
      taskId: input.taskId,
      threadId: input.threadId,
      prompt: input.prompt,
      requester: requester.identity,
      assignee: assignee.identity,
    });

    if (result.state === 'completed') {
      const completedAt = new Date().toISOString();
      this.taskStore.appendEvent({
        id: `${input.taskId}:completed`,
        taskId: input.taskId,
        kind: 'task.completed',
        createdAt: completedAt,
        details: { platform: connector.platform },
      });
      await this.emitConnectorAudit(connector, {
        connectorId: input.assigneeId,
        taskId: input.taskId,
        kind: 'task.completed',
        createdAt: completedAt,
        details: { platform: connector.platform },
      });
      return this.taskStore.update(input.taskId, {
        state: 'completed',
        resultText: result.resultText,
      });
    }

    if (result.state === 'working') {
      const progressAt = new Date().toISOString();
      this.taskStore.appendEvent({
        id: `${input.taskId}:progress`,
        taskId: input.taskId,
        kind: 'task.progress',
        createdAt: progressAt,
        details: { platform: connector.platform },
      });
      await this.emitConnectorAudit(connector, {
        connectorId: input.assigneeId,
        taskId: input.taskId,
        kind: 'task.progress',
        createdAt: progressAt,
        details: { platform: connector.platform },
      });
      return this.taskStore.update(input.taskId, {
        state: 'working',
        resultText: result.resultText,
      });
    }

    const failedAt = new Date().toISOString();
    this.taskStore.appendEvent({
      id: `${input.taskId}:failed`,
      taskId: input.taskId,
      kind: 'task.failed',
      createdAt: failedAt,
      details: { platform: connector.platform },
    });
    await this.emitConnectorAudit(connector, {
      connectorId: input.assigneeId,
      taskId: input.taskId,
      kind: 'task.failed',
      createdAt: failedAt,
      details: { platform: connector.platform },
    });
    return this.taskStore.update(input.taskId, {
      state: 'failed',
      error: result.resultText ?? 'Connector returned failed state',
    });
  }
}
