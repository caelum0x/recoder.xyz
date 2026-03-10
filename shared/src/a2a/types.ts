export const RECODER_A2A_PROTOCOL_VERSION = '0.3.0';
export const RECODER_A2A_ENVELOPE_VERSION = '2026-02-14';
export const RECODER_A2A_ENVELOPE_TEXT_PREFIX = 'recoder.a2a.envelope:';

export type RecoderAgentPlatform =
  | 'recoder'
  | 'cursor'
  | 'windsurf'
  | 'replit'
  | 'codex'
  | 'claude_code'
  | 'recoder_web'
  | 'recoder_pm'
  | 'recoder_agency'
  | 'recoder_backend'
  | 'recoder_desktop'
  | 'custom';

export type RecoderIntent =
  | 'plan'
  | 'execute'
  | 'review'
  | 'handoff'
  | 'status'
  | 'sync'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | (string & {});

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

export type RecoderPayload =
  | RecoderTextPayload
  | RecoderJsonPayload
  | RecoderCommandPayload
  | RecoderArtifactPayload;

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

export const RECODER_AGENT_PLATFORMS = [
  'recoder',
  'cursor',
  'windsurf',
  'replit',
  'codex',
  'claude_code',
  'recoder_web',
  'recoder_pm',
  'recoder_agency',
  'recoder_backend',
  'recoder_desktop',
  'custom',
] as const satisfies readonly RecoderAgentPlatform[];

export const RECODER_ENVELOPE_INTENTS = [
  'plan',
  'execute',
  'review',
  'handoff',
  'status',
  'sync',
  'tool_call',
  'tool_result',
  'error',
] as const satisfies readonly RecoderIntent[];

export interface RecoderEnvelopeValidationIssue {
  path: string;
  message: string;
}

export interface RecoderEnvelopeValidationOptions {
  strictVersion?: boolean;
}

export class RecoderA2AEnvelopeValidationError extends Error {
  issues: RecoderEnvelopeValidationIssue[];

