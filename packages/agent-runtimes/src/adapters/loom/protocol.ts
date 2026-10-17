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
// Only the narrow methods Recoder needs are typed here (ping, session.snapshot,
// worktree.create, worktree.remove, agent.start, agent.get, agent.read,
// agent.prompt, agent.wait, pane.send_text, events.subscribe, and the
// terminal_manager.* family below). The full engine exposes a much larger
// control surface.
//
// terminal_manager.* (open/write/status/close/stream) is the seam
// docs/T3CODE-FORK.md's patch queue #1 names: a headless, worktree-scoped PTY
// a caller with no open Loom workspace/tab/pane layout (i.e. the forked t3
// environment server, `third_party/t3code/apps/server`) can drive directly —
// see `apps/desktop/engines/loom/src/terminal_manager.rs` (the registry) and
// `src/api/server/terminal_manager_{ops,stream}.rs` (this protocol's Rust
// implementation), landed 2026-10-15 on the Loom side. These five methods are
// a DIFFERENT shape from `pane.*`/`worktree.*` above: no workspace/tab/pane
// target, just an opaque `pane_handle` scoped by a caller-supplied
// `worktree_id` string (Loom does not resolve or validate it).

/**
 * loom `PROTOCOL_VERSION`. A `ping` reply whose `protocol` differs from this is
 * an incompatible server; callers must reject rather than proceed.
 */
export const LOOM_PROTOCOL_VERSION = 21;

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
  | 'worktree.status'
  | 'agent.start'
  | 'agent.get'
  | 'agent.query'
  | 'agent.read'
  | 'agent.prompt'
  | 'agent.wait'
  | 'pane.send_text'
  | 'pane.terminal.stream'
  | 'events.subscribe'
  | 'terminal_manager.open'
  | 'terminal_manager.write'
  | 'terminal_manager.status'
  | 'terminal_manager.close'
  | 'terminal_manager.stream';

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

/**
 * loom `BlockedKind` -- the DECLARED reason a blocked agent is waiting (serde
 * snake_case). Emitted only when a screen rule wins with a declared kind; agents
 * without a screen manifest (recoder_code / qwen_code / crush) and non-blocked /
 * hook-decided states carry none. Recoder never fabricates a kind -- an
 * undeclared or unrecognised value is surfaced as `undefined`.
 *  - `approval` = waiting for the human to APPROVE an action.
 *  - `trust`    = waiting for a TRUST / permission decision.
 *  - `input`    = a plain question that needs input.
 */
export type BlockedKind = 'approval' | 'input' | 'trust';

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
  /**
   * Optional per-agent environment applied to the spawned agent. loom filters
   * entries through its managed-pane denylist: reserved loom/Recoder runtime
   * variables and host-secret patterns are dropped and can never override a
   * protected runtime variable. Only honored for POSIX shells.
   */
  env?: Record<string, string>;
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

/** Raw pane text injection without an implicit Enter/submit. */
export interface PaneSendTextParams {
  pane_id: string;
  text: string;
}

/** A public terminal attachment over Loom's owner-only control socket. */
export interface PaneTerminalStreamParams {
  pane_id: string;
  mode: 'control' | 'observe';
  cols: number;
  rows: number;
  takeover?: boolean;
}

/**
 * `terminal_manager.open` params (`TerminalManagerOpenParams` in
 * `apps/desktop/engines/loom/src/api/schema/terminal_manager.rs`).
 * `worktree_id` is an opaque scoping key the CALLER chooses (Loom does not
 * resolve or validate it against a real worktree path) — it exists purely
 * for isolation + observability, echoed back by `terminal_manager.status`.
 */
export interface TerminalManagerOpenParams {
  worktree_id: string;
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  shell?: string;
}

/** Shared target shape for every other `terminal_manager.*` method. */
export interface TerminalManagerPaneTarget {
  pane_handle: string;
}

