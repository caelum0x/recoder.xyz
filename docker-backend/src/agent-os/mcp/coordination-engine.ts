/**
 * coordination-engine — docker-backend's concrete binding for the
 * `recoder.coordination` MCP server (RECODER-ENGINES E13). It composes the OWNED
 * `@recoder/coordination` advisory engine over an INJECTABLE lock store, then
 * registers the package's real `coordination.acquire_lock` / `release_lock` /
 * `list_locks` / `detect_conflict` handlers behind the interop gate.
 *
 * This mirrors `retrieval-engine.ts`. The lock store is the seam a Go `multica`
 * daemon or a DB-backed store fills later with NO change here: pass a
 * `CoordinationLockStore` in `deps.store`. The default is the degrade-safe
 * in-memory store, so with zero external services the desktop boots and the
 * tools stay callable and truthful (everything works in-process; a
 * not_configured store degrades to `status: 'not_configured'`).
 *
 * Nothing here fakes success.
 *
 * NOTE: this SUPERSEDES the older `recoder.work_locks` server (`work-locks-server.ts`
 * / agent-os `WorkLockService`, which throws on conflict). Central registration is
 * the orchestrator's job — this file only exposes the composed registrar.
 */
import { registerCoordinationMcpTools as registerCoordinationToolHandlers } from '@recoder/agent-mcp';
import {
  createCoordinationLockEngine,
  createInMemoryLockStore,
  type CoordinationLockStore,
} from '@recoder/coordination';
import type { McpToolRouter } from '@recoder/agent-mcp';

export type CoordinationEngineDeps = {
  /**
   * Injectable lock store — the remote-store seam. Defaults to the degrade-safe
   * in-memory store (`createInMemoryLockStore`). A Go `multica` daemon or a DB
   * adapter drops in here without touching the engine or the handlers.
   */
  store?: CoordinationLockStore;
  /** Injectable clock (epoch-ms). Defaults to `Date.now`. */
  now?: () => number;
  /** Injectable lock-id generator. Defaults to `crypto.randomUUID`. */
  generateId?: () => string;
  /** Default advisory lock lifetime in ms. */
  defaultTtlMs?: number;
};

/**
 * Register the REAL coordination handlers on the router. The lock store is the
 * injectable seam; the default in-memory store keeps every op working in-process
 * with zero external services, degrade-safe to `not_configured` when a wired
 * remote store reports unconfigured.
 */
export function registerCoordinationMcpTools(
  router: McpToolRouter,
  deps: CoordinationEngineDeps = {},
): void {
  const engine = createCoordinationLockEngine({
    store: deps.store ?? createInMemoryLockStore(),
    now: deps.now,
    generateId: deps.generateId,
    defaultTtlMs: deps.defaultTtlMs,
  });

  registerCoordinationToolHandlers(router, engine);
}

export { coordinationMcpServer } from '@recoder/agent-mcp';
