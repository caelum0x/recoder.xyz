import type { CodexWireMessage, RecoderAgentCard, RecoderAgentIdentity, RecoderAgentPlatform } from './types';
import type { A2ATask } from './task-convergence';
export type { A2ATask } from './task-convergence';
export { a2aTaskToEnvelope, envelopeToA2ATask, agentIdentityToRef, agentRefToIdentity, } from './task-convergence';
export type { A2ATaskToEnvelopeOptions } from './task-convergence';
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
export declare class InMemoryAgentRegistry {
    private readonly agents;
    register(agent: RegisteredAgent): void;
    unregister(agentId: string): boolean;
    get(agentId: string): RegisteredAgent | undefined;
    list(): RegisteredAgent[];
    discover(query?: AgentDiscoveryQuery): RegisteredAgent[];
}
export type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'cancelled';
export type TaskEventKind = 'task.submitted' | 'task.started' | 'task.progress' | 'task.input-required' | 'task.completed' | 'task.failed' | 'task.cancelled' | 'policy.checked';
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
export declare class InMemoryAuditLogService implements AuditLogService {
    private readonly entries;
    append(entry: AuditEntry): void;
    list(): AuditEntry[];
    listByTask(taskId: string): AuditEntry[];
    listByConnector(connectorId: string): AuditEntry[];
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
    createThread(input: {
        id: string;
        channelId: string;
        title: string;
    }): CollaborationThread;
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
export declare class InMemoryCollaborationService implements CollaborationService {
    private readonly channels;
    private readonly threads;
    private readonly messages;
    createChannel(input: {
        id: string;
        scope: CollaborationScope;
        name: string;
        memberAgentIds: string[];
    }): CollaborationChannel;
    createThread(input: {
        id: string;
        channelId: string;
        title: string;
    }): CollaborationThread;
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
export declare class InMemoryTaskStore implements TaskStore {
    private readonly tasks;
    private readonly events;
    create(task: A2ATask): A2ATask;
    get(taskId: string): A2ATask | undefined;
    update(taskId: string, patch: Partial<A2ATask>): A2ATask;
    listByThread(threadId: string): A2ATask[];
    appendEvent(event: TaskEvent): void;
    getEvents(taskId: string): TaskEvent[];
}
export type PolicyAction = 'file:read' | 'file:write' | 'file:delete' | 'bash:exec' | 'network:call' | 'git:push' | 'env:access';
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
export declare class UnifiedPolicyPlane {
    private readonly rules;
    private readonly handlers;
    setRule(agentId: string, action: PolicyAction, rule: PolicyRule): void;
    setPromptHandler(agentId: string, handler: PolicyPromptHandler): void;
    check(agentId: string, action: PolicyAction, details?: Record<string, unknown>): Promise<PolicyDecision>;
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
    }): Promise<{
        status: 'completed' | 'working' | 'failed';
        output?: string;
        error?: string;
    }>;
}
export interface ClaudeMcpClient {
    callTool(payload: {
        name: string;
        arguments: Record<string, unknown>;
    }): Promise<{
        content?: string;
        error?: string;
    }>;
}
export declare class CodexConnectorAdapter implements ConnectorAdapter {
    private readonly rpcClient;
    private readonly auditSink?;
    readonly platform: RecoderAgentPlatform;
    readonly protocol: A2AProtocolKind;
    private readonly taskStates;
    constructor(rpcClient: CodexRpcClient, auditSink?: ((event: ConnectorAuditEvent) => void | Promise<void>) | undefined);
    discoverCapabilities(): Promise<ConnectorCapability[]>;
    executeTask(request: ConnectorTaskRequest): Promise<ConnectorTaskResult>;
    streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate>;
    cancelTask(taskId: string): Promise<boolean>;
    extractContext(scope: ConnectorContextScope): Promise<ConnectorContextSnapshot>;
    mapPlatformActionToPolicyAction(action: ConnectorAction): PolicyAction | undefined;
    emitAuditEvent(event: ConnectorAuditEvent): Promise<void>;
}
export declare class ClaudeConnectorAdapter implements ConnectorAdapter {
    private readonly mcpClient;
    private readonly auditSink?;
    readonly platform: RecoderAgentPlatform;
    readonly protocol: A2AProtocolKind;
    private readonly taskStates;
    constructor(mcpClient: ClaudeMcpClient, auditSink?: ((event: ConnectorAuditEvent) => void | Promise<void>) | undefined);
    discoverCapabilities(): Promise<ConnectorCapability[]>;
    executeTask(request: ConnectorTaskRequest): Promise<ConnectorTaskResult>;
    streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate>;
    cancelTask(taskId: string): Promise<boolean>;
    extractContext(scope: ConnectorContextScope): Promise<ConnectorContextSnapshot>;
    mapPlatformActionToPolicyAction(action: ConnectorAction): PolicyAction | undefined;
    emitAuditEvent(event: ConnectorAuditEvent): Promise<void>;
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
export declare class A2AControlPlane {
    private readonly registry;
    private readonly taskStore;
    private readonly policy;
    private readonly auditLog;
    private readonly collaboration;
    private readonly connectors;
    constructor(registry: InMemoryAgentRegistry, taskStore: TaskStore, policy: UnifiedPolicyPlane, auditLog?: AuditLogService, collaboration?: CollaborationService);
    attachConnector(agentId: string, connector: ConnectorAdapter): void;
    discoverCapabilities(agentId: string): Promise<ConnectorCapability[]>;
    extractConnectorContext(agentId: string, scope: ConnectorContextScope): Promise<ConnectorContextSnapshot>;
    streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate>;
    cancelTask(taskId: string): Promise<A2ATask>;
    getAuditEntries(taskId?: string): AuditEntry[];
    createChannel(input: {
        id: string;
        scope: CollaborationScope;
        name: string;
        memberAgentIds: string[];
    }): CollaborationChannel;
    createThread(input: {
        id: string;
        channelId: string;
        title: string;
    }): CollaborationThread;
    postMessage(input: {
        id: string;
        threadId: string;
        senderAgentId: string;
        text: string;
    }): CollaborationMessage;
    listChannelThreads(channelId: string): CollaborationThread[];
    listThreadMessages(threadId: string): CollaborationMessage[];
    private emitConnectorAudit;
    submitTask(input: SubmitTaskInput): Promise<A2ATask>;
}
