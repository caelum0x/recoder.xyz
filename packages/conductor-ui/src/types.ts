/**
 * @recoder/conductor-ui types — mirrored from the REAL conductor backend JSON
 * shapes, not invented here.
 *
 * Source of truth:
 *  - packages/agent-os/src/domain/workspace.ts (Workspace, WorkspaceState)
 *  - packages/agent-os/src/domain/event.ts (RunEvent)
 *  - docker-backend/src/conductor/conductor.routes.ts (routes + {success,data} envelopes)
 *  - apps/desktop/cockpit/src/types.ts (the same shapes, re-used here verbatim)
 *
 * These describe what the backend returns; this package never invents fields the
 * API does not send.
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

/** GET /workspaces/:id/output — captured pane text + (optionally) recent output. */
export interface WorkspaceOutput {
  output: string;
}

/**
 * GET /workspaces/:id/status — live status of a running workspace's agent,
 * resolved through the workspace's own substrate handle (conductor.routes.ts).
 * `alive`/`exitCode`/`recentOutput` come from runtimeStatus(); `state` is the
 * persisted workspace state. When there is no live handle, `reason` is set.
 */
export interface WorkspaceStatus {
  alive: boolean;
  exitCode: number | null;
  recentOutput: string | null;
  state: WorkspaceState;
  reason?: string;
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

/** GET /health — conductorAvailability(): the substrate availability strip. */
export interface ConductorAvailability {
  available: boolean;
  git: boolean;
  tmux: boolean;
  tmuxBin: string;
  reason?: string;
}

/**
 * POST /workspaces request body (conductor.routes.ts handler).
 *
 * The handler hard-requires: spaceId, projectId, taskId, repoPath, runtimeId,
 * createdBy, and ONE OF (command | prompt). Everything else is optional and
 * server-defaulted (substrate defaults to 'tmux_worktree').
 */
export interface CreateWorkspaceInput {
  spaceId: string;
  projectId: string;
  taskId: string;
  repoPath: string;
  runtimeId: string;
  createdBy: string;
  /** One of (prompt | command) is required by the backend. */
  prompt?: string;
  command?: string;
  substrate?: WorkspaceSubstrate;
  model?: string;
  branch?: string;
  baseRef?: string;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
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

/** The standard backend envelope: { success, data?, error? }. */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Configuration for a {@link ConductorClient}. */
export interface ConductorClientOptions {
  /**
   * Backend origin, e.g. https://recoder.xyz or http://127.0.0.1:3001. The
   * conductor routes are mounted under `/api/conductor` (overridable).
   */
  baseUrl: string;
  /**
   * Recoder platform key (an `sk_...` key). Sent as the `x-api-key` header on
   * every request; the conductor backend requires it.
   */
  apiKey?: string;
  /** Path prefix the conductor router is mounted at. Defaults to '/api/conductor'. */
  basePath?: string;
  /** Injected fetch (for tests / non-browser runtimes). Defaults to global fetch. */
  fetch?: typeof fetch;
  /**
   * Injected WebSocket constructor (for tests / non-browser runtimes). Defaults
   * to the global WebSocket when available.
   */
  WebSocketImpl?: WebSocketCtor;
}

/** Minimal structural WebSocket constructor we depend on (browser + ws-compatible). */
export type WebSocketCtor = new (url: string) => WebSocketLike;

/** Minimal structural WebSocket we depend on (browser + `ws` package compatible). */
export interface WebSocketLike {
  close(): void;
  addEventListener?(type: string, listener: (event: unknown) => void): void;
  removeEventListener?(type: string, listener: (event: unknown) => void): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  onclose?: ((event: unknown) => void) | null;
  onopen?: ((event: unknown) => void) | null;
}

/** Callback invoked for each {@link RunEvent} delivered by {@link ConductorClient.openStream}. */
export type RunEventHandler = (event: RunEvent) => void;

/** A handle returned by {@link ConductorClient.openStream}; call to stop streaming. */
export interface StreamHandle {
  /** Stop the stream (closes the socket and/or cancels polling). */
  close(): void;
  /** Which transport is in use — 'websocket' when the socket opened, else 'poll'. */
  readonly transport: 'websocket' | 'poll';
}
