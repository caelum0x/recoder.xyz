// Internal alias so the validator can use the schema selector without clashing
// with the public re-export of the same name below (a name that is both
// imported and re-exported breaks live-binding forwarding under some bundlers).
import { getRecoderA2AEnvelopeSchema as selectEnvelopeSchema } from './schemas/recoder-envelope';

export const RECODER_A2A_PROTOCOL_VERSION = '0.3.0';
export const RECODER_A2A_ENVELOPE_VERSION = '2026-02-14';
export const RECODER_A2A_ENVELOPE_TEXT_PREFIX = 'recoder.a2a.envelope:';

// Re-export the Zod schemas + inferred types that back the validators below, so
// consumers can use `safeParse` semantics directly and so the schema is part of
// the public `@recoder/shared/a2a` surface.
//
// NOTE: these are pure re-exports (no local `import` of the same names) so the
// live bindings forward correctly under both Node's CJS interop and the
// bundler/SSR transforms used by consumers.
export {
  RecoderPayloadSchema,
  RecoderTextPayloadSchema,
  RecoderJsonPayloadSchema,
  RecoderCommandPayloadSchema,
  RecoderArtifactPayloadSchema,
  RecoderAgentIdentitySchema,
  RecoderAgentPlatformSchema,
  RecoderEnvelopeTraceSchema,
  RecoderA2AEnvelopeSchema,
  RecoderA2AEnvelopeStrictSchema,
  getRecoderA2AEnvelopeSchema,
  type RecoderPayloadInput,
  type RecoderA2AEnvelopeInput,
} from './schemas/recoder-envelope';

export type RecoderAgentPlatform =
  | 'recoder'
  | 'cursor'
  | 'windsurf'
  | 'replit'
  | 'codex'
  | 'claude_code'
  | 'recoder_app'
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

/** Closed set of artifact payload types. */
export const RECODER_ARTIFACT_TYPES = ['patch', 'file', 'plan', 'report'] as const;

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
  /**
   * The ordered list of payload parts carried by this envelope.
   *
   * Tightened from the legacy `RecoderPayload[] | unknown[]` to the strict
   * discriminated union: every part must be a known `RecoderPayload` variant.
   * Runtime validation is enforced by `RecoderPayloadSchema`.
   */
  payload: RecoderPayload[];
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
  'recoder_app',
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

/**
 * Convert a Zod issue path (array of string/number segments) into the legacy
 * dotted path notation used by `RecoderEnvelopeValidationIssue`:
 * - object keys are joined with `.`
 * - array indices use `[n]` bracket notation
 *
 * Example: `['payload', 0, 'text']` -> `payload[0].text`.
 */
function zodPathToString(path: ReadonlyArray<string | number>): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else {
      out += out.length === 0 ? segment : `.${segment}`;
    }
  }
  return out;
}

/**
 * Validate an unknown value against the canonical Recoder A2A envelope schema.
 *
 * Zod-backed: structural validation is delegated to `RecoderA2AEnvelopeSchema`
 * (and its strict variant when `options.strictVersion` is set). The function
 * signature and return shape are unchanged from the previous hand-rolled
 * implementation -- it returns a flat list of `{ path, message }` issues and
 * never throws -- so existing callers continue to work without modification.
 *
 * @param value - The raw, untrusted value to validate.
 * @param options - When `strictVersion` is true, the envelope/protocol version
 *   fields must equal the canonical pinned constants.
 * @returns An array of validation issues; empty when the value is a valid
 *   `RecoderA2AEnvelope`.
 */
export function validateRecoderA2AEnvelope(
  value: unknown,
  options: RecoderEnvelopeValidationOptions = {}
): RecoderEnvelopeValidationIssue[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path: '$', message: 'envelope must be an object' }];
  }

  const schema = selectEnvelopeSchema(options.strictVersion === true);
  const result = schema.safeParse(value);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue): RecoderEnvelopeValidationIssue => {
    const path = zodPathToString(issue.path);
    return {
      path: path.length > 0 ? path : '$',
      message: issue.message,
    };
  });
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