  constructor(issues: RecoderEnvelopeValidationIssue[], message = 'Invalid Recoder A2A envelope') {
    super(message);
    this.name = 'RecoderA2AEnvelopeValidationError';
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateIdentity(
  identity: unknown,
  path: string,
  issues: RecoderEnvelopeValidationIssue[]
): void {
  if (!isRecord(identity)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }

  if (!isNonEmptyString(identity.id)) {
    issues.push({ path: `${path}.id`, message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(identity.name)) {
    issues.push({ path: `${path}.name`, message: 'must be a non-empty string' });
  }
  if (
    !isNonEmptyString(identity.platform) ||
    !RECODER_AGENT_PLATFORMS.includes(identity.platform as RecoderAgentPlatform)
  ) {
    issues.push({
      path: `${path}.platform`,
      message: `must be one of ${RECODER_AGENT_PLATFORMS.join(', ')}`,
    });
  }
}

function validatePayload(payload: unknown, issues: RecoderEnvelopeValidationIssue[]): void {
  if (!Array.isArray(payload)) {
    issues.push({ path: 'payload', message: 'must be an array' });
    return;
  }

  payload.forEach((part, index) => {
    const basePath = `payload[${index}]`;
    if (!isRecord(part)) {
      issues.push({ path: basePath, message: 'must be an object' });
      return;
    }
    if (!isNonEmptyString(part.kind)) {
      issues.push({ path: `${basePath}.kind`, message: 'must be a non-empty string' });
      return;
    }

    if (part.kind === 'text' && !isNonEmptyString(part.text)) {
      issues.push({ path: `${basePath}.text`, message: 'must be a non-empty string' });
      return;
    }

    if (part.kind === 'json' && !isRecord(part.data)) {
      issues.push({ path: `${basePath}.data`, message: 'must be an object' });
      return;
    }

    if (part.kind === 'command') {
      if (!isNonEmptyString(part.command)) {
        issues.push({ path: `${basePath}.command`, message: 'must be a non-empty string' });
      }
      if (part.args !== undefined && !Array.isArray(part.args)) {
        issues.push({ path: `${basePath}.args`, message: 'must be an array of strings' });
      }
      return;
    }

    if (part.kind === 'artifact') {
      if (!isNonEmptyString(part.mimeType)) {
        issues.push({ path: `${basePath}.mimeType`, message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(part.content)) {
        issues.push({ path: `${basePath}.content`, message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(part.artifactType)) {
        issues.push({
          path: `${basePath}.artifactType`,
          message: 'must be one of patch, file, plan, report',
        });
      }
      return;
    }

    if (part.kind !== 'text' && part.kind !== 'json' && part.kind !== 'command' && part.kind !== 'artifact') {
      issues.push({
        path: `${basePath}.kind`,
        message: 'must be one of text, json, command, artifact',
      });
    }
  });
}

export function validateRecoderA2AEnvelope(
  value: unknown,
  options: RecoderEnvelopeValidationOptions = {}
): RecoderEnvelopeValidationIssue[] {
  const issues: RecoderEnvelopeValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ path: '$', message: 'envelope must be an object' }];
  }

  if (!isNonEmptyString(value.envelopeVersion)) {
    issues.push({ path: 'envelopeVersion', message: 'must be a non-empty string' });
  } else if (options.strictVersion && value.envelopeVersion !== RECODER_A2A_ENVELOPE_VERSION) {
    issues.push({
      path: 'envelopeVersion',
      message: `must equal ${RECODER_A2A_ENVELOPE_VERSION}`,
    });
  }

  if (!isNonEmptyString(value.protocolVersion)) {
    issues.push({ path: 'protocolVersion', message: 'must be a non-empty string' });
  } else if (options.strictVersion && value.protocolVersion !== RECODER_A2A_PROTOCOL_VERSION) {
    issues.push({
      path: 'protocolVersion',
      message: `must equal ${RECODER_A2A_PROTOCOL_VERSION}`,
    });
  }

  if (!isNonEmptyString(value.messageId)) {
    issues.push({ path: 'messageId', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.threadId)) {
    issues.push({ path: 'threadId', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.createdAt) || Number.isNaN(Date.parse(value.createdAt))) {
    issues.push({ path: 'createdAt', message: 'must be a valid ISO-8601 timestamp string' });
  }

  validateIdentity(value.from, 'from', issues);
  validateIdentity(value.to, 'to', issues);
  validatePayload(value.payload, issues);

  if (
    !isNonEmptyString(value.intent) ||
    !RECODER_ENVELOPE_INTENTS.includes(value.intent as (typeof RECODER_ENVELOPE_INTENTS)[number])
  ) {
    issues.push({
      path: 'intent',
      message: `must be one of ${RECODER_ENVELOPE_INTENTS.join(', ')}`,
    });
  }

  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    issues.push({ path: 'metadata', message: 'must be an object when provided' });
  }

  if (value.trace !== undefined) {
    if (!isRecord(value.trace)) {
      issues.push({ path: 'trace', message: 'must be an object when provided' });
    } else if (!isNonEmptyString(value.trace.traceId)) {
      issues.push({ path: 'trace.traceId', message: 'must be a non-empty string' });
    }
  }

  return issues;
}

export function isRecoderA2AEnvelope(value: unknown): value is RecoderA2AEnvelope {
  return validateRecoderA2AEnvelope(value).length === 0;
}

export function assertRecoderA2AEnvelope(
  value: unknown,
  options?: RecoderEnvelopeValidationOptions
): asserts value is RecoderA2AEnvelope {
  const issues = validateRecoderA2AEnvelope(value, options);
  if (issues.length > 0) {
    throw new RecoderA2AEnvelopeValidationError(issues);
  }
}

export function parseRecoderA2AEnvelope(
  value: unknown,
  options?: RecoderEnvelopeValidationOptions
): RecoderA2AEnvelope {
  assertRecoderA2AEnvelope(value, options);
  return value;
}

// ---------------------------------------------------------------------------
// Workspace types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Multi-dispatch types
// ---------------------------------------------------------------------------

export type AggregationStrategy = 'first-wins' | 'merge-all' | 'best-score' | 'manual';

export interface MultiDispatchRequest {
  prompt: string;
  agentIds?: string[];
  autoRoute?: boolean;
  orchestrationPattern?: OrchestrationPattern;
  aggregationStrategy?: AggregationStrategy;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  worktreeIsolation?: boolean;
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
  createdAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Worktree types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Approval types
// ---------------------------------------------------------------------------

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
