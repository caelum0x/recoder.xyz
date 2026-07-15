/**
 * `buildInProcEngineRouter` + `ENGINE_SERVERS` + `forEachInProcEngineTool` —
 * MOVED (behind the composer) from `agent-os/mcp/inproc-engines.ts`.
 *
 * The runtime-agnostic `@recoder/agent-mcp` servers are REAL but injected behind
 * ports (a `GitNexusPort`, a memory store, the agent-os repository, deploy/billing
 * deps). The concrete engines that back them are backend-specific, so instead of
 * this CORE module importing agent-os/conductor internals, the deep-engine
 * agents pass their `register*McpTools(router, deps)` calls as BINDERS. The
 * router applies each binder over one shared `McpToolRouter`.
 *
 * `ENGINE_SERVERS` is the catalog of servers whose tool handlers the router owns
 * (the subset of `IN_PROC_SERVERS` with concrete engines behind them);
 * `forEachInProcEngineTool` enumerates every `(serverId, toolName)` so the host
 * can register a delegating in-proc handler per tool that routes authorized
 * calls into the real router.
 */
import {
  McpRegistry,
  McpToolRouter,
  gitNexusMcpServer,
  tasksMcpServer,
  runsMcpServer,
  memoryMcpServer,
  beadsMcpServer,
  repoMcpServer,
  browserMcpServer,
  approvalsMcpServer,
  artifactsMcpServer,
  githubMcpServer,
  logsMcpServer,
  previewMcpServer,
  deploymentMcpServer,
  billingMcpServer,
  retrievalMcpServer,
  browserEngineMcpServer,
  coordinationMcpServer,
  workflowMcpServer,
  palPlanMcpServer,
  notifyMcpServer,
} from '@recoder/agent-mcp';
import type { McpServerRegistration } from '@recoder/interop';

/**
 * A binder registers one server's REAL tool handlers onto the shared router,
 * closing over its concrete engine deps. The deep-engine agents own these (e.g.
 * `(r) => registerBeadsMcpTools(r, { cwd })`); the CORE only orchestrates them.
 */
export type EngineToolBinder = (router: McpToolRouter) => void;

/**
 * Build a real `McpToolRouter` and apply every binder. Each binder registers a
 * server's package handlers over the injected concrete engines. A binder that
 * throws is isolated (logged via `onBinderError`) so one broken engine never
 * takes the whole router — the seam degrades to that engine's tools 404-ing
 * truthfully instead of failing boot.
 */
export function buildInProcEngineRouter(
  binders: readonly EngineToolBinder[],
  options: { readonly onBinderError?: (err: unknown, index: number) => void } = {},
): McpToolRouter {
  const router = new McpToolRouter(new McpRegistry());
  binders.forEach((bind, index) => {
    try {
      bind(router);
    } catch (err) {
      options.onBinderError?.(err, index);
    }
  });
  return router;
}

/**
 * The in-proc servers whose tools the engine router owns the concrete engines
 * for. IDENTICAL set to the moved `agent-os/mcp/inproc-engines.ts` `ENGINE_SERVERS`.
 */
export const ENGINE_SERVERS: readonly McpServerRegistration[] = [
  gitNexusMcpServer,
  tasksMcpServer,
  runsMcpServer,
  memoryMcpServer,
  beadsMcpServer,
  repoMcpServer,
  browserMcpServer,
  approvalsMcpServer,
  artifactsMcpServer,
  githubMcpServer,
  logsMcpServer,
  previewMcpServer,
  deploymentMcpServer,
  billingMcpServer,
  retrievalMcpServer,
  browserEngineMcpServer,
  coordinationMcpServer,
  workflowMcpServer,
  palPlanMcpServer,
  notifyMcpServer,
];

/**
 * Iterate every `(serverId, toolName)` the engine router can execute, so the
 * host can register a delegating in-proc handler per tool that routes authorized
 * calls into the real router.
 */
export function forEachInProcEngineTool(
  callback: (serverId: string, toolName: string) => void,
  servers: readonly McpServerRegistration[] = ENGINE_SERVERS,
): void {
  for (const server of servers) {
    for (const toolName of server.toolNames) {
      callback(server.serverId, toolName);
    }
  }
}
