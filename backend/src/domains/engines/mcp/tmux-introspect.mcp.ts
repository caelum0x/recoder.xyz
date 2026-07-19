/**
 * tmux introspection MCP tools — the gated, READ-ONLY agent surface over the
 * DEEP {@link TmuxIntrospectPort} capability the tmux adapter gained on top of the
 * raw `TmuxAdapter.invoke` seam. Every call passes the interop
 * `authorize → risk → policy → audit` chain at the MCP host boundary, so these
 * handlers stay thin and truthful over the tmux adapter port.
 *
 *  - `tmux.list_sessions` — READ: every session on the shared tmux server (name,
 *    id, window count, attached flag, created/activity timestamps).
 *  - `tmux.list_windows`  — READ: windows, optionally scoped to one session.
 *  - `tmux.list_panes`    — READ: panes, optionally scoped to a session/window,
 *    with pid, dimensions, current command + path.
 *  - `tmux.capture_pane`  — READ: the buffered text content of one pane (bounded).
 *  - `tmux.server_info`   — READ: the server roll-up (version, running, session +
 *    client counts, vendored/pinned flag, binding path).
 *
 * STRICTLY READ-ONLY: there is NO send-keys / new-session / kill-session here —
 * mutating a live conductor session stays with the conductor's own gated
 * steer/stop path (this module never edits domains/conductor and never mutates).
 *
 * SECURITY — CROSS-TENANT CLASS STAYS CLOSED: the tmux server is a SHARED
 * control-plane resource whose `recoder-*` sessions span ALL tenants' conductor
 * runs, and its flat namespace carries NO per-tenant partition key. Enumerating
 * sessions or capturing raw pane content could therefore expose another tenant's
 * terminal output (source, secrets, agent transcripts). So every tool REQUIRES a
 * PRIVILEGED (`admin`/`internal`) caller — the host-authorized {@link McpToolCaller}
 * threaded by the registrar (`callerFromInput`), never spoofable model output. A
 * non-privileged caller is refused (403) and an absent identity refuses
 * (`AUTH_REQUIRED`) rather than guessing — a tenant agent can never read the
 * shared multiplexer. The host-authorized caller is echoed as `observedBy` in the
 * result for a truthful audit trail.
 *
 * DEGRADE-SAFE: an unbound port (tmux adapter absent) surfaces truthfully as
 * `{ available:false, reason }`; a `{ ok:false }` from the port (tmux binary
 * missing, disabled by config) is surfaced the same way. It never throws the seam
 * and never fabricates a session, pane, or capture.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { InvokeResult } from '../types.js';
import type { CapturePaneInput, TmuxIntrospectPort } from '../adapters/cli/tmux-introspect.adapter.js';

/** The in-proc MCP server id for the tmux introspection tools. */
export const TMUX_INTROSPECT_MCP_SERVER_ID = 'tmux';

/** The seam the tools bind to — the read-only tmux introspection port (or null). */
export interface TmuxIntrospectMcpDeps {
  /** The bound port, or null when the tmux adapter is absent (degrade-safe). */
  readonly port: TmuxIntrospectPort | null;
}

interface ListWindowsInput {
  readonly session?: string;
}

interface ListPanesInput {
  readonly target?: string;
}

interface CaptureInput {
  readonly target?: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly join?: boolean;
  readonly maxLines?: number;
}

/** Does the caller carry an elevated scope allowed to read the shared server? */
function isPrivileged(caller: McpToolCaller | undefined): boolean {
  const scopes = caller?.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/**
 * Require a PRIVILEGED caller. The shared tmux server has no per-tenant partition,
 * so only an `admin`/`internal` principal may observe it. An absent identity
 * refuses with `AUTH_REQUIRED`; a non-privileged one with a 403 — the cross-tenant
 * class stays closed. Returns the caller's id for audit attribution.
 */
function requirePrivileged(caller: McpToolCaller | undefined): string {
  const userId = caller?.userId?.trim();
  if (!caller || !userId) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'tmux: no authorized caller identity');
  }
  if (!isPrivileged(caller)) {
    throw createError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'tmux: introspection of the shared multiplexer requires an admin/internal caller',
    );
  }
  return userId;
}

/** Present an invoke result truthfully: the value on ok, a degrade object on fail. */
function present(result: InvokeResult<unknown>, observedBy: string): unknown {
  if (result.ok) return { observedBy, ...(result.value as object) as Record<string, unknown> };
  return { available: false, reason: result.reason, ...(result.code ? { code: result.code } : {}) };
}

/** Present a list result: keep the array under a stable key + audit metadata. */
function presentList(result: InvokeResult<readonly unknown[]>, key: string, observedBy: string): unknown {
  if (result.ok) return { [key]: result.value, count: result.value.length, observedBy };
  return { available: false, reason: result.reason, ...(result.code ? { code: result.code } : {}) };
}

