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

/** GET /workspaces/:id/tree — the worktree's full file list (tracked + untracked). */
export interface WorkspaceTree {
  workspaceId: string;
  files: string[];
  changed: string[];
  truncated: boolean;
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

/**
 * GET /governance/audit — one sealed link in the SHA-256 Merkle audit chain
 * (mirrors @recoder/governance AuditEntry).
 */
export interface GovernanceAuditEntry {
  seq: number;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
  outcome: string;
  runId?: string;
  prevHash: string;
  hash: string;
}

/** GET /governance/audit response: genuine chain verification + entries (newest-first). */
export interface GovernanceAuditTrail {
  verified: { ok: boolean; tipHash?: string; brokenAtSeq?: number; entries: number };
  entries: GovernanceAuditEntry[];
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

/**
 * MCP control-plane types — mirror the real /api/mcp endpoint shapes.
 *
 * Source of truth:
 *  - docker-backend/src/agent-os/routes/mcp-control.routes.ts (createAgentMcpRouter)
 *  - packages/agent-mcp/src/registry.ts (McpServerRegistration, McpServerKind)
 *  - packages/agent-mcp/src/policy/audit.ts (McpToolAuditEvent, McpToolCall)
 *
 * Mounted at /api/mcp (NOT /api/conductor or /api/agent-os).
 */

export type McpServerKind =
  | 'github'
  | 'repo'
  | 'tasks'
  | 'runs'
  | 'workspace'
  | 'artifacts'
  | 'approvals'
  | 'browser'
  | 'memory'
  | 'deploy'
  | 'billing'
  | 'preview'
  | 'logs'
  | 'git_nexus'
  | 'recoder_code_graph'
  | 'beads'
  | 'oss'
  | 'custom';

/** GET /api/mcp/servers — a registered MCP server entry. */
export interface McpServer {
  serverId: string;
  kind: McpServerKind;
  displayName: string;
  transport: 'stdio' | 'http' | 'sse' | 'custom';
  endpoint?: string;
  enabled: boolean;
  toolNames: string[];
  metadata?: Record<string, unknown>;
}

/** GET /api/mcp/tools — a flat tool entry across all servers. */
export interface McpToolEntry {
  serverId: string;
  kind: McpServerKind;
  toolName: string;
  enabled: boolean;
}

export type McpToolCallStatus =
  | 'requested'
  | 'denied'
  | 'needs_approval'
  | 'approved'
  | 'completed'
  | 'failed';

/** A single MCP tool call record. */
export interface McpToolCall {
  callId: string;
  serverId: string;
  toolName: string;
  actorAgentId: string;
  taskId?: string;
  args: Record<string, unknown>;
  requestedAt: string;
  completedAt?: string;
  status: McpToolCallStatus;
}

/** An MCP tool audit event (from /tools/:serverId/:toolName/check). */
export interface McpToolAuditEvent {
  eventId: string;
  call: McpToolCall;
  decision: {
    allowed: boolean;
    requiresApproval?: boolean;
    reason?: string;
  };
  policyDecision?: PolicyDecision;
  error?: string;
}

/**
 * GET /api/mcp/ — top-level summary.
 */
export interface McpHostSummary {
  service: string;
  servers: number;
  tools: number;
}

/**
 * POST /api/mcp/tools/:serverId/:toolName/check — full check result.
 */
export interface McpToolCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
  policyDecision?: PolicyDecision;
  auditEvent: McpToolAuditEvent;
}

/**
 * TensorZero gateway surface types — mirror the real /api/gateway endpoint shapes.
 *
 * Source of truth:
 *  - docker-backend/src/routes/tensorzero.routes.ts
 *  - docker-backend/src/tensorzero-client.ts (TensorzeroHealth)
 *
 * Mounted at /api/gateway (NOT /api/conductor or /api/agent-os).
 */

export type GatewayMode = 'managed' | 'external' | 'unconfigured';

/** GET /api/gateway/health — truthful health snapshot (public, no auth). */
export interface GatewayHealth {
  available: boolean;
  mode: GatewayMode;
  baseUrl?: string;
  listenAddr?: string;
  reason?: string;
}

/** GET /api/gateway/status — authenticated status including binary info. */
export interface GatewayStatus {
  gateway: 'tensorzero';
  mode: GatewayMode;
  available: boolean;
  baseUrl: string | null;
  listenAddr: string | null;
  binaryFound: boolean;
}

/** POST /api/gateway/inference — result of a proxied inference call. */
export interface GatewayInferenceResult {
  routed: boolean;
  inference_id?: string;
  content?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number };
  reason?: string;
}

/** POST /api/gateway/inference request body. */
export interface GatewayInferenceBody {
  function_name: string;
  input: {
    messages: Array<{ role: string; content: string }>;
    [key: string]: unknown;
  };
  episode_id?: string;
}

/**
 * Zero-Trust Networking (OpenZiti) surface types — mirror the real /api/ziti/* endpoint shapes.
 *
 * Source of truth:
 *  - docker-backend/src/routes/ziti.routes.ts
 *  - docker-backend/src/ziti-client.ts (ZitiHealth, ZitiIdentity)
 *
 * Mounted at /api/ziti (NOT /api/conductor or /api/agent-os).
 */

/** GET /api/ziti/health — truthful mesh health; available=false when controller absent. */
export interface ZitiHealth {
  available: boolean;
  configured: boolean;
  controllerUrl?: string;
  reason?: string;
}

