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

export type WorkspaceSubstrate = 'tmux_worktree' | 'daytona';

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
  channel: string;
  accountId: string;
  /** Credential present in env (so this channel was instantiated). */
  configured: boolean;
  /** A real probe() reported the account reachable + authorized. */
  connected: boolean;
  identity?: string;
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
  /** Re-resolve the session token without UI (env -> web session cookie -> API key). */
  resolveToken?: () => Promise<CockpitAuthResult>;
}
