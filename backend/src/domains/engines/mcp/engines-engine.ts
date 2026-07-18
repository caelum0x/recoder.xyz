/**
 * THIS domain's own MCP tools (the in-proc `engines` server): `engine.list`,
 * `engine.health`, `engine.restart`. Follows the `McpToolRegistration` shape the
 * host consumes; every call still passes the interop `authorize→risk→policy→audit`
 * gate at the host boundary, so these handlers stay thin and truthful.
 *
 * `engine.list` / `engine.health` are READ-ONLY (always safe). `engine.restart`
 * is a governed WRITE: the host risk-gates `engine.restart` (→ `needs_approval`)
 * and the composer records `engine_restart_log` + a governance audit ref. A
 * napi/CLI engine is NOT restartable and returns a truthful "not restartable"
 * instead of faking a restart.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { EngineDescriptor, EngineHealth, EngineId } from '../types.js';
import { isEngineId } from '../constants.js';

/** The read/restart surface the composer injects (over the live adapters). */
export interface EnginesMcpDeps {
  /** Declared engine descriptors + their transport/restartability. */
  listDescriptors(): readonly EngineDescriptor[];
  /** Truthful current health for every engine. */
  listHealth(): Promise<readonly EngineHealth[]>;
  /** Truthful current health for one engine (null when not declared). */
  engineHealth(id: EngineId): Promise<EngineHealth | null>;
  /**
   * Restart a supervised engine (governed write). `requestedBy` is the actor
   * DERIVED from the host-authorized caller (never a caller-supplied arg).
   * Returns the truthful outcome — a napi/CLI engine yields
   * `{ outcome: 'skipped', reason: 'not restartable' }`.
   */
  restart(id: EngineId, requestedBy: string, reason?: string): Promise<{
    readonly outcome: 'restarted' | 'skipped' | 'failed';
    readonly reason?: string;
    readonly auditRef?: string;
  }>;
}

interface EngineIdInput {
  readonly engineId?: string;
}
interface RestartInput extends EngineIdInput {
  readonly reason?: string;
}

/** The `engines` in-proc server id (matches the descriptor added to the catalog). */
export const ENGINES_MCP_SERVER_ID = 'engines';

/**
 * Resolve the actor that a governed `engine.restart` is attributed to, gated to
 * mirror the HTTP twin's `requireAdmin`.
 *
 * SECURITY: `engine.restart` is a governed GLOBAL infra op whose HTTP twin is
 * `requireAdmin`-gated and derives the actor from the authenticated principal.
 * The tool boundary MUST match: the acting identity is DERIVED from the
 * host-authorized {@link McpToolCaller} (never a spoofable `requestedBy` arg),
 * and only an `admin`/`internal` scope may drive it. An ABSENT caller is a
 * TRUSTED non-edge in-proc path (there is no edge principal to spoof — an edge
 * call always threads an authenticated caller), so it resolves to `internal`.
 */
function resolveRestartActor(
  caller: McpToolCaller | undefined,
): { readonly ok: true; readonly actor: string } | { readonly ok: false; readonly reason: string } {
  if (!caller) return { ok: true, actor: 'internal' };
  const scopes = caller.scopes ?? [];
  const privileged = scopes.includes('admin') || scopes.includes('internal');
  const userId = caller.userId?.trim();
  if (!privileged || !userId) {
    return { ok: false, reason: 'engine.restart requires an admin or internal caller' };
  }
  return { ok: true, actor: userId };
}

/** Build the engines-domain MCP tool registrations over the injected deps. */
export function buildEnginesMcpTools(deps: EnginesMcpDeps): readonly McpToolRegistration[] {
  return [
    {
      name: 'engine.list',
      description: 'List every declared engine: id, transport, restartability, and live health.',
      handler: async () => {
        const descriptors = deps.listDescriptors();
        const health = await deps.listHealth();
        const byId = new Map(health.map((entry) => [entry.engineId, entry]));
        return {
          count: descriptors.length,
          engines: descriptors.map((descriptor) => ({
            id: descriptor.id,
            transport: descriptor.transport,
            title: descriptor.title,
            restartable: descriptor.restartable,
            optional: descriptor.optional,
            health: byId.get(descriptor.id) ?? null,
          })),
        };
      },
    },
    {
      name: 'engine.health',
      description: "One engine's truthful health (probe + last known status). null when undeclared.",
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as EngineIdInput;
        const id = input.engineId?.trim();
        if (!id || !isEngineId(id)) return { error: 'engineId must be a declared engine id' };
        const health = await deps.engineHealth(id);
        return { health: health ?? null };
      },
    },
    {
      name: 'engine.restart',
      description:
        'Restart a supervised daemon/sidecar engine (governed write; admin/internal only). ' +
        'napi/CLI engines return a truthful "not restartable".',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as RestartInput;
        const id = input.engineId?.trim();
        if (!id || !isEngineId(id)) return { error: 'engineId must be a declared engine id' };
        // SECURITY: admin/internal-gated and attributed to the AUTHORIZED caller,
        // matching the HTTP twin's `requireAdmin` + principal-derived `requestedBy`.
        const actor = resolveRestartActor(caller);
        if (!actor.ok) return { error: actor.reason };
        const result = await deps.restart(id, actor.actor, input.reason);
        return { engineId: id, ...result };
      },
    },
  ];
}

/**
 * The `engines` server descriptor for the gated registry catalog. The composer
 * adds this to the host registry + registers the handlers above (so the wiring
 * guard passes). Kept minimal — the tool names must match `buildEnginesMcpTools`.
 */
export const enginesMcpServer = {
  serverId: ENGINES_MCP_SERVER_ID,
  kind: 'custom' as const,
  displayName: 'Engines (multi-language seam)',
  transport: 'custom' as const,
  enabled: true,
  toolNames: ['engine.list', 'engine.health', 'engine.restart'],
  metadata: { external: false },
};
