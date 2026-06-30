/**
 * Cockpit types — mirror the REAL conductor backend JSON shapes.
 *
 * Source of truth:
 *  - packages/agent-os/src/domain/workspace.ts (Workspace, WorkspaceState)
 *  - packages/agent-os/src/domain/event.ts (RunEvent)
 *  - docker-backend/src/conductor/{conductor.routes,review,review-publish,runtime-commands}.ts
 *
 * These are intentionally read-only descriptions of what the backend returns;
 * the cockpit never invents fields the API does not send.
 */

export type WorkspaceState =
  | 'created'
  | 'setting_up'
  | 'ready'
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_review'
  | 'changes_requested'
  | 'merging'
  | 'merged'
  | 'failed'
  | 'cancelled'
  | 'archived';

export type WorkspaceSubstrate = 'tmux_worktree' | 'daytona' | 'in_process';

export interface Workspace {
  workspaceId: string;
  spaceId: string;
  projectId: string;
  taskId: string;
  runId?: string;
  runtimeId: string;
  substrate: WorkspaceSubstrate;
  branch: string;
  baseRef: string;
  worktreePath?: string;
  sessionName?: string;
  state: WorkspaceState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  metadata?: Record<string, unknown>;
}

export type RunEventType =
  | 'started'
  | 'state_transition'
  | 'log'
  | 'artifact'
  | 'needs_input'
  | 'verified'
  | 'approval_requested'
  | 'handoff'
  | 'failed'
  | 'completed';

