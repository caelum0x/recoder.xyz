/**
 * `recoder.dmux` — the MCP skin over the DEEP pane/layout capability the `dmux`
 * engine drives: programmatic arrangement of a multi-agent workspace view over
 * the SHARED tmux substrate (the same tmux server the dmux TUI arranges its
 * worktree-backed agent panes on — apps/desktop/engines/dmux/src/utils/layoutManager.ts).
 *
 *  - `dmux.layout_presets` → enumerate the layout presets (static; truthful even
 *    when tmux is absent), including the dmux-flavored `agent-grid`.
 *  - `dmux.panes_list`     → list panes in a target session (or all sessions):
 *    id/index/active/geometry/command/title, straight from `tmux list-panes`.
 *  - `dmux.panes_create`   → build a workspace grid: split a target window until
 *    it holds N panes, then apply an optional preset.
 *  - `dmux.layout_apply`   → apply a preset to a target window; `agent-grid` pins
 *    tmux `main-pane-width` to the dmux sidebar width before a `main-vertical`.
 *
 * This is DISTINCT from the `dmux` engine's operator-console `invoke` ops
 * (availability/sessions/attach-command/launch): those manage the TUI process;
 * these manage the layout. The `dmux` package ships no engine descriptor for
 * these ops, so this backend module defines the server descriptor locally and
 * registers the handlers directly on the shared router over the injected
 * {@link DmuxLayoutPort} (`DmuxAdapter.layout()`).
 *
 * IDENTITY: these tools are NOT tenant-subject-bearing — they operate on a
 * caller-supplied tmux target (a session name) on the operator's own tmux server,
 * never on tenant-partitioned Recoder state, so there is no cross-tenant subject
 * to bind (the closed cross-tenant provision/destroy class stays closed: no
 * tenant-keyed data path is introduced here). For the two side-effecting ops
 * (`panes_create`, `layout_apply`) the host-authorized caller IS threaded into the
 * result metadata as `requestedBy` for a truthful audit trail. Every call still
 * traverses interop's `authorize → risk → execute → audit` gate at the host
 * boundary. (If a future variant ever keyed panes to tenant state, it MUST thread
 * `callerFromInput` and bind the subject — do not relax this.)
 *
 * Truthful degrade: an unbound port (adapter absent) or a `{ ok:false }` from the
 * port (no tmux, missing session, bad input) throws the real reason — the interop
 * host records it. Nothing is ever fabricated.
 */
import type { McpToolRouter, McpToolResult, McpToolCallInput } from '@recoder/agent-mcp';
import type { McpServerRegistration } from '@recoder/interop';
import type { InvokeResult } from '../types.js';
import type { DmuxLayoutPort, DmuxLayoutPreset } from '../dmux-adapter.js';

/** The in-proc server id for the deep dmux pane/layout tools. */
export const DMUX_LAYOUT_SERVER_ID = 'recoder.dmux';

/**
 * The server descriptor for the gated registry catalog. The serial integrator
 * adds this to `IN_PROC_SERVERS` (registration) + `ENGINE_SERVERS` (owned
 * handlers) so the wiring guard passes and the tools are agent-visible + callable.
 */
export const dmuxLayoutMcpServer: McpServerRegistration = {
  serverId: DMUX_LAYOUT_SERVER_ID,
  kind: 'custom',
  displayName: 'Recoder dmux (pane/layout for a multi-agent workspace)',
  transport: 'http',
  enabled: true,
  toolNames: ['dmux.layout_presets', 'dmux.panes_list', 'dmux.panes_create', 'dmux.layout_apply'],
  metadata: { engine: 'dmux', capability: 'pane-layout' },
};

/**
 * Register the four pane/layout handlers on the shared router over the injected
 * {@link DmuxLayoutPort}. An absent port (adapter not bound in the composer) still
 * registers handlers that throw a truthful "not bound" — so the tools never 404
 * and the wiring guard passes; they just report unavailability on call.
 */
