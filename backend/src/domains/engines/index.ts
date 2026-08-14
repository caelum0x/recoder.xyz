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
import type { ToolExecEnforcementPort } from '../governance/ports/tool-exec-gate.port.js';
import type { EnginesConfigOverrides } from './config.js';
import type { EngineClientPort } from './ports/engine-client.port.js';
import type { TmuxIntrospectPort } from './adapters/cli/tmux-introspect.adapter.js';
import type { DmuxLayoutPort } from './dmux-adapter.js';
import type { EngineRegistryPort, McpHostPort, McpHostTelemetry } from './ports/index.js';
import type { ModuleToolsRegistration } from './mcp/host-registrar.js';
import type { DomainToolsRegistration } from './adapters/domain-tools-bridge.adapter.js';
import type { EngineId, EngineHealth } from './types.js';
import type { OpenfangRunEventSink } from './openfang-runtime.js';
import type { AgentEngineService } from './ports/agent-engine.port.js';
import type { PalBrainService } from './ports/pal-brain.port.js';
import type { GithubModule } from './github/index.js';
import type { NotifyEngine } from '@recoder/agent-notify';
// TYPE-ONLY edge (erased at build): the DB-catalog config-provider shape the
// inference domain owns, consumed by the typed `setTensorzeroCatalogProvider`
// accessor below. Not a static value import — no runtime engines→inference edge.
import type { CatalogConfigProvider } from '../inference/adapters/tz-config-generator.js';
import type { TensorzeroConfigProvider } from './ports/tensorzero-config.port.js';

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
   * The per-tool governance teeth (`governance.toolExecGate()`), injected by
   * bootstrap and threaded into the interop MCP host's executor chokepoint so
   * EVERY authorized recoder-MCP tool call runs the fine-grained kernel
   * enforcement (deny-biased + Merkle-sealed) before dispatch. Absent (tests /
   * standalone) ⇒ the host is a truthful pass-through — never a fake-allow. Its
   * coverage is the recoder-MCP tool stream only; see the engines MCP host doc.
   */
  readonly toolExecGate?: ToolExecEnforcementPort;
  /**
   * The OWNED notify engine (webhook delivery) the `recoder.notify` MCP tool binds
   * over. Injected by bootstrap so the SAME instance backs both the agent-callable
   * `notify.send` tool and observability's alert/board seams. Absent (tests /
   * standalone) ⇒ the composer builds a degrade-safe one (truthful `not_configured`
   * until a webhook is configured).
   */
  readonly notifyEngine?: NotifyEngine;
  /**
   * The DEFAULT RunEvent sink for the openfang napi adapter's `launch_run`
   * driver (threaded to `OpenfangNapiOptions.runSink`). Bootstrap backs it with
   * the agent-os RunEvent bus (`source:'engine'`, LATE-BOUND — agent-os builds
   * AFTER engines; see `bootstrap/conductor-seams.ts` `createEngineRunSink`,
   * recoder-a094) so in-process openfang turns persist to the canonical event
   * log even when the caller threads no per-call sink. Absent (tests /
   * standalone) ⇒ the driver's warn-and-drop default applies (visible, truthful).
   */
  readonly openfangRunSink?: OpenfangRunEventSink;
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
   * Late-bind the DB-catalog config provider onto the tensorzero napi adapter so
   * the embedded gateway boots on `registry ∪ DB-catalog`, not just env
   * `TENSORZERO_MODELS` (bootstrap closes it over `inference.generateConfig()`).
   * TZ-SCOPED + typed: it downcasts the concrete `TensorzeroNapiAdapter` (the
   * generic `EngineClientPort` returned by `tensorzero()` learns nothing about
   * catalogs). A no-op when tensorzero is absent / not a napi adapter — the
   * embedded gateway then boots the env-only config (degrade-safe).
   */
  setTensorzeroCatalogProvider(provider: CatalogConfigProvider): void;
  /**
   * Late-bind the env→registry→config generation provider onto the tensorzero napi
   * adapter (§7 V5): bootstrap injects the inference domain's concrete
   * `tensorzero-config` module so the adapter's model-catalog + gateway boot-config
   * paths consume an injected port rather than two lazy `await import(...)` edges
   * into the inference domain. TZ-scoped downcast; a no-op when tensorzero is absent
   * / not a napi adapter (the model catalog then degrades truthfully).
   */
  setTensorzeroConfigProvider(provider: TensorzeroConfigProvider): void;
  /**
   * The cohesive openfang agent-engine facet (docs/modules/agent-engine.md):
   * health · run · continueRun · hands · publishEvent · workflow · verifyManifest
   * · memory. Pure verbs compose over the ONE napi transport (`OpenfangNapiAdapter`);
   * the two streaming verbs (run/continueRun) compose over the sibling
   * `launchOpenfangRun` function seam so a per-call RunEvent sink can be threaded
   * (the frozen `EngineClientPort.invoke` has no sink slot). The provenance gate
   * (built from the injected kernel) is pre-wired on BOTH the run path and the
   * adapter's `launch_run` option. Null only when the openfang engine is undeclared.
   */
  agentEngine(): AgentEngineService | null;
  /**
   * The cohesive pal agent-comms-brain facet (docs/modules/communication.md):
   * health · plan · routeModel · planLaunch · escalate · consensus · debate. The
   * pure verbs compose `@recoder/pal` in-proc (always live); the sidecar verbs
   * (consensus/debate) compose the `pal-mcp` transport and degrade truthfully to
   * `abstain` when it is down. The INFERENCE / CONDUCTOR / GOVERNANCE consumers
   * take it through their OWN narrow consumer-owned ports (they never import the
   * engines domain or `@recoder/pal`). Always non-null (the pure verbs need no
   * engine).
   */
  pal(): PalBrainService | null;
  /**
   * The DEEP, READ-ONLY tmux introspection port over the pinned tmux binary the
   * Conductor drives — the SAME server its headless `recoder-*` sessions live in.
   * The reconcile-GC substrate scan binds `listSessions()` over this to see the
   * REAL live-session set on the box (orphan detection after a restart). Null when
   * the tmux adapter is not declared (truthful skip — the scan then degrades to
   * "cannot see the substrate", never fabricates live work).
   */
  tmuxIntrospect(): TmuxIntrospectPort | null;
  /**
   * The dmux LAYOUT brain over the shared tmux server (`DmuxAdapter.layout()`) —
   * the SAME `select-layout`/`split-window` seam the `recoder.dmux` MCP tools bind
   * over. The conductor's F3 compare/parallel grid source consumes
   * `buildWorktreeGrid()` here to arrange one operator pane per sibling, EACH cwd'd
   * to its OWN worktree (never a hollow shared-repoPath grid). Independent of the
   * dmux TUI binary (the optional human viewer). Null when the dmux adapter is not
   * declared (truthful skip — the compare read then stays hint-less).
   */
  dmuxLayout(): DmuxLayoutPort | null;
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
   * Late-bind the observability telemetry seam onto the gated MCP host (BE-7.3).
   * Set post-construction by bootstrap (`engines.setMcpTelemetry({ metrics, tracer })`)
   * after observability exists. When wired, EVERY gated `host.call()` records
   * `mcp_tool_calls_total{server,tool,status}` + `mcp_tool_call_duration_seconds`
   * and opens a child span with server/tool/status attributes (`recordError` on
   * any non-completed outcome). Absent ⇒ the call path is untouched — never a
   * fabricated series; a telemetry fault NEVER alters a call outcome.
   */
  setMcpTelemetry(telemetry: McpHostTelemetry): void;
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
  /** Bind the live Loom-pane credential verifier used by the governed MCP edge. */
  setPaneCapabilityValidator(
    validator: (paneId: string, token: string) => Promise<boolean>,
  ): void;
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
  OpenfangProvenanceGate,
  OpenfangProvenanceRequest,
  OpenfangProvenanceDecision,
  OpenfangManifestProvenance,
} from './openfang-runtime.js';
export { getOpenfangEngine } from './openfang-native.js';
export type { OpenfangEngineInstance } from './openfang-native.js';

