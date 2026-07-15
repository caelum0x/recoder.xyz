/**
 * `PalMcpAdapter` — the `EngineClientPort` over the REAL external Python
 * `pal-mcp-server` (multi-model orchestration + `clink`), reached over supervised
 * stdio-MCP. It REUSES the interop pal wiring
 * (`buildPalServerConfig` / `palServerAvailability` / `PAL_SERVER_ID`, the same
 * primitives `agent-os/mcp/interop-host.ts` uses) for truthful on-disk
 * availability + the external-server config, and delegates the process lifecycle
 * to the `SidecarSupervisorPort` (stdio-mcp variant → interop's
 * `ExternalMcpProcessManager`).
 *
 * Two real surfaces are exercised:
 *  1. The stdio pal server's multi-model tools (`chat`, `thinkdeep`, `consensus`,
 *     `planner`, `clink`, …): `invoke({ op:<tool>, input:<args> })` routes to the
 *     supervised process via the injected host `externalCall` (interop
 *     `tools/call`). Absent host wiring ⇒ a truthful `{ ok:false }`.
 *  2. The in-proc `pal.plan` governance decision: the exported binder wires
 *     `registerPalPlanMcpTools` over `@recoder/pal`'s pure `computePalPlanDecision`
 *     (deny-biased, never throws) so the `pal.plan` MCP tool is agent-callable
 *     behind the interop gate.
 *
 * DEGRADE-SAFE LAW: no pal venv on disk ⇒ `health()` is a truthful `down` with
 * the availability reason; no host caller wired ⇒ multi-model `invoke` fails
 * truthfully. Never fabricates a model answer, never throws the seam.
 */
import {
  buildPalServerConfig,
  palServerAvailability,
  PAL_SERVER_ID,
  type ExternalMcpServerConfig,
} from '@recoder/interop';
import { registerPalPlanMcpTools } from '@recoder/agent-mcp';
import type { McpToolRouter } from '@recoder/agent-mcp';
import { computePalPlanDecision } from '@recoder/pal';
import type { Logger } from '../../../../shared/logger.js';
import type { EnginesConfig } from '../../config.js';
import { isEngineEnabled } from '../../config.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import type { SidecarSpec, SidecarSupervisorPort } from '../../ports/sidecar-supervisor.port.js';
import { down, fail, ok, up, type EngineHealth, type InvokeResult } from '../../types.js';

/** The host's interop `tools/call` transport into the supervised stdio server. */
export type PalExternalCall = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface PalMcpAdapterDeps {
  readonly supervisor: SidecarSupervisorPort;
  readonly config: EnginesConfig;
  readonly log: Logger;
  /**
   * Route a stdio pal tool call through the host's `ExternalMcpProcessManager`
   * (interop `tools/call`). Injected by the composer once the host is built;
   * absent ⇒ multi-model `invoke` degrades to a truthful `{ ok:false }`.
   */
  readonly externalCall?: PalExternalCall;
  /** Env overlay for the pal process (provider keys), injected by bootstrap. */
  readonly palEnv?: Readonly<Record<string, string>>;
}

export class PalMcpAdapter extends EngineClientBase<unknown, unknown> {
  private readonly deps: PalMcpAdapterDeps;
  private readonly rootDir: string;

  constructor(deps: PalMcpAdapterDeps) {
    super('pal-mcp', 'sidecar');
    this.deps = deps;
    this.rootDir = deps.config.palRootDir ?? defaultPalRoot(deps.config.repoRoot);
  }

  /** Idempotent: ensure the supervised stdio pal server is started (degrade-safe). */
  override async start(): Promise<void> {
    if (!isEngineEnabled(this.deps.config, 'pal-mcp')) return;
    try {
      await this.deps.supervisor.ensureStarted(this.spec());
    } catch (err) {
      this.deps.log.warn({ err: message(err) }, 'pal-mcp ensureStarted failed — degrading (down)');
    }
  }