/** `terminal_manager.write` params — binary-safe (unlike `pane.send_text`'s plain-UTF-8 `text`). */
export interface TerminalManagerWriteParams {
  pane_handle: string;
  /** Base64-encoded raw bytes written to the pane's PTY stdin. */
  data_base64: string;
}

/**
 * The two push frames and the terminal frame emitted on a
 * `terminal_manager.stream` connection after its initial
 * `terminal_manager_stream_started` ack — bare `{type, ...}` lines, same
 * convention as {@link LoomTerminalEvent} (`pane.terminal.stream`'s own
 * push frames), not an `events.subscribe`-style `{event, data}` envelope.
 */
export type LoomTerminalManagerStreamEvent =
  | { type: 'terminal_manager.output'; pane_handle: string; data_base64: string }
  | { type: 'terminal_manager.exited'; pane_handle: string; exit_code: number | null }
  | { type: 'terminal_manager.closed'; pane_handle: string; reason?: string | null };

export interface LoomTerminalFrame {
  type: 'terminal.frame';
  seq: number;
  encoding: 'ansi';
  width: number;
  height: number;
  full: boolean;
  /** Base64-encoded ANSI bytes. */
  bytes: string;
}

export interface LoomTerminalClosed {
  type: 'terminal.closed';
  reason?: string;
}

export type LoomTerminalEvent = LoomTerminalFrame | LoomTerminalClosed;

// --- agent.query filter/sort vocabulary -------------------------------------
//
// Mirrors loom's `agent.view.set` predicate language (serde shapes in
// `src/api/schema/agents.rs`): `agent.query` is a stored view applied inline as
// a one-shot, pure read. The engine authors and validates this vocabulary; these
// types exist so a caller can build a well-formed request, but the engine is the
// source of truth and rejects anything it considers invalid.

/** loom `AgentViewBuiltinField` (serde snake_case). */
export type AgentViewBuiltinField =
  | 'status'
  | 'workspace_id'
  | 'tab_id'
  | 'pane_id'
  | 'agent'
  | 'seen'
  | 'state_change_seq';

/**
 * A filterable field: either a builtin (above) or a custom metadata token
 * (`{ token }`), mirroring loom's untagged `AgentViewField`.
 */
export type AgentViewField = AgentViewBuiltinField | { token: string };

/** loom `AgentViewContext` (serde snake_case). */
export type AgentViewContext = 'current_workspace_id' | 'current_tab_id';

/**
 * A filter operand: a literal (string/bool/number) or a `{ context }` reference
 * resolved server-side against the presented session (untagged `AgentViewValue`).
 */
export type AgentViewValue =
  | string
  | boolean
  | number
  | { context: AgentViewContext };

/** loom `AgentViewFilter` (serde `tag = "op"`, snake_case). */
export type AgentViewFilter =
  | { op: 'all'; filters: AgentViewFilter[] }
  | { op: 'any'; filters: AgentViewFilter[] }
  | { op: 'not'; filter: AgentViewFilter }
  | { op: 'eq'; field: AgentViewField; value: AgentViewValue }
  | { op: 'in'; field: AgentViewField; values: AgentViewValue[] }
  | { op: 'exists'; field: AgentViewField };

/** loom `AgentViewSortOrder` (serde snake_case, defaults to `asc`). */
export type AgentViewSortOrder = 'asc' | 'desc';

/** loom `AgentViewBuiltinSortField` (serde snake_case). */
export type AgentViewBuiltinSortField =
  | 'workspace_order'
  | 'tab_order'
  | 'pane_order'
  | 'attention'
  | 'status'
  | 'agent'
  | 'seen'
  | 'state_change_seq';

/** A sortable field: a builtin (above) or a custom metadata token. */
export type AgentViewSortField = AgentViewBuiltinSortField | { token: string };

export interface AgentViewSort {
  field: AgentViewSortField;
  order?: AgentViewSortOrder;
}