/**
 * The cohesive openfang agent-engine facet contract (docs/modules/agent-engine.md).
 * Re-exported so the composition root (bootstrap) can type `engines.agentEngine()`
 * and hand the facet to the conductor substrate — which consumes it structurally
 * through its own narrow consumer-owned port (it never imports the engines domain).
 */
export type {
  AgentEngineService,
  AgentEngineHealth,
  AgentTurnInput,
  AgentTurnResult,
  HandsView,
  WorkflowRegisterResult,
  WorkflowRunResult,
} from './ports/agent-engine.port.js';

/**
 * The cohesive pal agent-comms-brain facet contract (docs/modules/communication.md).
 * Re-exported so the composition root (bootstrap) can type `engines.pal()` and
 * hand it to the inference / conductor / governance consumers — each of which
 * consumes it structurally through its OWN narrow consumer-owned port (they never
 * import the engines domain or `@recoder/pal`).
 */
export type {
  PalBrainService,
  PalBrainHealth,
  PalPlanSpec,
  PalPlanDecision,
  PalCatalogModel,
  PalRoutingHint,
  PalRouteDecision,
  PalLaunchPlan,
  PalConsensusRequest,
  PalConsensusResult,
  PalEscalateInput,
  PalEscalateDecision,
} from './ports/pal-brain.port.js';

/**
 * The native openfang WORKFLOW driver (path b): promotes the engine's
 * event-driven `register_workflow`/`run_workflow` subsystem to a first-class,
 * degrade-safe control-plane capability the agent-workflows seam consumes. Absent
 * addon / boot failure ⇒ every method returns a truthful `{ available:false }`.
 */
export { createOpenfangWorkflowDriver } from './openfang-workflow.js';
export type {
  OpenfangWorkflowDriver,
  OpenfangWorkflowDeps,
  OpenfangWorkflowRegisterResult,
  OpenfangWorkflowRunResult,
} from './openfang-workflow.js';

/** The domain-tools bridge types bootstrap consumes when registering `mcp()` tools. */
export type {
  DomainToolsSource,
  DomainToolsRegistration,
} from './adapters/domain-tools-bridge.adapter.js';

/** The unified GitHub module surface (single truthful `GithubHealth` source). */
export type { GithubModule } from './github/index.js';
export type { GithubHealth, GithubFacetHealth } from './github/index.js';
