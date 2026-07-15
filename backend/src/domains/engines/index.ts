/**
 * Engines domain — public factory + the ONE public interface.
 *
 * `createEnginesModule(deps)` (ASYNC — mirrors the governance/inference factories)
 * builds the composer that fuses the multi-language engine seam into one module:
 * the three supervisors (napi loader / daemon / sidecar), the DEEP per-engine
 * adapters (openfang / tensorzero / governance-kernel napi; colbert / ops-recorder
 * / multica / ziti daemons; mem0 / browser-use / pal-mcp sidecars; beads / tmux /
 * dmux / recodergit CLIs), the interop-gated MCP host, and truthful health.
 *
 * The seam surface capability domains compile against is the typed engine client:
 * `client(id)` / `tensorzero()` hand back an `EngineClientPort` that CONSUMES the
 * one shared `.node` load (CONFLICT #8-safe) — no consumer imports an engine
 * `dist/` or dlopen's a second addon. `host()` is the ONE interop MCP host that
 * agent-os + conductor register their tools into.
 *
 * Degrade-safe throughout: without a built `.node` the napi tier reports `down`
 * and falls back; without a daemon binary the supervisor probe is `down`; without
 * a uv venv the sidecar is `down`; without a DB the health registry no-ops. Never
 * a faked `up`, never a hang.
 */
import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { GovernanceKernelPort } from '../governance/ports/kernel.port.js';
import type { EnginesConfigOverrides } from './config.js';
import type { EngineClientPort } from './ports/engine-client.port.js';
import type { EngineRegistryPort, McpHostPort } from './ports/index.js';
import type { EngineId, EngineHealth } from './types.js';

/** Dependencies injected by bootstrap (after persistence + identity + governance). */
export interface EnginesModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the engine registry/health/restart repo binds to. */
  readonly executor: QueryExecutor;
  /** The composed identity auth middleware the read-only engine routes guard with. */
  readonly middleware: AuthMiddleware;
  /**
   * The assembled governance kernel ladder (from the governance module). The napi
   * `governance` engine client re-exposes it — no second kernel is built here.
   */
  readonly kernel: GovernanceKernelPort;
  /** Not-yet-in-AppConfig engine values (paths / URLs / venvs / flags). */
  readonly overrides?: EnginesConfigOverrides;
}

/** The public surface bootstrap + capability domains consume. */
export interface EnginesModule {
  readonly name: 'engines';
  /** A typed engine client by id (null when the engine is not declared). */
  client(id: EngineId): EngineClientPort | null;
  /**
   * The tensorzero embedded-gateway client — the ONE the inference module's napi
   * tier binds over (CONFLICT #8-safe: shared `.node` load). Null if undeclared.
   */
  tensorzero(): EngineClientPort | null;
  /** The in-memory declared-engine catalog (capability discovery surface). */
  registry(): EngineRegistryPort;
  /** The interop-gated MCP host agent-os + conductor register their tools into. */
  host(): McpHostPort;
  /** Truthful live health for every declared engine. */
  listHealth(): Promise<readonly EngineHealth[]>;
  /** The read-only `/engines` router (list + per-engine health). */
  routes(): Router;
  /** The engines-domain MCP tools (`engine.list` / `engine.health` / `engine.restart`). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health (per-engine breakdown). */
  health(): Promise<ComponentHealth>;
  /** Boot hook: register napi engine tools into the host, log posture. Idempotent. */
  start(): Promise<void>;
  /** Shutdown hook: stop supervised daemons/sidecars. Idempotent, degrade-safe. */
  stop(): Promise<void>;
}

// Value import last so the type-only imports above form no runtime cycle.
import { EnginesComposer } from './engines-module.js';

/**
 * Build the engines module. ASYNC to mirror the governance/inference factories
 * (the napi tier + supervisors bind lazily; nothing spawns here). Never throws
 * for a missing native/daemon/venv path — every engine degrades truthfully.
 */
export async function createEnginesModule(deps: EnginesModuleDeps): Promise<EnginesModule> {
  return new EnginesComposer(deps);
}
