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
import type { McpToolRegistration } from '../../../shared/module-base.js';
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
   * from the authorizing Session. Returns the truthful outcome — a napi/CLI
   * engine yields `{ outcome: 'skipped', reason: 'not restartable' }`.
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
  readonly requestedBy?: string;
  readonly reason?: string;
}

/** The `engines` in-proc server id (matches the descriptor added to the catalog). */
export const ENGINES_MCP_SERVER_ID = 'engines';

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
        'Restart a supervised daemon/sidecar engine (governed write; risk-gated). ' +
        'napi/CLI engines return a truthful "not restartable".',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as RestartInput;
        const id = input.engineId?.trim();
        if (!id || !isEngineId(id)) return { error: 'engineId must be a declared engine id' };
        const requestedBy = input.requestedBy?.trim();
        if (!requestedBy) return { error: 'requestedBy (the authorizing actor) is required' };
        const result = await deps.restart(id, requestedBy, input.reason);
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