export function registerDmuxLayoutMcpTools(router: McpToolRouter, port: DmuxLayoutPort | null): void {
  router.register(dmuxLayoutMcpServer, 'dmux.layout_presets', async () => {
    const engine = requirePort(port);
    return unwrap(await engine.presets(), 'dmux.layout_presets');
  });

  router.register(dmuxLayoutMcpServer, 'dmux.panes_list', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const target = optionalString(args.target);
    return unwrap(await engine.listPanes(target != null ? { target } : {}), 'dmux.panes_list');
  });

  router.register(dmuxLayoutMcpServer, 'dmux.panes_create', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const target = requireString(args.target, 'dmux.panes_create requires args.target (a tmux session)');
    const count = requireNumber(args.count, 'dmux.panes_create requires args.count (panes desired)');
    const cwd = optionalString(args.cwd);
    const layout = optionalPreset(args.layout);
    return unwrap(
      await engine.createPanes({
        target,
        count,
        ...(cwd != null ? { cwd } : {}),
        ...(layout != null ? { layout } : {}),
      }),
      'dmux.panes_create',
      { requestedBy: requestedBy(input) },
    );
  });

  router.register(dmuxLayoutMcpServer, 'dmux.layout_apply', async (input) => {
    const engine = requirePort(port);
    const args = input.args ?? {};
    const target = requireString(args.target, 'dmux.layout_apply requires args.target (a tmux session)');
    const preset = requirePreset(args.preset);
    return unwrap(await engine.applyLayout({ target, preset }), 'dmux.layout_apply', {
      requestedBy: requestedBy(input),
    });
  });
}

/**
 * The `EngineToolBinder` factory the composer passes into
 * `InteropHostBundle({ engineBinders })`. Pass `adapter.layout()` (or null when the
 * dmux adapter is not bound).
 */
export function dmuxLayoutEngineBinder(port: DmuxLayoutPort | null): (router: McpToolRouter) => void {
  return (router) => registerDmuxLayoutMcpTools(router, port);
}

/** Map an `InvokeResult` onto the MCP result envelope; a failure throws the reason. */
function unwrap(
  result: InvokeResult<unknown>,
  tool: string,
  extraMeta: Record<string, unknown> = {},
): McpToolResult {
  if (!result.ok) {
    throw new Error(`${tool} failed: ${result.reason}`);
  }
  return {
    content: result.value,
    metadata: { engine: 'dmux', tool, ...pruneUndefined(extraMeta) },
  };
}

/**
 * The host-authorized actor for audit attribution. Prefers the edge-bound
 * authenticated principal (`input.caller.userId`) over the caller-controlled
 * `actor.agentId`; returns `'internal'` for a trusted non-edge in-proc call.
 */
function requestedBy(input: McpToolCallInput): string {
  const edge = input as McpToolCallInput & { caller?: { userId?: string } };
  const principal = typeof edge.caller?.userId === 'string' ? edge.caller.userId.trim() : '';
  if (principal) return principal;
  const agentId = typeof input.actor?.agentId === 'string' ? input.actor.agentId.trim() : '';
  return agentId || 'internal';
}

function requirePort(port: DmuxLayoutPort | null): DmuxLayoutPort {
  if (!port) {
    throw new Error('dmux engine not bound in the engines composer — pane/layout tools unavailable');
  }
  return port;
}

function requireString(value: unknown, errorMessage: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(errorMessage);
}

function requireNumber(value: unknown, errorMessage: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(errorMessage);
}

function requirePreset(value: unknown): DmuxLayoutPreset {
  const preset = optionalPreset(value);
  if (!preset) {
    throw new Error(
      `dmux.layout_apply requires args.preset (one of: ${VALID_PRESETS.join(', ')})`,
    );
  }
  return preset;
}

const VALID_PRESETS: readonly DmuxLayoutPreset[] = [
  'agent-grid',
  'tiled',
  'even-horizontal',
  'even-vertical',
  'main-vertical',
  'main-horizontal',
];

function optionalPreset(value: unknown): DmuxLayoutPreset | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim() as DmuxLayoutPreset;
  return VALID_PRESETS.includes(trimmed) ? trimmed : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined));
}
