// Wire protocol types for the loom headless control API.
//
// Source of truth: the vendored loom engine (Apache-2.0), specifically
// `apps/desktop/engines/loom/src/api/schema/*.rs`. loom is the protocol
// author; these TypeScript types mirror its serde shapes so Recoder can drive
// the engine as an execution substrate. See docs/LOOM-INTEGRATION.md.
//
// ATTRIBUTION (Apache-2.0): the Loom engine is herdr
// (github.com/herdrdev/herdr, Apache-2.0) vendored + rebranded; these wire types
// are derived from herdr's protocol. Copyright (c) herdr contributors.
//
// Only the ~10 methods a substrate needs are typed here (ping, session.snapshot,
// worktree.create, worktree.remove, agent.start, agent.get, agent.read,
// agent.prompt, agent.wait, events.subscribe). The full engine exposes ~45.

/**
 * loom `PROTOCOL_VERSION`. A `ping` reply whose `protocol` differs from this is
 * an incompatible server; callers must reject rather than proceed.
 */
export const LOOM_PROTOCOL_VERSION = 20;

// --- Request envelope -------------------------------------------------------

/**
 * The substrate-facing method names. loom flattens `{method, params}` onto the
 * request object on the wire (serde `tag = "method", content = "params"`); we
 * keep them as explicit fields and serialize `{id, method, params}`.
 */
export type LoomMethod =
  | 'ping'
  | 'session.snapshot'
  | 'worktree.create'
  | 'worktree.remove'
  | 'agent.start'
  | 'agent.get'
  | 'agent.read'
  | 'agent.prompt'
  | 'agent.wait'
  | 'events.subscribe';

export interface LoomRequest<Params = Record<string, unknown>> {
  /** Caller-chosen correlation id, echoed back on the response. */
  id: string;
  method: LoomMethod;
  params: Params;
}

// --- Shared scalars ---------------------------------------------------------

/** loom `AgentStatus` (serde snake_case). */
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

/** loom `ReadSource` (serde snake_case). */
export type ReadSource =
  'visible' | 'recent' | 'recent_unwrapped' | 'detection';

/** loom `ReadFormat` (serde snake_case). */
export type ReadFormat = 'text' | 'ansi';

// --- Method params ----------------------------------------------------------

export type PingParams = Record<string, never>;

export type SessionSnapshotParams = Record<string, never>;

export interface WorktreeCreateParams {
  workspace_id?: string;
  cwd?: string;
  branch?: string;
  base?: string;
  path?: string;
  label?: string;
  focus?: boolean;
}

export interface WorktreeRemoveParams {
  workspace_id: string;
  force?: boolean;
}

export interface AgentStartParams {
  name: string;
  kind: string;
  pane_id: string;
  args?: string[];
  /** Startup timeout in ms. loom requires `> 3000 && <= 300000`. */
  timeout_ms?: number;
}

export interface AgentTargetParams {
  target: string;
}

export interface AgentReadParams {
  target: string;
  source: ReadSource;
  lines?: number;
  format?: ReadFormat;
  strip_ansi?: boolean;
}

export interface AgentPromptWaitOptions {
  until?: AgentStatus[];
  timeout_ms?: number;
}

export interface AgentPromptParams {
  target: string;
  text: string;
  /** When present, loom holds the socket until the agent settles (blocking-wait). */
  wait?: AgentPromptWaitOptions;
}

export interface AgentWaitParams {
  target: string;
  until?: AgentStatus[];
  timeout_ms?: number;
}

/**
 * Only three subscription kinds actually emit via `events.subscribe`
 * (`pane.output_matched`, `pane.agent_status_changed`, `pane.scroll_changed`);
 * for lifecycle facts use single-shot `events.wait`. The `type` tag carries the
 * full dotted event name (serde variant rename).
 */
export interface LoomSubscription {
  type: string;
  [key: string]: unknown;
}

export interface EventsSubscribeParams {
  subscriptions: LoomSubscription[];
}

// --- Nested result payloads -------------------------------------------------

export interface ServerCapabilities {
  live_handoff: boolean;
  detached_server_daemon?: boolean;
}

export interface WorktreeInfo {
  path: string;
  branch?: string;
  is_bare: boolean;
  is_detached: boolean;
  is_prunable: boolean;
  is_linked_worktree: boolean;
  open_workspace_id?: string;
  label: string;
}

export interface WorkspaceInfo {
  workspace_id: string;
  number: number;
  label: string;
  focused: boolean;
  pane_count: number;
  tab_count: number;
  active_tab_id: string;
  agent_status: AgentStatus;
  tokens?: Record<string, string>;
  worktree?: {
    repo_key: string;
    repo_name: string;
    repo_root: string;
    checkout_path: string;
    is_linked_worktree: boolean;
  };
}

