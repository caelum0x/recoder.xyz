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
import type { ModuleToolsRegistration } from './mcp/host-registrar.js';
import type { DomainToolsRegistration } from './adapters/domain-tools-bridge.adapter.js';
import type { EngineId, EngineHealth } from './types.js';
import type { GithubModule } from './github/index.js';
import type { NotifyEngine } from '@recoder/agent-notify';

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
  /**
   * The OWNED notify engine (webhook delivery) the `recoder.notify` MCP tool binds
   * over. Injected by bootstrap so the SAME instance backs both the agent-callable
   * `notify.send` tool and observability's alert/board seams. Absent (tests /
   * standalone) ⇒ the composer builds a degrade-safe one (truthful `not_configured`
   * until a webhook is configured).
   */
  readonly notifyEngine?: NotifyEngine;
  /** Not-yet-in-AppConfig engine values (paths / URLs / venvs / flags). */
  readonly overrides?: EnginesConfigOverrides;
}

/** The public surface bootstrap + capability domains consume. */
export interface EnginesModule {
  readonly name: 'engines';
  /** A typed engine client by id (null when the engine is not declared). */
  client(id: EngineId): EngineClientPort | null;
  /**
   * The LIVE loopback base URL a supervised daemon/sidecar publishes once healthy
   * (`http://127.0.0.1:PORT`), the operator's external URL, or `null` when not
   * (yet) reachable. For raw-HTTP consumers; prefer `client(id)` for the typed
   * seam. Read lazily — with fire-and-forget boot spawn it is `null` until the
   * engine's first health passes.
   */
  endpoint(id: EngineId): string | null;
  /**
   * The tensorzero embedded-gateway client — the ONE the inference module's napi
   * tier binds over (CONFLICT #8-safe: shared `.node` load). Null if undeclared.
   */
  tensorzero(): EngineClientPort | null;
  /**
   * The unified GitHub module (docs/modules/github.md): gh CLI + recodergit
   * facets behind ONE interface, and the single truthful `GithubHealth` source.
   */
  github(): GithubModule;
  /** The in-memory declared-engine catalog (capability discovery surface). */
  registry(): EngineRegistryPort;
  /** The interop-gated MCP host agent-os + conductor register their tools into. */
  host(): McpHostPort;
  /**
   * Bridge: map a domain's flat `mcp()` tools onto the host's serverId+toolNames
   * model + bind a delegating handler per tool (gated execute). Bootstrap calls
   * this per domain that exposes `mcp()`. Degrade-safe when the host is unready.
   */
  registerModuleTools(
    serverId: string,
    tools: readonly McpToolRegistration[],
  ): ModuleToolsRegistration;
  /**
   * COLLISION-SAFE bridge (preferred over `registerModuleTools`): register one
   * domain's flat `mcp()` tools into the gated host under `serverId`. First
   * registration wins — a serverId already in the gated registry, or a duplicate
   * tool name within the list, is logged + skipped truthfully (never clobbered);
   * an empty tool list is a no-op. Bootstrap calls this after each domain is
   * built (`engines.registerDomainTools('conductor', conductor.mcp())`, …).
   */
  registerDomainTools(
    serverId: string,
    tools: readonly McpToolRegistration[],
  ): DomainToolsRegistration;
  /** Truthful live health for every declared engine. */
  listHealth(): Promise<readonly EngineHealth[]>;
  /**
   * The `/api/mcp` domain router: the read-only `/engines` surface PLUS the
   * governed MCP HTTP edge the agents' stdio bridge calls (`GET /servers`,
   * `POST /tools/:server/:tool/call`, `POST /call`, `POST /engines/:id/restart`).
   * Every tool call traverses interop's `authorize → risk → execute → audit`.
   */
  routes(): Router;
  /**
   * The `INTERNAL_SERVICE_KEY`-gated worker surface bootstrap mounts at
   * `/internal/engines` (→ `GET /internal/engines/health`: truthful per-engine
   * health).
   */
  internalRoutes(): Router;
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

/**
 * In-process openfang run seam (path b). Re-exported from the barrel so consumer
 * domains (the conductor `in_process` substrate) reach the LIVE engine through the
 * ONE public engines interface — never by importing an engine internal directly.
 * Both are fully degrade-safe: `getOpenfangEngine` returns `undefined` when the
 * addon is absent / the kernel fails to boot, and `launchOpenfangRun` returns a
 * truthful `{ available:false }` in that case — neither throws across the seam.
 */
export { launchOpenfangRun } from './openfang-runtime.js';
export type {
  OpenfangLaunchInput,
  OpenfangLaunchDeps,
  OpenfangLaunchResult,
  OpenfangRunEventSink,
} from './openfang-runtime.js';
export { getOpenfangEngine } from './openfang-native.js';
export type { OpenfangEngineInstance } from './openfang-native.js';

/** The domain-tools bridge types bootstrap consumes when registering `mcp()` tools. */
export type {
  DomainToolsSource,
  DomainToolsRegistration,
} from './adapters/domain-tools-bridge.adapter.js';

/** The unified GitHub module surface (single truthful `GithubHealth` source). */
export type { GithubModule } from './github/index.js';
export type { GithubHealth, GithubFacetHealth } from './github/index.js';