/** A degrade object for an unbound port (tmux adapter absent in the composer). */
function unbound(): unknown {
  return { available: false, reason: 'tmux adapter not bound in the engines composer', code: 'unavailable' };
}

/** Build the tmux introspection MCP tool registrations over the port seam. */
export function buildTmuxIntrospectMcpTools(deps: TmuxIntrospectMcpDeps): readonly McpToolRegistration[] {
  return [
    {
      name: 'tmux.list_sessions',
      description:
        'READ-ONLY: list every session on the shared tmux server the conductor drives ' +
        '(name, id, window count, attached flag, created/activity timestamps). Requires an ' +
        'admin/internal caller. Returns { available:false, reason } truthfully when tmux is absent.',
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        const observedBy = requirePrivileged(caller);
        if (!deps.port) return unbound();
        return presentList(await deps.port.listSessions(), 'sessions', observedBy);
      },
    },
    {
      name: 'tmux.list_windows',
      description:
        'READ-ONLY: list tmux windows, optionally scoped to one session (args.session); with no ' +
        'session, lists windows across all sessions. Each row: index, id, name, active flag, pane ' +
        'count, layout. Requires an admin/internal caller. Truthful degrade when tmux is absent.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const observedBy = requirePrivileged(caller);
        if (!deps.port) return unbound();
        const input = (raw ?? {}) as ListWindowsInput;
        const session = input.session?.trim();
        return presentList(await deps.port.listWindows(session || undefined), 'windows', observedBy);
      },
    },
    {
      name: 'tmux.list_panes',
      description:
        'READ-ONLY: list tmux panes, optionally scoped to a session or window (args.target); with ' +
        'no target, lists panes across all sessions. Each row: id, index, pid, active flag, current ' +
        'command + path, width/height, title. Requires an admin/internal caller. Truthful degrade.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const observedBy = requirePrivileged(caller);
        if (!deps.port) return unbound();
        const input = (raw ?? {}) as ListPanesInput;
        const target = input.target?.trim();
        return presentList(await deps.port.listPanes(target || undefined), 'panes', observedBy);
      },
    },
    {
      name: 'tmux.capture_pane',
      description:
        'READ-ONLY: capture the buffered text content of one pane (args.target, a pane/window/session ' +
        'id). Optional args.startLine/-endLine select a scrollback range, args.join joins wrapped lines, ' +
        'args.maxLines bounds the returned lines (newest kept; default 500, max 5000). Requires an ' +
        'admin/internal caller. Truthful degrade when tmux is absent or the pane is unknown.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const observedBy = requirePrivileged(caller);
        if (!deps.port) return unbound();
        const input = (raw ?? {}) as CaptureInput;
        const target = input.target?.trim();
        if (!target) {
          throw createError(ErrorCode.INVALID_INPUT, 'tmux.capture_pane requires args.target (a pane id)');
        }
        const captureInput: CapturePaneInput = {
          target,
          ...(Number.isInteger(input.startLine) ? { startLine: input.startLine } : {}),
          ...(Number.isInteger(input.endLine) ? { endLine: input.endLine } : {}),
          ...(input.join === true ? { join: true } : {}),
          ...(Number.isInteger(input.maxLines) ? { maxLines: input.maxLines } : {}),
        };
        return present(await deps.port.capturePane(captureInput), observedBy);
      },
    },
    {
      name: 'tmux.server_info',
      description:
        'READ-ONLY: the shared tmux server roll-up — version, running flag, session + attached-client ' +
        'counts, whether the binary is the vendored/pinned one, and its binding path. Requires an ' +
        'admin/internal caller. Truthful degrade ({ available:false, reason }) when tmux is not installed.',
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        const observedBy = requirePrivileged(caller);
        if (!deps.port) return unbound();
        return present(await deps.port.serverInfo(), observedBy);
      },
    },
  ];
}

/**
 * The `tmux` server descriptor for the gated registry catalog. The engines
 * composer adds this to the host (`registerServer`) + binds the handlers above via
 * a gated delegating `registerInProcTool` (mirroring `bindMem0MemoryMcpTools`).
 * Tool names MUST match `buildTmuxIntrospectMcpTools`.
 */
export const tmuxIntrospectMcpServer = {
  serverId: TMUX_INTROSPECT_MCP_SERVER_ID,
  kind: 'custom' as const,
  displayName: 'tmux introspection (read-only)',
  transport: 'custom' as const,
  enabled: true,
  toolNames: [
    'tmux.list_sessions',
    'tmux.list_windows',
    'tmux.list_panes',
    'tmux.capture_pane',
    'tmux.server_info',
  ],
  metadata: { external: false, engine: 'tmux' },
};