  override async stop(): Promise<void> {
    try {
      await this.deps.supervisor.stop('pal-mcp');
    } catch {
      // idempotent, degrade-safe
    }
  }

  async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
    if (!isEngineEnabled(this.deps.config, 'pal-mcp')) {
      return fail('pal-mcp engine disabled by config', 'disabled');
    }
    const tool = call.op?.trim();
    if (!tool) return fail('pal-mcp invoke requires an op (the pal tool name)', 'bad_op');

    // The in-proc governance decision is served locally (never needs the process).
    if (tool === 'plan' || tool === 'pal.plan') {
      return ok(computePalPlanDecision(call.input));
    }

    // Every other tool is a multi-model / clink call into the supervised stdio server.
    const availability = palServerAvailability({ rootDir: this.rootDir });
    if (!availability.available) {
      return fail(availability.reason ?? 'pal-mcp server unavailable on disk', 'unavailable');
    }
    if (!this.deps.externalCall) {
      return fail('pal-mcp host transport not wired (no externalCall) — cannot reach stdio server', 'unavailable');
    }
    // Make sure the process is supervised before we call into it.
    const handle = await this.deps.supervisor.ensureStarted(this.spec()).catch(() => null);
    if (!handle) return fail('pal-mcp stdio server not ready', 'unavailable');
    try {
      const args = (call.input ?? {}) as Record<string, unknown>;
      const result = await this.deps.externalCall(tool, args);
      return ok(result);
    } catch (err) {
      return fail(`pal-mcp ${tool} failed: ${message(err)}`);
    }
  }

  async health(): Promise<EngineHealth> {
    if (!isEngineEnabled(this.deps.config, 'pal-mcp')) {
      return down('pal-mcp', 'sidecar', 'pal-mcp engine disabled by config');
    }
    const availability = palServerAvailability({ rootDir: this.rootDir });
    if (!availability.available) {
      return down('pal-mcp', 'sidecar', availability.reason ?? 'pal venv/server absent', {
        bindingPath: availability.serverEntry,
      });
    }
    // On-disk available — confirm live supervisor state (stdio readiness).
    const sidecar = await this.deps.supervisor.health(this.spec()).catch(() => null);
    if (sidecar && sidecar.status === 'up') return sidecar;
    // Venv present but the process is not (yet) running: truthful degraded, not up.
    return {
      engineId: 'pal-mcp',
      transport: 'sidecar',
      status: 'degraded',
      reason: sidecar?.reason ?? 'pal server on disk but stdio process not ready',
      bindingPath: availability.serverEntry,
      checkedAt: new Date().toISOString(),
    };
  }

  /** The interop external-server config for the stdio pal server (composer registers it). */
  externalServerConfig(): ExternalMcpServerConfig {
    return buildPalServerConfig({
      rootDir: this.rootDir,
      ...(this.deps.palEnv ? { env: this.deps.palEnv } : {}),
    });
  }

  private spec(): SidecarSpec {
    const availability = palServerAvailability({ rootDir: this.rootDir });
    return {
      engineId: PAL_SERVER_ID,
      transport: 'stdio-mcp',
      pythonPath: availability.available ? availability.pythonPath : null,
      entrypoint: availability.serverEntry,
    };
  }
}

/**
 * The MCP binder factory for the in-proc `pal.plan` governance tool. Wires
 * `registerPalPlanMcpTools` over `@recoder/pal`'s pure `computePalPlanDecision`
 * (deny-biased, degrade-safe). The composer passes this binder into the host.
 */
export function palPlanEngineBinder(): (router: McpToolRouter) => void {
  return (router) =>
    registerPalPlanMcpTools(router, { plan: (taskSpec: unknown) => computePalPlanDecision(taskSpec) });
}

function defaultPalRoot(repoRoot: string | null): string {
  const base = repoRoot ?? process.cwd();
  return `${base}/engines/py/pal-mcp-server`;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