/**
 * `agent.query` params: a server-side filtered + sorted read over the current
 * session's agent panes in ONE call. `limit` caps the result AFTER sort (top-N);
 * there is no field projection — the reply carries the full canonical
 * {@link AgentInfo} shape, same as `agent.get` / `session.snapshot`.
 */
export interface AgentQueryParams {
  filter?: AgentViewFilter;
  sort?: AgentViewSort[];
  limit?: number;
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
  /**
   * OPTIONAL incremental-refresh cursor (loom `since_seq`). When set, ring-backed
   * event subscriptions replay only retained events whose `seq` is GREATER than
   * this value before continuing live, so a cockpit can resume instead of
   * re-subscribing from scratch. Omit (or `0`) for a fresh subscription. A cursor
   * older than loom's retained window is refused with a `resume_gap`
   * {@link LoomError} rather than a silently-truncated stream — the caller must
   * then re-subscribe WITHOUT `since_seq` to resync.
   */
  since_seq?: number;
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

/**
 * `worktree.status` params: a pure-read Git work tree status for a single
 * workspace's checkout. Supply at most one of `workspace_id` or `cwd`; when
 * neither is given the engine reads the active workspace.
 */
export interface WorktreeStatusParams {
  workspace_id?: string;
  cwd?: string;
}

/**
 * The parsed result of `worktree.status` (loom's `worktree_status` result). It
 * feeds convergence planning (auto-mergeable-vs-contested + re-fan base
 * selection). TRUTHFULNESS: `ahead`/`behind` are only meaningful when
 * `has_upstream` is `true` — a `0/0` with `has_upstream === false` means the
 * branch has no configured upstream to compare against, never a fabricated
 * "in sync".
 */
export interface WorktreeStatus {
  /** Absolute path of the work tree the engine measured. */
  path: string;
  /** `changed_files > 0` (tracked changes and untracked files both count). */
  dirty: boolean;
  changed_files: number;
  has_upstream: boolean;
  ahead: number;
  behind: number;
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
  /** Runtime-only managed-pane credential for Recoder's governed MCP edge. */
  capability_token?: string;
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
  /**
   * OPTIONAL screen-rule provenance (loom detect): the id of the winning screen
   * rule for the current state. `undefined` for hook-decided / manifest-less
   * agents. Purely informational -- never a fabricated id.
   */
  agent_rule_id?: string;
  /**
   * OPTIONAL declared block taxonomy (see {@link BlockedKind}). `undefined` when
   * the agent is not blocked, has no screen manifest, or the state was
   * hook-decided. Never fabricated.
   */
  agent_blocked_kind?: BlockedKind;
  revision: number;
}

/**
 * The OPTIONAL screen-rule provenance parsed off an {@link AgentInfo} or a
 * `pane.agent_status_changed` event `data` payload, normalised from the
 * snake_case wire to camelCase. Both fields are absent unless loom DECLARED
 * them; an unrecognised `agent_blocked_kind` is dropped (never coerced into a
 * fabricated kind).
 */
export interface BlockedProvenance {
  agentRuleId?: string;
  agentBlockedKind?: BlockedKind;
}

const BLOCKED_KINDS: readonly BlockedKind[] = ['approval', 'input', 'trust'];

function isBlockedKind(value: unknown): value is BlockedKind {
  return (
    typeof value === 'string' &&
    (BLOCKED_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Defensively read the OPTIONAL `agent_rule_id` + `agent_blocked_kind` off any
 * loom shape that may carry them (an `AgentInfo`, or a status-changed event
 * `data`). Missing / blank / unrecognised fields yield `undefined` so the caller
 * degrades to its existing manifest-less behaviour rather than guessing.
 */
export function parseBlockedProvenance(source: unknown): BlockedProvenance {
  if (!isRecord(source)) return {};
  const out: BlockedProvenance = {};
  const ruleId = source.agent_rule_id;
  if (typeof ruleId === 'string' && ruleId.trim().length > 0) {
    out.agentRuleId = ruleId;
  }
  if (isBlockedKind(source.agent_blocked_kind)) {
    out.agentBlockedKind = source.agent_blocked_kind;
  }
  return out;
}

const AGENT_STATUSES: readonly AgentStatus[] = [
  'idle',
  'working',
  'blocked',
  'done',
  'unknown',
];

function isAgentStatus(value: unknown): value is AgentStatus {
  return (
    typeof value === 'string' &&
    (AGENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The `workspace.agent_status_changed` event `data` payload, normalised to
 * camelCase. This is a workspace-scoped AGGREGATE agent status — the fold over
 * the workspace's panes (blocked > done > working > idle > unknown, matching
 * `WorkspaceInfo.agent_status`) — emitted once when that folded status changes.
 * A client gets one aggregate edge per workspace instead of one event per pane,
 * powering an "instant converge-ready" signal on a single edge.
 */
export interface WorkspaceAgentStatusChanged {
  workspaceId: string;
  agentStatus: AgentStatus;
}

/**
 * Defensively read a `workspace.agent_status_changed` event `data` payload.
 * Any shape that is not that variant with a non-empty `workspace_id` and a
 * recognised `agent_status` yields `null` — the client never fabricates an
 * aggregate status (never invents a "ready"/"done" the panes do not support)
 * from a malformed or unexpected line.
 */
export function parseWorkspaceAgentStatusChangedEvent(
  source: unknown
): WorkspaceAgentStatusChanged | null {
  if (!isRecord(source)) return null;
  if (source.type !== 'workspace_agent_status_changed') return null;
  const workspaceId = source.workspace_id;
  if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
    return null;
  }
  if (!isAgentStatus(source.agent_status)) return null;
  return { workspaceId, agentStatus: source.agent_status };
}

/**
 * Defensively read the `agents` list off an `agent.query` reply. Accepts either
 * a raw `LoomResult` or the bare result record. Any shape that is not an
 * `agent_query` result with an array of object entries yields `[]` — the client
 * never fabricates agents from a malformed or unexpected line. Each entry is
 * passed through unchanged (it already carries the canonical {@link AgentInfo}
 * shape, including the OPTIONAL `agent_rule_id` / `agent_blocked_kind`
 * provenance); non-object entries are dropped rather than coerced.
 */
export function parseAgentQueryResult(source: unknown): AgentInfo[] {
  if (!isRecord(source)) return [];
  if (source.type !== 'agent_query') return [];
  const agents = source.agents;
  if (!Array.isArray(agents)) return [];
  // Structurally validated to records only; the wire objects already carry the
  // AgentInfo shape, so surface them as such without re-checking every field.
  return agents.filter(isRecord) as unknown as AgentInfo[];
}

/**
 * Defensively read a `worktree.status` reply into a {@link WorktreeStatus}.
 * Accepts either a raw `LoomResult` or the bare result record. Any shape that is
 * not a `worktree_status` result with every field present and correctly typed
 * yields `null` — the client never fabricates a status (e.g. a fake `0/0`
 * "in sync") from a malformed or unexpected line. A transport/error line is
 * still surfaced by the caller as a {@link LoomError} before this runs.
 */
export function parseWorktreeStatusResult(source: unknown): WorktreeStatus | null {
  if (!isRecord(source)) return null;
  if (source.type !== 'worktree_status') return null;
  const { path, dirty, changed_files, has_upstream, ahead, behind } = source;
  if (typeof path !== 'string') return null;
  if (typeof dirty !== 'boolean' || typeof has_upstream !== 'boolean') return null;
  if (
    typeof changed_files !== 'number' ||
    typeof ahead !== 'number' ||
    typeof behind !== 'number'
  ) {
    return null;
  }
  return { path, dirty, changed_files, has_upstream, ahead, behind };
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
  | {
      type: 'worktree_status';
      path: string;
      dirty: boolean;
      changed_files: number;
      has_upstream: boolean;
      ahead: number;
      behind: number;
    }
  | { type: 'agent_started'; agent: AgentInfo; argv: string[] }
  | { type: 'agent_info'; agent: AgentInfo }
  | { type: 'agent_query'; agents: AgentInfo[] }
  | { type: 'agent_prompted'; agent: AgentInfo }
  | { type: 'pane_read'; read: PaneReadResult }
  | { type: 'subscription_started'; cursor?: number }
  | {
      type: 'terminal_manager_opened';
      pane_handle: string;
      pid: number;
      worktree_id: string;
    }
  | {
      type: 'terminal_manager_status';
      pane_handle: string;
      alive: boolean;
      exit_code?: number | null;
      pid: number;
      worktree_id: string;
    }
  | { type: 'terminal_manager_stream_started'; pane_handle: string }
  | { type: 'ok' }
  | { type: string; [key: string]: unknown };

/** Convenience narrower for a successful `terminal_manager.open` reply. */
export type TerminalManagerOpenedResult = Extract<LoomResult, { type: 'terminal_manager_opened' }>;

/** Convenience narrower for a successful `terminal_manager.status` reply. */
export type TerminalManagerStatusResult = Extract<LoomResult, { type: 'terminal_manager_status' }>;

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
 * A bare subscription line: `{ seq?, event, data }`, emitted after the initial
 * `subscription_started` result until the caller closes. These have no `id` and
 * no `result` — they must never be treated as a request/response reply.
 *
 * Ring-backed lifecycle events (workspace/tab/pane/worktree/layout) carry the
 * server's monotonic per-emission `seq`, letting a client dedupe, DETECT A GAP
 * (a missing sequence between two received frames), and resume via
 * `events.subscribe { since_seq }`. Snapshot-derived subscription events
 * (`pane.output_matched`, `pane.agent_status_changed`, `pane.scroll_changed`)
 * have no ring position and so carry no `seq` — it is left `undefined` rather
 * than fabricated.
 */
export interface LoomSubscriptionEvent {
  seq?: number;
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

/** Validate the two server-to-client messages on a terminal stream. */
export function isLoomTerminalEvent(value: unknown): value is LoomTerminalEvent {
  if (!isRecord(value)) return false;
  if (value.type === 'terminal.closed') {
    return value.reason == null || typeof value.reason === 'string';
  }
  return (
    value.type === 'terminal.frame' &&
    typeof value.seq === 'number' &&
    Number.isInteger(value.seq) &&
    value.seq >= 0 &&
    value.encoding === 'ansi' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.full === 'boolean' &&
    typeof value.bytes === 'string'
  );
}

const TERMINAL_MANAGER_STREAM_EVENT_TYPES = new Set([
  'terminal_manager.output',
  'terminal_manager.exited',
  'terminal_manager.closed',
]);

/** Validate the three server-to-client messages on a `terminal_manager.stream` connection. */
export function isLoomTerminalManagerStreamEvent(
  value: unknown
): value is LoomTerminalManagerStreamEvent {
  if (!isRecord(value)) return false;
  if (typeof value.type !== 'string' || !TERMINAL_MANAGER_STREAM_EVENT_TYPES.has(value.type)) {
    return false;
  }
  if (value.type === 'terminal_manager.output') {
    return typeof value.pane_handle === 'string' && typeof value.data_base64 === 'string';
  }
  if (value.type === 'terminal_manager.exited') {
    return (
      typeof value.pane_handle === 'string' &&
      (value.exit_code === null || typeof value.exit_code === 'number')
    );
  }
  // terminal_manager.closed
  return (
    typeof value.pane_handle === 'string' &&
    (value.reason == null || typeof value.reason === 'string')
  );
}

/**
 * Defensively read a monotonic `seq` off a value (an event frame or a
 * `subscription_started` `cursor`). Only a finite, non-negative, integral number
 * is accepted; anything else (missing, string, NaN, negative, fractional) yields
 * `undefined` so the caller never advances a resume cursor from a fabricated or
 * malformed value.
 */
export function parseEventSeq(value: unknown): number | undefined {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
  ) {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}
