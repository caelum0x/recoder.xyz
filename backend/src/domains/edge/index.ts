/**
 * Edge domain — public factory + the ONE public surface.
 *
 * `createEdgeModule(deps)` builds the composer that assembles the stateless
 * HTTP/WS surface: the canonical middleware chain (over the identity verifier +
 * interop chain), the route table over the collected {@link RouteProvider}s, the
 * express app + HTTP server, and the single WS upgrade router (conflict #6). It
 * consumes the frozen seams of Phases 0–3 and re-implements none of them.
 *
 * The returned {@link EdgeModule} is what bootstrap listens on: `app`, `server`,
 * `listen()`, `stop()`, and a truthful `health()`. Fail-fast on a weak
 * production `/internal` key; degrade-safe for `down`/unresolved providers.
 */
import type { EdgeDeps, EdgeModule } from './types.js';
import { EdgeComposer, type EdgeComposerOptions } from './edge-module.js';

/** Build the edge module (optionally with route-table guard overrides). */
export function createEdgeModule(deps: EdgeDeps, options: EdgeComposerOptions = {}): EdgeModule {
  return new EdgeComposer(deps, options);
}

export { EdgeComposer } from './edge-module.js';
export type { EdgeComposerOptions } from './edge-module.js';

// Re-export the edge vocabulary so consumers import the domain from one place.
export type {
  EdgeDeps,
  EdgeModule,
  EdgeHealth,
  GuardPolicy,
  MountSpec,
  MountStatus,
  WsBackendStatus,
  AuthMode,
  RateTier,
} from './types.js';
export type { EdgeConfig, EdgeConfigOverrides } from './config.js';
export { sliceEdgeConfig } from './config.js';
export {
  buildRouteTable,
  defaultGuardForBase,
  type RouteTable,
  type ResolvedMount,
  type UnresolvedMount,
  type RouteTableOptions,
} from './route-table.js';
export { buildEdgeHealth, toComponentHealth } from './health.js';
export type { RouteProvider, OpenApiOperationSpec, RouteProviderHealth } from './ports/route-provider.port.js';
export type { WsBackend, WsConnectionCtx, WsAuthScope } from './ports/ws-backend.port.js';
