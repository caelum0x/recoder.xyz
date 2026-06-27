export declare const RECODER_A2A_PROTOCOL_VERSION = "0.3.0";
export declare const RECODER_A2A_ENVELOPE_VERSION = "2026-02-14";
export declare const RECODER_A2A_ENVELOPE_TEXT_PREFIX = "recoder.a2a.envelope:";
export type RecoderAgentPlatform = 'recoder' | 'cursor' | 'windsurf' | 'replit' | 'codex' | 'claude_code' | 'recoder_app' | 'recoder_pm' | 'recoder_agency' | 'recoder_backend' | 'recoder_desktop' | 'custom';
export type RecoderIntent = 'plan' | 'execute' | 'review' | 'handoff' | 'status' | 'sync' | 'tool_call' | 'tool_result' | 'error' | (string & {});
export interface RecoderAgentIdentity {
    id: string;
    name: string;
    platform: RecoderAgentPlatform;
    instanceId?: string;
    team?: string;
    version?: string;
}
export interface RecoderTextPayload {
    kind: 'text';
    text: string;
}
export interface RecoderJsonPayload {
    kind: 'json';
    data: Record<string, unknown>;
}
export interface RecoderCommandPayload {
    kind: 'command';
    command: string;
    args?: string[];
    cwd?: string;
}
export interface RecoderArtifactPayload {
    kind: 'artifact';
    artifactType: 'patch' | 'file' | 'plan' | 'report';
    mimeType: string;
    content: string;
    path?: string;
}
export type RecoderPayload = RecoderTextPayload | RecoderJsonPayload | RecoderCommandPayload | RecoderArtifactPayload;
export interface RecoderEnvelopeTrace {
    traceId: string;
    parentMessageId?: string;
}
export interface RecoderA2AEnvelope {
    envelopeVersion: string;
    protocolVersion: string;
    messageId: string;
    threadId: string;
    createdAt: string;
    from: RecoderAgentIdentity;
    to: RecoderAgentIdentity;
    intent: RecoderIntent;
    payload: RecoderPayload[] | unknown[];
    metadata?: Record<string, unknown>;
    trace?: RecoderEnvelopeTrace;
}
export interface A2ATextPart {
    kind: 'text';
    text: string;
}
export interface A2AMessage {
    kind: 'message';
    messageId: string;
    role: 'user' | 'agent';
    parts: A2ATextPart[];
    contextId?: string;
}
export interface RecoderAgentSkill {
    id: string;
    name: string;
    description: string;
    tags: string[];
}
export interface RecoderAgentCard {
    name: string;
    description: string;
    protocolVersion: string;
    version: string;
    url: string;
    skills: RecoderAgentSkill[];
    capabilities: {
        streaming: boolean;
        pushNotifications: boolean;
    };
    defaultInputModes: string[];
    defaultOutputModes: string[];
}
export interface CodexWireMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
}
export interface ClaudeCodeTextBlock {
    type: 'text';
    text: string;
}
export interface ClaudeCodeWireMessage {
    role: 'user' | 'assistant';
    content: string | ClaudeCodeTextBlock[];
    metadata?: Record<string, unknown>;
}
export declare const RECODER_AGENT_PLATFORMS: readonly ["recoder", "cursor", "windsurf", "replit", "codex", "claude_code", "recoder_app", "recoder_pm", "recoder_agency", "recoder_backend", "recoder_desktop", "custom"];
export declare const RECODER_ENVELOPE_INTENTS: readonly ["plan", "execute", "review", "handoff", "status", "sync", "tool_call", "tool_result", "error"];
export interface RecoderEnvelopeValidationIssue {
    path: string;
    message: string;
}
export interface RecoderEnvelopeValidationOptions {
    strictVersion?: boolean;
}
export declare class RecoderA2AEnvelopeValidationError extends Error {
    issues: RecoderEnvelopeValidationIssue[];
    constructor(issues: RecoderEnvelopeValidationIssue[], message?: string);
}
export declare function validateRecoderA2AEnvelope(value: unknown, options?: RecoderEnvelopeValidationOptions): RecoderEnvelopeValidationIssue[];
export declare function isRecoderA2AEnvelope(value: unknown): value is RecoderA2AEnvelope;
export declare function assertRecoderA2AEnvelope(value: unknown, options?: RecoderEnvelopeValidationOptions): asserts value is RecoderA2AEnvelope;
export declare function parseRecoderA2AEnvelope(value: unknown, options?: RecoderEnvelopeValidationOptions): RecoderA2AEnvelope;
export type OrchestrationPattern = 'direct' | 'fan-out' | 'pipeline' | 'competitive';
export interface WorkspaceSettings {
    /** Enable autonomous @mention routing between agents. */
    autoRouting: boolean;
    /** Require human approval before delegations execute. */
    approvalRequired: boolean;
    /** Create git worktrees for parallel agent work. */
    worktreeIsolation: boolean;
    /** Max concurrent tasks across all agents in this workspace. */
    maxConcurrentTasks: number;
    /** Default orchestration pattern for multi-dispatch. */
    defaultOrchestrationPattern: OrchestrationPattern;
}
export interface A2AWorkspace {
    workspaceId: string;
    name: string;
    projectId: string;
    ownerId: string;
    memberAgentIds: string[];
    defaultChannelId: string;
    settings: WorkspaceSettings;
    createdAt: string;
    updatedAt: string;
}
export type AggregationStrategy = 'first-wins' | 'merge-all' | 'best-score' | 'manual';
export interface TaskRoutingHints {
    requiredCapabilities?: string[];
    preferredCapabilities?: string[];
    preferredPlatform?: string;
    runtimeCategory?: 'implementation' | 'review' | 'documentation' | 'visual' | 'debug' | 'general';
}
export interface MultiDispatchRequest {
    prompt: string;
    agentIds?: string[];
    autoRoute?: boolean;
    orchestrationPattern?: OrchestrationPattern;
    aggregationStrategy?: AggregationStrategy;
    priority?: 'critical' | 'high' | 'normal' | 'low';
    worktreeIsolation?: boolean;
    routingHints?: TaskRoutingHints;
}
export type DispatchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface DispatchRecord {
    dispatchId: string;
    workspaceId: string;
    prompt: string;
    orchestrationPattern: OrchestrationPattern;
    aggregationStrategy: AggregationStrategy;
    taskIds: string[];
    agentIds: string[];
    channelThreadId?: string;
    status: DispatchStatus;
    results: Record<string, unknown>[];
    /** Worktree info per task when worktree isolation is enabled (taskId -> WorktreeInfo). */
    worktrees?: Record<string, WorktreeInfo>;
    /** Per-agent routing reasons when auto-routing was used (agentId -> reason string). */
    routingReasons?: Record<string, string>;
    /** Routing hints supplied or inferred at dispatch time. */
    routingHints?: TaskRoutingHints;
    /** Prompt intent classification captured at dispatch time. */
    intentClassification?: {
        category: string;
        confidence: number;
        keywords: string[];
    };
    createdAt: string;
    completedAt?: string;
}
export type WorktreeStatus = 'active' | 'merged' | 'conflict' | 'removed';
export interface WorktreeInfo {
    taskId: string;
    agentId: string;
    worktreePath: string;
    branchName: string;
    baseBranch: string;
    status: WorktreeStatus;
    createdAt: string;
}
export type ApprovalStatus = 'pending' | 'granted' | 'rejected' | 'expired' | 'escalated';
export interface ApprovalRequest {
    approvalId: string;
    workspaceId: string;
    requestingAgentId: string;
    targetAgentId: string;
    action: string;
    details: Record<string, unknown>;
    status: ApprovalStatus;
    createdAt: string;
    resolvedAt?: string;
    resolvedBy?: string;
    timeoutMs: number;
}
