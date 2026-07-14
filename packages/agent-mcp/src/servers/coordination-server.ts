import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

/**
 * `recoder.coordination` — the MCP skin over the advisory Coordination engine
 * (RECODER-ENGINES E13: work-locks, conflict detection, handoff). Four tools:
 * `coordination.acquire_lock`, `coordination.release_lock`,
 * `coordination.list_locks`, `coordination.detect_conflict`.
 *
 * This SUPERSEDES the older `recoder.work_locks` server (`work_locks.list/acquire/
 * release`), which throws on conflict and is bound to the agent-os `WorkLockService`
 * + in-memory state callbacks. This skin is the owned-engine mirror of
 * `retrieval-server.ts`: the package owns NO engine logic and assumes no backing
 * store. The host (backend) injects a concrete `CoordinationPort` built over
 * `@recoder/coordination`'s advisory engine + an injectable lock store (in-memory
 * default; a Go `multica` daemon or DB store later). Every handler degrades
 * truthfully — the engine returns a `not_configured` status (never throws, never
 * fabricates) when no lock store is wired.
 */
export const coordinationMcpServer: McpServerRegistration = {
  serverId: 'recoder.coordination',
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: 'custom',
  displayName: 'Recoder Coordination',
  transport: 'http',
  enabled: true,
  toolNames: [
    'coordination.acquire_lock',
    'coordination.release_lock',
    'coordination.list_locks',
    'coordination.detect_conflict',
  ],
  metadata: { engine: 'coordination' },
};

/**
 * The host-injected coordination engine. Structurally satisfied by
 * `@recoder/coordination`'s `CoordinationLockEngine`; typed loosely (`unknown`
 * results) so this package needs no dependency on the engine implementation.
 */
export type CoordinationPort = {
  acquireLock(
    resource: string,
    holder: string,
    opts?: { ttlMs?: number; metadata?: Record<string, unknown>; lockId?: string },
  ): Promise<unknown>;
  releaseLock(lockIdOrResource: string, holder: string): Promise<unknown>;
  listLocks(filter?: { resource?: string; holder?: string }): Promise<unknown>;
  detectConflict(resource: string, holder: string): Promise<unknown>;
};

export function registerCoordinationMcpTools(
  router: McpToolRouter,
  port: CoordinationPort,
): void {
  router.register(coordinationMcpServer, 'coordination.acquire_lock', async (input) => {
    const resource = readRequiredString(input.args.resource, 'resource');
    // `holder` defaults to the calling agent's identity when omitted.
    const holder = readString(input.args.holder) ?? input.actor.agentId;
    const result = await port.acquireLock(resource, holder, {
      ttlMs: readNumber(input.args.ttlMs),
      metadata: readRecord(input.args.metadata),
      lockId: readString(input.args.lockId),
    });
    return { content: result, metadata: { engine: 'coordination' } };
  });

  router.register(coordinationMcpServer, 'coordination.release_lock', async (input) => {
    // Accept either a `lockId` or a `resource` key as the release target.
    const target =
      readString(input.args.lockId) ??
      readString(input.args.resource) ??
      readRequiredString(input.args.lockId, 'lockId or resource');
    const holder = readString(input.args.holder) ?? input.actor.agentId;
    const result = await port.releaseLock(target, holder);
    return { content: result, metadata: { engine: 'coordination' } };
  });

  router.register(coordinationMcpServer, 'coordination.list_locks', async (input) => {
    const result = await port.listLocks({
      resource: readString(input.args.resource),
      holder: readString(input.args.holder),
    });
    return { content: result, metadata: { engine: 'coordination' } };
  });

  router.register(coordinationMcpServer, 'coordination.detect_conflict', async (input) => {
    const resource = readRequiredString(input.args.resource, 'resource');
    const holder = readString(input.args.holder) ?? input.actor.agentId;
    const result = await port.detectConflict(resource, holder);
    return { content: result, metadata: { engine: 'coordination' } };
  });
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