/** A single zero-trust identity returned by /api/ziti/identities. */
export interface ZitiIdentity {
  id: string;
  name: string;
  isAdmin?: boolean;
  enrollmentJwt?: string;
  [key: string]: unknown;
}

/** GET /api/ziti/identities — list of provisioned identities (wrapped in available flag). */
export interface ZitiIdentityList {
  available: boolean;
  identities: ZitiIdentity[];
  reason?: string;
}

/**
 * OpenFang agent surface types — mirror the real /api/agents/openfang endpoint shapes.
 *
 * Source of truth:
 *  - docker-backend/src/conductor/openfang-daemon.ts (createOpenfangAgentRouter)
 *
 * Mounted at /api/agents/openfang (NOT /api/conductor or /api/agent-os).
 */

/** GET /api/agents/openfang/health — truthful daemon health (503 when absent). */
export interface OpenfangHealth {
  agent: 'openfang';
  status: 'up' | 'unavailable';
  listenAddr?: string;
  binPath?: string;
  pid?: number;
  reason?: string;
}

/** GET /api/agents/openfang — agent card + current runtime status. */
export interface OpenfangAgentCard {
  agentId: 'openfang';
  name: string;
  description: string;
  a2aBoundary: boolean;
  status: 'up' | 'unavailable';
  listenAddr: string | null;
}

/**
 * Multica managed-agents/squads surface types — mirror the real /api/multica/* shapes.
 *
 * Source of truth:
 *  - docker-backend/src/routes/multica.routes.ts (createMulticaRouter)
 *  - docker-backend/src/multica-client.ts (MulticaSquad, MulticaHealthResult)
 *
 * Mounted at /api/multica (NOT /api/conductor or /api/agent-os).
 */

/** GET /api/multica/status — truthful Multica seam health (503 when unconfigured). */
export interface MulticaStatus {
  service: 'multica';
  available: boolean;
  mode: 'managed' | 'external' | 'unconfigured';
  baseUrl: string | null;
  listenAddr: string | null;
  binaryFound: boolean;
  reason?: string;
  env: {
    MULTICA_URL: boolean;
    MULTICA_BIN: boolean;
  };
}

/** A single squad returned by Multica. */
export interface MulticaSquad {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  leader_id: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

/** GET /api/multica/squads — list of squads from Multica (empty when routed=false). */
export interface MulticaSquadsResult {
  routed: boolean;
  squads: MulticaSquad[];
}

/**
 * Retrieval (RAG) surface types — mirror the real /api/retrieval/* endpoint shapes.
 *
 * Source of truth:
 *  - docker-backend/src/routes/retrieval.routes.ts (createRetrievalRouter)
 *
 * Mounted at /api/retrieval (NOT /api/conductor or /api/agent-os).
 */

/** GET /api/retrieval/health — truthful retrieval capability health. */
export interface RetrievalHealth {
  service: 'retrieval';
  available: boolean;
  colbertConfigured: boolean;
  lanceConfigured: boolean;
  colbertUrl?: string | null;
  lanceDbPath?: string | null;
  reason?: string;
}

/** A single ranked result from POST /api/retrieval/search. */
export interface RetrievalResult {
  rank: number;
  text: string;
  score: number;
  rerankScore?: number;
  similarityThreshold?: number;
}

/** POST /api/retrieval/search response data. */
export interface RetrievalSearchResult {
  query: string;
  results: RetrievalResult[];
  colbertAvailable: boolean;
  lanceAvailable: boolean;
  totalCandidates: number;
  rerankApplied: boolean;
  reason?: string;
}

/** POST /api/retrieval/search request body. */
export interface RetrievalSearchBody {
  query: string;
  limit?: number;
  threshold?: number;
}

/** The standard backend envelope: { success, data?, error? }. */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * The signed-in user's display identity, surfaced in the cockpit header. Present
 * ONLY when the main process actually captured it from the server — never
 * fabricated. When absent, the cockpit shows a generic "Signed in" state.
 */
export interface CockpitIdentity {
  email?: string;
  plan?: string;
}

/** Result of the desktop login / token-resolve / refresh IPC bridge. */
export interface CockpitAuthResult {
  ok: boolean;
  token?: string;
  tokenSource?: string;
  backendUrl?: string;
  reason?: string;
  /** Display identity, present only when the server returned it. */
  identity?: CockpitIdentity;
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
  /**
   * Signed-in identity (email/plan), present only when the shell captured it
   * from the server. Undefined when unknown — the header then shows "Signed in".
   */
  identity?: CockpitIdentity;
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
  /** Re-resolve the session token without UI (env -> web session cookie -> device token -> API key). */
  resolveToken?: () => Promise<CockpitAuthResult>;
  /**
   * Transparently refresh an expired device token via the stored refresh token.
   * Present only inside the Electron shell. Resolves to a not-ok result (stay
   * signed-out) when refresh is unavailable or fails — never fabricates a token.
   */
  refreshToken?: () => Promise<CockpitAuthResult>;
  /**
   * Sign out: clear the stored device token (access + refresh) in the main
   * process. Best-effort — always returns the app to signed-out. Present only
   * inside the Electron shell. Resolves to { ok: true }.
   */
  signOut?: () => Promise<{ ok: boolean }>;
}