export interface TabInfo {
  tab_id: string;
  workspace_id: string;
  number: number;
  label: string;
  focused: boolean;
  pane_count: number;
  agent_status: AgentStatus;
}

export interface PaneInfo {
  pane_id: string;
  terminal_id: string;
  workspace_id: string;
  tab_id: string;
  focused: boolean;
  cwd?: string;
  foreground_cwd?: string;
  label?: string;
  agent?: string;
  title?: string;
  display_agent?: string;
  agent_status: AgentStatus;
  revision: number;
}

export interface PaneReadResult {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  source: ReadSource;
  format: ReadFormat;
  text: string;
  revision: number;
  truncated: boolean;
}

export interface AgentSessionInfo {
  source: string;
  agent: string;
  kind: string;
  value: string;
}

export interface AgentInfo {
  terminal_id: string;
  name?: string;
  agent?: string;
  title?: string;
  display_agent?: string;
  agent_status: AgentStatus;
  agent_session?: AgentSessionInfo;
  workspace_id: string;
  tab_id: string;
  pane_id: string;
  focused: boolean;
  launch_pending?: boolean;
  interactive_ready?: boolean;
  state_change_seq?: number;
  cwd?: string;
  foreground_cwd?: string;
  revision: number;
}

/**
 * loom `SessionSnapshot` is large; only the fields a substrate reads are typed
 * explicitly, with the collections left open for forward-compatibility.
 */
export interface SessionSnapshot {
  version: string;
  protocol: number;
  focused_workspace_id?: string;
  focused_tab_id?: string;
  focused_pane_id?: string;
  workspaces: WorkspaceInfo[];
  tabs: TabInfo[];
  panes: PaneInfo[];
  agents: AgentInfo[];
  [key: string]: unknown;
}

// --- Result envelope --------------------------------------------------------

/**
 * The `type`-tagged result variants a substrate consumes (serde snake_case
 * tags). The engine emits ~40 variants; unknown tags still parse through the
 * catch-all so the client never fabricates a result for an untyped line.
 */
export type LoomResult =
  | {
      type: 'pong';
      version: string;
      protocol: number;
      capabilities?: ServerCapabilities | null;
    }
  | { type: 'session_snapshot'; snapshot: SessionSnapshot }
  | {
      type: 'worktree_created';
      workspace: WorkspaceInfo;
      tab: TabInfo;
      root_pane: PaneInfo;
      worktree: WorktreeInfo;
    }
  | {
      type: 'worktree_removed';
      workspace_id: string;
      path: string;
      forced: boolean;
    }
  | { type: 'agent_started'; agent: AgentInfo; argv: string[] }
  | { type: 'agent_info'; agent: AgentInfo }
  | { type: 'agent_prompted'; agent: AgentInfo }
  | { type: 'pane_read'; read: PaneReadResult }
  | { type: 'subscription_started' }
  | { type: 'ok' }
  | { type: string; [key: string]: unknown };

/** Convenience narrower for the `pong` handshake result. */
export type PongResult = Extract<LoomResult, { type: 'pong' }>;

export interface LoomErrorBody {
  code: string;
  message: string;
}

/** Success envelope: `{ id, result: { type, ... } }`. */
export interface LoomSuccessResponse<
  Result extends LoomResult = LoomResult,
> {
  id: string;
  result: Result;
}

/** Error envelope: `{ id, error: { code, message } }`. */
export interface LoomErrorResponse {
  id: string;
  error: LoomErrorBody;
}

export type LoomResponse = LoomSuccessResponse | LoomErrorResponse;

/**
 * A bare subscription line: `{ event, data }`, emitted after the initial
 * `subscription_started` result until the caller closes. These have no `id` and
 * no `result` — they must never be treated as a request/response reply.
 */
export interface LoomSubscriptionEvent {
  event: string;
  data: unknown;
}

// --- Discriminators ---------------------------------------------------------

export function isLoomSuccessResponse(
  value: unknown
): value is LoomSuccessResponse {
  return isRecord(value) && 'result' in value && isRecord(value.result);
}

export function isLoomErrorResponse(
  value: unknown
): value is LoomErrorResponse {
  return isRecord(value) && 'error' in value && isRecord(value.error);
}

export function isLoomSubscriptionEvent(
  value: unknown
): value is LoomSubscriptionEvent {
  return (
    isRecord(value) &&
    typeof value.event === 'string' &&
    !('result' in value) &&
    !('error' in value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}