export interface RunEvent {
  eventId: string;
  type: RunEventType;
  taskId: string;
  runId?: string;
  agentId?: string;
  state?: string;
  message?: string;
  artifactId?: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface WorkspaceDiff {
  workspaceId: string;
  baseRef: string;
  branch: string;
  stat: string;
  patch: string;
  untracked: string[];
  changedFiles: number;
}

/** GET /runtimes — runtimeAvailability() */
export interface RuntimeAvailability {
  runtimeId: string;
  bin: string;
  available: boolean;
  path?: string;
}

/** GET /substrates — { id, available, reason? } per registered substrate. */
export interface SubstrateAvailability {
  id: WorkspaceSubstrate;
  available: boolean;
  reason?: string;
}

/**
 * GET /health/full — the unified conductor health snapshot.
 *
 * Source of truth: docker-backend/src/conductor/conductor-health.ts
 * (ConductorHealth). This is the single endpoint an operator/monitor checks:
 * truthful substrate, runtime, resource, tail, and workspace state — never faked.
 */
export type ConductorHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ConductorHealth {
  status: ConductorHealthStatus;
  timestamp: string;
  substrate: {
    available: boolean;
    git: boolean;
    tmux: boolean;
    tmuxBin: string;
    reason?: string;
  };
  runtimes: RuntimeAvailability[];
  resources: {
    limits: {
      maxConcurrentWorkspaces: number;
      maxConcurrentPerUser: number;
      maxTmuxSessions: number;
      minFreeDiskGb: number;
      maxWorktreeDiskGb: number;
    };
    current: {
      projectWorkspaces: number;
      userWorkspaces: number;
      tmuxSessions: number;
      freeDiskGb: number;
    };
  };
  activeTails: number;
  dmux: {
    available: boolean;
    bin: string;
    vendored: boolean;
    reason?: string;
  };
  workspaces: {
    total: number;
    active: number;
    byState: Record<string, number>;
  };
}

/**
 * The structured `data` the conductor PR/merge delivery gate attaches to a 409
 * when an action is blocked awaiting approval.
 *
 * Source of truth: docker-backend/src/conductor/conductor.routes.ts (the
 * `DeliveryApprovalRequiredError` 409 handler) which serializes
 * `{ state, action, approvalId, transitioned }`. The human-readable gate reason
 * is the envelope `error` message (carried separately on the thrown ApiError).
 */
export type DeliveryGateAction = 'pr' | 'merge' | 'pr.create' | 'branch.push';

export interface DeliveryGateDetail {
  /** Always 'awaiting_approval' for the gate; the workspace's resulting state. */
  state: string;
  /** The delivery action that was gated. */
  action: DeliveryGateAction | string;
  /** The pending/blocking Approval record id, when the gate found one. */
  approvalId?: string;
  /** Whether the workspace record was actually moved to awaiting_approval. */
  transitioned?: boolean;
}

/** POST /workspaces request body (conductor.routes.ts handler). */
export interface CreateWorkspaceBody {
  spaceId: string;
  projectId: string;
  taskId: string;
  repoPath: string;
  runtimeId: string;
  createdBy: string;
  /** Execution substrate to launch on (defaults to 'tmux_worktree' server-side). */
  substrate?: WorkspaceSubstrate;
  prompt?: string;
  command?: string;
  model?: string;
  branch?: string;
  baseRef?: string;
}

export interface CreatePrResult {
  workspaceId: string;
  branch: string;
  base: string;
  url: string;
}

export interface MergeResult {
  workspaceId: string;
  branch: string;
  merged: boolean;
}

/** GET /sessions — a live tmux+worktree agent session (tmux-orchestrator.ts ConductorSession). */
export interface ConductorSession {
  sessionId: string;
  tmuxName: string;
  worktreePath: string;
  branch: string;
  repoPath: string;
  command: string;
  createdAt: string;
}

/** POST /sessions request body. */
export interface StartSessionBody {
  sessionId: string;
  repoPath: string;
  command: string;
  branch?: string;
  baseRef?: string;
}

/** GET /sessions/:id/output — { output } captured tmux pane text. */
export interface SessionOutput {
  output: string;
}

/** GET /dmux — dmux availability + the conductor tmux sessions it can observe. */
export interface DmuxStatus {
  available: boolean;
  bin: string;
  vendored: boolean;
  tmuxBin: string;
  tmuxPinned: boolean;
  reason?: string;
  visibleSessions: string[];
}

/** POST /dmux/launch request body. */
export interface DmuxLaunchBody {
  repoPath: string;
  extraArgs?: string[];
}

/** POST /dmux/launch result. */
export interface DmuxLaunchResult {
  pid: number;
  bin: string;
  repoPath: string;
  command: string[];
  attachHint: string;
}

/**
 * GET /api/connectors — per-channel connector health.
 *
 * Source of truth: docker-backend/src/connectors/gateway.ts
 * (ConnectorsHealth / ChannelHealth). NOTE this route is mounted at
 * /api/connectors, NOT under /api/conductor.
 */
export interface ChannelHealth {
  /** Channel id, e.g. 'telegram' | 'slack' | 'discord' | … (one of the 7). */
  channel: string;
  /** Account id for a configured channel; falls back to the channel id when not. */
  accountId?: string;
  /** Credential present in env (so this channel was instantiated). */
  configured: boolean;
  /** The adapter port was built and its inbound monitor is available. */
  available?: boolean;
  /** A real probe() reported the account reachable + authorized. */
  connected: boolean;
  /**
   * This channel needs an out-of-process dependency (an external SDK / bridge /
   * webhook) before it can go live, even once configured.
   */
  requiresExternal?: boolean;
  identity?: string;
  /** When NOT configured: why. When requiresExternal: the missing dependency. */
  reason?: string;
  error?: string;
  checkedAt?: number;
}

export interface ConnectorsHealth {
  /** True when at least one channel is configured (gateway is not inert). */
  active: boolean;
  /** Whether inbound commands can launch a workspace (dispatch is configured). */
  dispatchReady: boolean;
  channels: ChannelHealth[];
}

/**
 * GET /api/agent-os/brain/stats — the shared-brain reuse accounting + governance
 * audit integrity.
 *
 * Source of truth:
 *  - docker-backend/src/agent-os/routes/brain-stats.routes.ts (BrainStatsResponseData)
 *  - docker-backend/src/agent-os/brain-service.ts (BrainCacheStatus)
 *  - packages/brain/src/runtime/cache-doctor.ts (CacheReport)
 *
 * Mounted under /api/agent-os (NOT /api/conductor).
 */

/** The live cache-doctor projection of the brain's assemble-once reuse accounting. */
export interface BrainCacheReport {
  /** True once the brain has been read at least once (there is data to report). */
  available: boolean;
  /** Cache hits — reads served from a previously assembled context. */
  hits: number;
  /** Cache misses — reads that triggered a fresh assembly. */
  misses: number;
  /** hits / (hits + misses), 0..1. */
  hitRate: number;
  /** Cumulative estimated tokens saved by reuse — the headline metric. */
  tokensSaved: number;
  /** Human-readable summary the backend produced (cache-doctor `detail`). */
  detail: string;
}

/** brain.* — { enabled, report } from BrainService.cacheReport(). */
export interface BrainCacheStatus {
  /** RECODER_BRAIN_ENABLED gate state. */
  enabled: boolean;
  /** Live cache report, or null when disabled / unreadable. */
  report: BrainCacheReport | null;
}

/** governance.* — the @recoder/governance Merkle audit-chain verification. */
export interface GovernanceAudit {
  /** True only when the Merkle audit chain verified intact. */
  ok: boolean;
  /** Number of audit entries in the chain (0 when unavailable). */
  entries: number;
  /** Current Merkle tip hash, when available. */
  tipHash?: string;
}

/** GET /api/agent-os/brain/stats response data. */
export interface BrainStats {
  brain: BrainCacheStatus;
  governance: GovernanceAudit;
}

/**
 * Agent OS control-plane contracts (mounted at /api/agent-os, NOT /api/conductor).
 *
 * Source of truth:
 *  - packages/agent-os/src/domain/policy-decision.ts (PolicyDecision, effect)
 *  - packages/agent-os/src/domain/memory-item.ts (MemoryCandidate, MemoryItem, scopes/status)
 *  - docker-backend/src/agent-os/routes/policy-evaluate.routes.ts (request shape)
 *  - docker-backend/src/agent-os/routes/memory-candidate.routes.ts (propose/review shapes)
 *  - packages/agent-memory/src/memory-review-workflow.ts (ReviewMemoryResult)
 */

/** POST /api/agent-os/policy/evaluate — the real three-way decision effect. */
export type PolicyDecisionEffect = 'allow' | 'deny' | 'needs_approval';

/** The set of actions the live policy engine recognizes (engine.ts PolicyAction). */
export type PolicyAction =
  | 'file.read'
  | 'file.write'
  | 'command.run'
  | 'tool.call'
  | 'memory.write'
  | 'artifact.publish'
  | 'deploy.preview'
  | 'branch.push'
  | 'pr.create';

/** POST /api/agent-os/policy/evaluate result (PolicyDecision). */
export interface PolicyDecision {
  decisionId: string;
  effect: PolicyDecisionEffect;
  action: string;
  actorAgentId: string;
  taskId?: string;
  reason: string;
  createdAt: string;
  approval?: {
    required: boolean;
    gateId?: string;
    reason?: string;
  };
  findings?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

/**
 * The target of a policy evaluation. All fields optional; which ones matter
 * depends on the action (e.g. `path` for file.*, `command` for command.run).
 */
export interface PolicyTarget {
  path?: string;
  command?: string;
  toolName?: string;
  environment?: string;
}

/**
 * POST /api/agent-os/policy/evaluate request body. The route requires a full
 * AgentProfile-shaped actor (agentId + a permissions object) — the engine reads
 * the actor's permission policy to make a real decision, so the cockpit must
 * send a real (minimal-but-valid) permission policy, never a faked one.
 */
export interface PolicyEvaluateBody {
  actor: {
    agentId: string;
    permissions: Record<string, unknown>;
    [key: string]: unknown;
  };
  action: PolicyAction;
  target: PolicyTarget;
}

export type MemoryCandidateStatus =
  | 'candidate_created'
  | 'reviewed'
  | 'accepted'
  | 'rejected';

export type MemoryScope = 'user' | 'org' | 'space' | 'repo' | 'path' | 'agent' | 'task-type';

/** Evidence is mandatory on every candidate (taskId + artifactId). */
export interface MemoryEvidence {
  taskId: string;
  artifactId: string;
}

/** GET /api/agent-os/memory/lifecycle/candidates — a reviewed-candidate row. */
export interface MemoryCandidate {
  candidateId: string;
  scope: MemoryScope;
  title: string;
  body: string;
  status: MemoryCandidateStatus;
  evidence: MemoryEvidence;
  proposedBy: string;
  proposedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
  expiresAt?: string | null;
}

/** A durable memory item materialized from an accepted candidate. */
export interface MemoryItem {
  memoryId: string;
  scope: MemoryScope;
  title: string;
  body: string;
  status: 'active' | 'superseded' | 'expired';
  evidence: MemoryEvidence;
  createdAt: string;
  acceptedBy: string;
  expiresAt?: string | null;
  supersedesMemoryId?: string;
}

/** POST /memory/lifecycle/candidates request body (propose WITH evidence). */
export interface ProposeMemoryCandidateBody {
  scope: MemoryScope;
  title: string;
  body: string;
  evidence: MemoryEvidence;
  proposedBy: string;
  candidateId?: string;
}

/** POST /memory/lifecycle/candidates/:id/review request body. */
export interface ReviewMemoryCandidateBody {
  accepted: boolean;
  reviewedBy: string;
  reason?: string;
}

/**
 * POST .../review result (ReviewMemoryResult). `memory` is present only when the
 * candidate was accepted (a durable MemoryItem was materialized).
 */
export interface ReviewMemoryResult {
  candidate: MemoryCandidate;
  memory?: MemoryItem;
}

/** The standard backend envelope: { success, data?, error? }. */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Result of the desktop login / token-resolve IPC bridge. */
export interface CockpitAuthResult {
  ok: boolean;
  token?: string;
  tokenSource?: string;
  backendUrl?: string;
  reason?: string;
}

/**
 * The RFC 8628 device-flow prompt the shell streams to the renderer so the
 * sign-in panel can show the user where to go and which code to enter. Mirrors
 * `DeviceSignInPrompt` in @recoder/distribution — the renderer only displays it.
 */
export interface DeviceLoginPrompt {
  /** The short code the user types on the verification page. */
  userCode: string;
  /** The recoder.xyz page the user opens to approve the device. */
  verificationUri: string;
  /** Same URI with the code pre-filled, when the server provides it. */
  verificationUriComplete?: string;
  /** Seconds until the grant expires (the truthful timeout). */
  expiresIn: number;
}

/** Config the Electron shell injects on window.__RECODER_COCKPIT__. */
export interface CockpitConfig {
  backendUrl: string;
  token?: string;
  /** Optional defaults to pre-fill the new-workspace form. */
  defaults?: {
    spaceId?: string;
    projectId?: string;
    createdBy?: string;
    repoPath?: string;
  };
  /**
   * Drive the EXISTING recoder.xyz web auth flow (exposed by preload.js). Present
   * only inside the Electron shell; undefined when opened standalone in a browser.
   */
  login?: () => Promise<CockpitAuthResult>;
  /**
   * Drive the RFC 8628 device-flow sign-in (opens the browser to recoder.xyz,
   * polls for approval). Present only inside the Electron shell.
   */
  deviceLogin?: () => Promise<CockpitAuthResult>;
  /**
   * Subscribe to the device-flow prompt (user_code + verification URI) emitted
   * while a device login is in progress. Returns an unsubscribe function.
   */
  onDeviceLoginPrompt?: (callback: (prompt: DeviceLoginPrompt) => void) => () => void;
  /** Re-resolve the session token without UI (env -> web session cookie -> API key). */
  resolveToken?: () => Promise<CockpitAuthResult>;
}
